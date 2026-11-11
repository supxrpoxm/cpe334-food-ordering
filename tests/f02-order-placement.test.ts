import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OrderStatus, Role } from '@prisma/client';
import { api, errorCode } from './support/http';
import {
  authCookieFor,
  cookieFor,
  corruptSignature,
  expiredTokenFor,
  signToken,
  wrongSecretTokenFor,
} from './support/auth';
import {
  createProduct,
  createUser,
  dropTestTriggers,
  getStock,
  installOrderItemFailureTrigger,
  prisma,
  resetDatabase,
} from './support/db';

const ORDERS_URL = '/api/orders';

beforeEach(async () => {
  await resetDatabase();
});

afterEach(async () => {
  vi.unstubAllGlobals();
  await dropTestTriggers();
});

async function seedCustomerAndProduct(options?: {
  price?: string;
  stockQuantity?: number;
}) {
  const customer = await createUser({
    email: 'customer@example.com',
    name: 'Customer One',
    role: Role.CUSTOMER,
  });
  const product = await createProduct({
    name: 'Product A',
    price: options?.price ?? '125.00',
    stockQuantity: options?.stockQuantity ?? 10,
    categoryName: 'Main Course',
  });

  return {
    customer,
    product,
    cookie: authCookieFor(customer),
  };
}

function postOrder(cookie: string, body: object) {
  return api().post(ORDERS_URL).set('Cookie', cookie).send(body);
}

async function expectNoOrders() {
  expect(await prisma.order.count()).toBe(0);
  expect(await prisma.orderItem.count()).toBe(0);
}

describe('F-02 Customer Order Placement', () => {
  it('STS-F02-01 creates a PENDING order using server-side price and decrements stock', async () => {
    const { customer, product, cookie } = await seedCustomerAndProduct();

    const response = await postOrder(cookie, {
      items: [{ productId: product.id, quantity: 2 }],
    });

    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({
      userId: customer.id,
      status: 'PENDING',
      totalAmount: '250.00',
    });
    expect(response.body.data.items).toHaveLength(1);
    expect(response.body.data.items[0]).toMatchObject({
      productId: product.id,
      quantity: 2,
      unitPrice: '125.00',
    });

    expect(await getStock(product.id)).toBe(8);

    const storedOrder = await prisma.order.findUniqueOrThrow({
      where: { id: response.body.data.id },
      include: { items: true },
    });
    expect(storedOrder.userId).toBe(customer.id);
    expect(storedOrder.status).toBe(OrderStatus.PENDING);
    expect(storedOrder.totalAmount.toString()).toBe('250');
    expect(storedOrder.items).toHaveLength(1);
    expect(storedOrder.items[0].unitPrice.toString()).toBe('125');
  });

  it('STS-F02-02 rejects an empty items array', async () => {
    const { product, cookie } = await seedCustomerAndProduct();

    const response = await postOrder(cookie, { items: [] });

    expect(response.status).toBe(400);
    expect(errorCode(response)).toBe('VALIDATION_ERROR');
    await expectNoOrders();
    expect(await getStock(product.id)).toBe(10);
  });

  it('STS-F02-02 rejects quantity 0', async () => {
    const { product, cookie } = await seedCustomerAndProduct();

    const response = await postOrder(cookie, {
      items: [{ productId: product.id, quantity: 0 }],
    });

    expect(response.status).toBe(400);
    expect(errorCode(response)).toBe('VALIDATION_ERROR');
    await expectNoOrders();
    expect(await getStock(product.id)).toBe(10);
  });

  it('STS-F02-02 rejects negative quantity', async () => {
    const { product, cookie } = await seedCustomerAndProduct();

    const response = await postOrder(cookie, {
      items: [{ productId: product.id, quantity: -1 }],
    });

    expect(response.status).toBe(400);
    expect(errorCode(response)).toBe('VALIDATION_ERROR');
    await expectNoOrders();
    expect(await getStock(product.id)).toBe(10);
  });

  it('STS-F02-02 rejects non-integer quantity 1.5', async () => {
    const { product, cookie } = await seedCustomerAndProduct();

    const response = await postOrder(cookie, {
      items: [{ productId: product.id, quantity: 1.5 }],
    });

    expect(response.status).toBe(400);
    expect(errorCode(response)).toBe('VALIDATION_ERROR');
    await expectNoOrders();
    expect(await getStock(product.id)).toBe(10);
  });

  it('STS-F02-02 rejects items that are not an array', async () => {
    const { product, cookie } = await seedCustomerAndProduct();

    const response = await postOrder(cookie, {
      items: { productId: product.id, quantity: 1 },
    });

    expect(response.status).toBe(400);
    expect(errorCode(response)).toBe('VALIDATION_ERROR');
    await expectNoOrders();
    expect(await getStock(product.id)).toBe(10);
  });

  it('STS-F02-02 rejects duplicate productId values', async () => {
    const { product, cookie } = await seedCustomerAndProduct();

    const response = await postOrder(cookie, {
      items: [
        { productId: product.id, quantity: 1 },
        { productId: product.id, quantity: 2 },
      ],
    });

    expect(response.status).toBe(400);
    expect(errorCode(response)).toBe('DUPLICATE_ITEM');
    await expectNoOrders();
    expect(await getStock(product.id)).toBe(10);
  });

  it('STS-F02-03 returns 404 PRODUCT_NOT_FOUND for an unknown productId', async () => {
    const { product, cookie } = await seedCustomerAndProduct();

    const response = await postOrder(cookie, {
      items: [
        {
          productId: '00000000-0000-4000-8000-000000000000',
          quantity: 1,
        },
      ],
    });

    expect(response.status).toBe(404);
    expect(errorCode(response)).toBe('PRODUCT_NOT_FOUND');
    await expectNoOrders();
    expect(await getStock(product.id)).toBe(10);
  });

  it('STS-F02-04 rejects client-supplied unitPrice', async () => {
    const { product, cookie } = await seedCustomerAndProduct();

    const response = await postOrder(cookie, {
      items: [{ productId: product.id, quantity: 1, unitPrice: '1.00' }],
    });

    expect(response.status).toBe(400);
    expect(errorCode(response)).toBe('CLIENT_PRICE_NOT_ALLOWED');
    await expectNoOrders();

    const storedProduct = await prisma.product.findUniqueOrThrow({
      where: { id: product.id },
    });
    expect(storedProduct.price.toString()).toBe('125');
  });

  it('STS-F02-04 rejects client-supplied totalAmount', async () => {
    const { product, cookie } = await seedCustomerAndProduct();

    const response = await postOrder(cookie, {
      items: [{ productId: product.id, quantity: 1 }],
      totalAmount: '1.00',
    });

    expect(response.status).toBe(400);
    expect(errorCode(response)).toBe('CLIENT_PRICE_NOT_ALLOWED');
    await expectNoOrders();
    expect(await getStock(product.id)).toBe(10);
  });

  it('STS-F02-04 rejects client-supplied price field', async () => {
    const { product, cookie } = await seedCustomerAndProduct();

    const response = await postOrder(cookie, {
      items: [{ productId: product.id, quantity: 1, price: '1.00' }],
    });

    expect(response.status).toBe(400);
    expect(errorCode(response)).toBe('CLIENT_PRICE_NOT_ALLOWED');
    await expectNoOrders();
  });

  it('STS-F02-04 rejects client-supplied status and never accepts PAID', async () => {
    const { product, cookie } = await seedCustomerAndProduct();

    const response = await postOrder(cookie, {
      items: [{ productId: product.id, quantity: 1 }],
      status: 'PAID',
    });

    expect(response.status).toBe(400);
    expect(errorCode(response)).toBe('VALIDATION_ERROR');
    await expectNoOrders();
    expect(await getStock(product.id)).toBe(10);
  });

  it('STS-F02-05 rejects an unauthenticated request with 401', async () => {
    const { product } = await seedCustomerAndProduct();

    const response = await api()
      .post(ORDERS_URL)
      .send({ items: [{ productId: product.id, quantity: 1 }] });

    expect(response.status).toBe(401);
    expect(errorCode(response)).toBe('UNAUTHORIZED');
    await expectNoOrders();
  });

  it('STS-F02-05 rejects an ADMIN with 403 FORBIDDEN_ROLE', async () => {
    const admin = await createUser({
      email: 'admin@example.com',
      name: 'Admin One',
      role: Role.ADMIN,
    });
    const product = await createProduct({
      name: 'Product A',
      price: '125.00',
      stockQuantity: 10,
      categoryName: 'Main Course',
    });

    const response = await postOrder(authCookieFor(admin), {
      items: [{ productId: product.id, quantity: 1 }],
    });

    expect(response.status).toBe(403);
    expect(errorCode(response)).toBe('FORBIDDEN_ROLE');
    await expectNoOrders();
  });

  it('STS-F02-05 rejects creating an order for another userId', async () => {
    const { customer, product, cookie } = await seedCustomerAndProduct();
    const otherCustomer = await createUser({
      email: 'customer2@example.com',
      name: 'Customer Two',
      role: Role.CUSTOMER,
    });

    const response = await postOrder(cookie, {
      userId: otherCustomer.id,
      items: [{ productId: product.id, quantity: 1 }],
    });

    expect(response.status).toBe(403);
    expect(errorCode(response)).toBe('FORBIDDEN_RESOURCE');
    await expectNoOrders();
    expect(await getStock(product.id)).toBe(10);

    expect(response.body.data?.userId).not.toBe(otherCustomer.id);
    expect(customer.id).not.toBe(otherCustomer.id);
  });

  it('STS-F02-06 rejects an expired JWT with 401', async () => {
    const { customer, product } = await seedCustomerAndProduct();

    const response = await postOrder(
      cookieFor(expiredTokenFor(customer)),
      { items: [{ productId: product.id, quantity: 1 }] },
    );

    expect(response.status).toBe(401);
    expect(errorCode(response)).toBe('UNAUTHORIZED');
    await expectNoOrders();
  });

  it('STS-F02-06 rejects a JWT with a corrupted signature', async () => {
    const { customer, product } = await seedCustomerAndProduct();
    const validToken = signToken({
      userId: customer.id,
      role: customer.role,
    });

    const response = await postOrder(cookieFor(corruptSignature(validToken)), {
      items: [{ productId: product.id, quantity: 1 }],
    });

    expect(response.status).toBe(401);
    expect(errorCode(response)).toBe('UNAUTHORIZED');
    await expectNoOrders();
  });

  it('STS-F02-06 rejects a malformed JWT with 401', async () => {
    const { product } = await seedCustomerAndProduct();

    const response = await postOrder(cookieFor('not-a-real-jwt'), {
      items: [{ productId: product.id, quantity: 1 }],
    });

    expect(response.status).toBe(401);
    expect(errorCode(response)).toBe('UNAUTHORIZED');
    await expectNoOrders();
  });

  it('STS-F02-06 rejects a JWT signed with a different secret', async () => {
    const { customer, product } = await seedCustomerAndProduct();

    const response = await postOrder(
      cookieFor(wrongSecretTokenFor(customer)),
      { items: [{ productId: product.id, quantity: 1 }] },
    );

    expect(response.status).toBe(401);
    expect(errorCode(response)).toBe('UNAUTHORIZED');
    await expectNoOrders();
  });

  it('STS-F02-07 succeeds when quantity equals stock and leaves stock at 0', async () => {
    const customer = await createUser({
      email: 'customer@example.com',
      name: 'Customer One',
      role: Role.CUSTOMER,
    });
    const product = await createProduct({
      name: 'Product B',
      price: '100.00',
      stockQuantity: 5,
      categoryName: 'Main Course',
    });

    const response = await postOrder(authCookieFor(customer), {
      items: [{ productId: product.id, quantity: 5 }],
    });

    expect(response.status).toBe(201);
    expect(response.body.data.totalAmount).toBe('500.00');
    expect(response.body.data.items[0].unitPrice).toBe('100.00');
    expect(await getStock(product.id)).toBe(0);

    const orderItems = await prisma.orderItem.findMany({
      where: { orderId: response.body.data.id },
    });
    expect(orderItems).toHaveLength(1);
    expect(orderItems[0].quantity).toBe(5);
  });

  it('STS-F02-08 rejects quantity greater than stock with 409 and no writes', async () => {
    const customer = await createUser({
      email: 'customer@example.com',
      name: 'Customer One',
      role: Role.CUSTOMER,
    });
    const product = await createProduct({
      name: 'Product B',
      price: '100.00',
      stockQuantity: 5,
      categoryName: 'Main Course',
    });

    const response = await postOrder(authCookieFor(customer), {
      items: [{ productId: product.id, quantity: 6 }],
    });

    expect(response.status).toBe(409);
    expect(errorCode(response)).toBe('INSUFFICIENT_STOCK');
    await expectNoOrders();
    expect(await getStock(product.id)).toBe(5);
  });

  it('STS-F02-09 rolls back all items when one item has insufficient stock', async () => {
    const customer = await createUser({
      email: 'customer@example.com',
      name: 'Customer One',
      role: Role.CUSTOMER,
    });
    const productC = await createProduct({
      name: 'Product C',
      price: '50.00',
      stockQuantity: 10,
      categoryName: 'Main Course',
    });
    const productD = await createProduct({
      name: 'Product D',
      price: '60.00',
      stockQuantity: 1,
      categoryName: 'Main Course',
    });

    const response = await postOrder(authCookieFor(customer), {
      items: [
        { productId: productC.id, quantity: 2 },
        { productId: productD.id, quantity: 2 },
      ],
    });

    expect(response.status).toBe(409);
    expect(errorCode(response)).toBe('INSUFFICIENT_STOCK');
    await expectNoOrders();
    expect(await getStock(productC.id)).toBe(10);
    expect(await getStock(productD.id)).toBe(1);
  });

  it('STS-F02-10 creates PENDING without any payment gateway call or payment fields', async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ ok: true })));
    vi.stubGlobal('fetch', fetchSpy);

    const { product, cookie } = await seedCustomerAndProduct();

    const response = await postOrder(cookie, {
      items: [{ productId: product.id, quantity: 1 }],
    });

    expect(response.status).toBe(201);
    expect(response.body.data.status).toBe('PENDING');
    expect(JSON.stringify(response.body)).not.toMatch(/payment/i);
    expect(fetchSpy).not.toHaveBeenCalled();

    const storedOrder = await prisma.order.findUniqueOrThrow({
      where: { id: response.body.data.id },
    });
    expect(storedOrder.status).toBe(OrderStatus.PENDING);
    expect(storedOrder.status).not.toBe(OrderStatus.PAID);
  });

  it('STS-F02-11 allows only one winner when two customers race for the last item', async () => {
    const customerA = await createUser({
      email: 'customer-a@example.com',
      name: 'Customer A',
      role: Role.CUSTOMER,
    });
    const customerB = await createUser({
      email: 'customer-b@example.com',
      name: 'Customer B',
      role: Role.CUSTOMER,
    });
    const product = await createProduct({
      name: 'Product E',
      price: '30.00',
      stockQuantity: 1,
      categoryName: 'Main Course',
    });

    const [responseA, responseB] = await Promise.all([
      postOrder(authCookieFor(customerA), {
        items: [{ productId: product.id, quantity: 1 }],
      }),
      postOrder(authCookieFor(customerB), {
        items: [{ productId: product.id, quantity: 1 }],
      }),
    ]);

    const statuses = [responseA.status, responseB.status].sort((a, b) => a - b);
    expect(statuses).toEqual([201, 409]);

    const failedResponse =
      responseA.status === 409 ? responseA : responseB;
    expect(errorCode(failedResponse)).toBe('INSUFFICIENT_STOCK');

    expect(await getStock(product.id)).toBe(0);
    const orders = await prisma.order.findMany({
      include: { items: true },
    });
    expect(orders).toHaveLength(1);
    expect(orders[0].items).toHaveLength(1);
    expect([customerA.id, customerB.id]).toContain(orders[0].userId);
  });

  it('STS-F02-12 rolls back when a database error occurs while creating OrderItem', async () => {
    const customer = await createUser({
      email: 'customer@example.com',
      name: 'Customer One',
      role: Role.CUSTOMER,
    });
    const productA = await createProduct({
      name: 'Product A',
      price: '125.00',
      stockQuantity: 10,
      categoryName: 'Main Course',
    });
    const productB = await createProduct({
      name: 'Product B',
      price: '100.00',
      stockQuantity: 10,
      categoryName: 'Main Course',
    });

    await installOrderItemFailureTrigger(productB.id);

    const response = await postOrder(authCookieFor(customer), {
      items: [
        { productId: productA.id, quantity: 2 },
        { productId: productB.id, quantity: 2 },
      ],
    });

    expect(response.status).toBe(500);
    expect(errorCode(response)).toBe('INTERNAL_ERROR');
    await expectNoOrders();
    expect(await getStock(productA.id)).toBe(10);
    expect(await getStock(productB.id)).toBe(10);
  });
});
