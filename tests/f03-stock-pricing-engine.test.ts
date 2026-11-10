import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Role } from '@prisma/client';
import {
  createOrderWithStockAndPricing,
  type CreateOrderInput,
} from '../server/src/services/orderService';
import {
  createProduct,
  createUser,
  dropTestTriggers,
  getStock,
  installOrderItemFailureTrigger,
  prisma,
  resetDatabase,
  setProductPrice,
} from './support/db';

beforeEach(async () => {
  await resetDatabase();
});

afterEach(async () => {
  await dropTestTriggers();
});

type EngineSuccess = {
  ok: true;
  value: Awaited<ReturnType<typeof createOrderWithStockAndPricing>>;
};

type EngineFailure = {
  ok: false;
  error: { code?: string; message?: string };
};

type EngineResult = EngineSuccess | EngineFailure;

async function callEngine(
  userId: string,
  items: unknown[],
  extra: Record<string, unknown> = {},
): Promise<EngineResult> {
  const input = {
    userId,
    items,
    ...extra,
  } as unknown as CreateOrderInput;

  try {
    return {
      ok: true,
      value: await createOrderWithStockAndPricing(input),
    };
  } catch (error) {
    return {
      ok: false,
      error: error as { code?: string; message?: string },
    };
  }
}

async function expectNoOrders() {
  expect(await prisma.order.count()).toBe(0);
  expect(await prisma.orderItem.count()).toBe(0);
}

async function seedCustomerAndProduct(options?: {
  name?: string;
  price?: string;
  stockQuantity?: number;
}) {
  const customer = await createUser({
    email: 'customer@example.com',
    name: 'Customer One',
    role: Role.CUSTOMER,
  });
  const product = await createProduct({
    name: options?.name ?? 'Product A',
    price: options?.price ?? '125.00',
    stockQuantity: options?.stockQuantity ?? 3,
    categoryName: 'Main Course',
  });

  return { customer, product };
}

describe('F-03 Server-side Stock & Pricing Engine', () => {
  it('STS-F03-01 rejects quantity greater than stock without writes', async () => {
    const { customer, product } = await seedCustomerAndProduct({
      stockQuantity: 3,
    });

    const result = await callEngine(customer.id, [
      { productId: product.id, quantity: 4 },
    ]);

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    expect(result.error.code).toBe('INSUFFICIENT_STOCK');
    await expectNoOrders();
    expect(await getStock(product.id)).toBe(3);
  });

  it('STS-F03-02 accepts quantity equal to stock and leaves stock at 0', async () => {
    const { customer, product } = await seedCustomerAndProduct({
      stockQuantity: 3,
    });

    const result = await callEngine(customer.id, [
      { productId: product.id, quantity: 3 },
    ]);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw result.error;
    }

    expect(result.value.totalAmount).toBe('375.00');
    expect(result.value.items[0]).toMatchObject({
      productId: product.id,
      quantity: 3,
      unitPrice: '125.00',
    });

    expect(await getStock(product.id)).toBe(0);

    const storedOrder = await prisma.order.findUniqueOrThrow({
      where: { id: result.value.orderId },
      include: { items: true },
    });
    expect(storedOrder.totalAmount.toString()).toBe('375');
    expect(storedOrder.items[0].unitPrice.toString()).toBe('125');
  });

  it.each([
    ['zero', 0],
    ['negative', -1],
    ['decimal', 1.5],
    ['string', '2'],
  ])('STS-F03-03 rejects invalid quantity (%s)', async (_label, quantity) => {
    const { customer, product } = await seedCustomerAndProduct({
      stockQuantity: 5,
    });

    const result = await callEngine(customer.id, [
      { productId: product.id, quantity },
    ]);

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    expect(result.error.code).toBe('VALIDATION_ERROR');
    await expectNoOrders();
    expect(await getStock(product.id)).toBe(5);
  });

  it('STS-F03-04 prevents oversell for two concurrent requests on stock 1', async () => {
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
      name: 'Product B',
      price: '100.00',
      stockQuantity: 1,
      categoryName: 'Main Course',
    });

    const [resultA, resultB] = await Promise.all([
      callEngine(customerA.id, [{ productId: product.id, quantity: 1 }]),
      callEngine(customerB.id, [{ productId: product.id, quantity: 1 }]),
    ]);

    expect([resultA.ok, resultB.ok].sort()).toEqual([false, true]);

    const failed = resultA.ok ? resultB : resultA;
    expect(failed.ok).toBe(false);
    if (!failed.ok) {
      expect(failed.error.code).toBe('INSUFFICIENT_STOCK');
    }

    expect(await getStock(product.id)).toBe(0);
    expect(await prisma.order.count()).toBe(1);
    expect(await prisma.orderItem.count()).toBe(1);
  });

  it('STS-F03-05 prices multiple items from the database with Decimal totals', async () => {
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

    const result = await callEngine(customer.id, [
      { productId: productA.id, quantity: 2 },
      { productId: productB.id, quantity: 1 },
    ]);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw result.error;
    }

    expect(result.value.totalAmount).toBe('350.00');

    const storedOrder = await prisma.order.findUniqueOrThrow({
      where: { id: result.value.orderId },
      include: { items: { orderBy: { unitPrice: 'desc' } } },
    });
    expect(storedOrder.items).toHaveLength(2);
    expect(
      storedOrder.items.map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: item.unitPrice.toString(),
      })),
    ).toEqual([
      { productId: productA.id, quantity: 2, unitPrice: '125' },
      { productId: productB.id, quantity: 1, unitPrice: '100' },
    ]);
  });

  it('STS-F03-06 rejects client price fields at the engine layer', async () => {
    const { customer, product } = await seedCustomerAndProduct({
      stockQuantity: 10,
    });

    const result = await callEngine(
      customer.id,
      [{ productId: product.id, quantity: 1, unitPrice: '1.00' }],
      { totalAmount: '1.00' },
    );

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    expect(result.error.code).toBe('CLIENT_PRICE_NOT_ALLOWED');
    await expectNoOrders();

    const storedProduct = await prisma.product.findUniqueOrThrow({
      where: { id: product.id },
    });
    expect(storedProduct.price.toString()).toBe('125');
  });

  it('STS-F03-07 snapshots unitPrice and keeps historical orders unchanged after a price change', async () => {
    const { customer, product } = await seedCustomerAndProduct({
      price: '125.00',
      stockQuantity: 10,
    });

    const firstResult = await callEngine(customer.id, [
      { productId: product.id, quantity: 2 },
    ]);

    expect(firstResult.ok).toBe(true);
    if (!firstResult.ok) {
      throw firstResult.error;
    }

    await setProductPrice(product.id, '150.00');

    const secondResult = await callEngine(customer.id, [
      { productId: product.id, quantity: 1 },
    ]);

    expect(secondResult.ok).toBe(true);
    if (!secondResult.ok) {
      throw secondResult.error;
    }

    const firstOrder = await prisma.order.findUniqueOrThrow({
      where: { id: firstResult.value.orderId },
      include: { items: true },
    });
    expect(firstOrder.totalAmount.toString()).toBe('250');
    expect(firstOrder.items[0].unitPrice.toString()).toBe('125');

    const secondOrder = await prisma.order.findUniqueOrThrow({
      where: { id: secondResult.value.orderId },
      include: { items: true },
    });
    expect(secondOrder.totalAmount.toString()).toBe('150');
    expect(secondOrder.items[0].unitPrice.toString()).toBe('150');
  });

  it('STS-F03-08 rolls back the whole transaction when the second OrderItem insert fails', async () => {
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

    const result = await callEngine(customer.id, [
      { productId: productA.id, quantity: 2 },
      { productId: productB.id, quantity: 2 },
    ]);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('INTERNAL_ERROR');
    }

    await expectNoOrders();
    expect(await getStock(productA.id)).toBe(10);
    expect(await getStock(productB.id)).toBe(10);
  });

  it('STS-F03-09 keeps all stocks unchanged when one of multiple items is short', async () => {
    const customer = await createUser({
      email: 'customer@example.com',
      name: 'Customer One',
      role: Role.CUSTOMER,
    });
    const productA = await createProduct({
      name: 'Product A',
      price: '50.00',
      stockQuantity: 10,
      categoryName: 'Main Course',
    });
    const productB = await createProduct({
      name: 'Product B',
      price: '60.00',
      stockQuantity: 1,
      categoryName: 'Main Course',
    });

    const result = await callEngine(customer.id, [
      { productId: productA.id, quantity: 2 },
      { productId: productB.id, quantity: 2 },
    ]);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('INSUFFICIENT_STOCK');
    }

    await expectNoOrders();
    expect(await getStock(productA.id)).toBe(10);
    expect(await getStock(productB.id)).toBe(1);
  });

  it('STS-F03-10 processes five concurrent requests without lost updates', async () => {
    const customers = await Promise.all(
      Array.from({ length: 5 }, (_, index) =>
        createUser({
          email: `customer-${index + 1}@example.com`,
          name: `Customer ${index + 1}`,
          role: Role.CUSTOMER,
        }),
      ),
    );
    const product = await createProduct({
      name: 'Product C',
      price: '40.00',
      stockQuantity: 5,
      categoryName: 'Main Course',
    });

    const results = await Promise.all(
      customers.map((customer) =>
        callEngine(customer.id, [
          { productId: product.id, quantity: 1 },
        ]),
      ),
    );

    expect(results.every((result) => result.ok)).toBe(true);
    expect(await getStock(product.id)).toBe(0);
    expect(await prisma.order.count()).toBe(5);
    expect(await prisma.orderItem.count()).toBe(5);

    const items = await prisma.orderItem.findMany({
      where: { productId: product.id },
    });
    expect(items).toHaveLength(5);
    expect(items.every((item) => item.quantity === 1)).toBe(true);
  });

  it('STS-F03-11 returns PRODUCT_NOT_FOUND for an unknown product', async () => {
    const customer = await createUser({
      email: 'customer@example.com',
      name: 'Customer One',
      role: Role.CUSTOMER,
    });

    const result = await callEngine(customer.id, [
      {
        productId: '00000000-0000-4000-8000-000000000000',
        quantity: 1,
      },
    ]);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('PRODUCT_NOT_FOUND');
    }

    await expectNoOrders();
  });

  it('STS-F03-12 rejects a total that exceeds Decimal(10,2) range', async () => {
    const { customer, product } = await seedCustomerAndProduct({
      price: '99999999.99',
      stockQuantity: 10,
    });

    const result = await callEngine(customer.id, [
      { productId: product.id, quantity: 2 },
    ]);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('AMOUNT_OUT_OF_RANGE');
    }

    await expectNoOrders();
    expect(await getStock(product.id)).toBe(10);
  });
});
