import { beforeEach, describe, expect, it } from 'vitest';
import { OrderStatus, Role } from '@prisma/client';
import { api, errorCode } from './support/http';
import { authCookieFor } from './support/auth';
import {
  createOrder,
  createProduct,
  createUser,
  prisma,
  resetDatabase,
} from './support/db';

const ADMIN_ORDERS_URL = '/api/v1/admin/orders';

beforeEach(async () => {
  await resetDatabase();
});

async function seedOrderFixture(status: OrderStatus = OrderStatus.PENDING) {
  const admin = await createUser({
    email: 'admin@example.com',
    name: 'Admin One',
    role: Role.ADMIN,
  });
  const customer = await createUser({
    email: 'customer@example.com',
    name: 'Customer One',
    role: Role.CUSTOMER,
  });
  const product = await createProduct({
    name: 'Product A',
    price: '125.00',
    stockQuantity: 20,
    categoryName: 'Main Course',
  });
  const order = await createOrder({
    userId: customer.id,
    status,
    items: [{ productId: product.id, quantity: 2 }],
  });

  return {
    admin,
    customer,
    product,
    order,
    adminCookie: authCookieFor(admin),
    customerCookie: authCookieFor(customer),
  };
}

describe('F-04 Admin Order Status Management', () => {
  it('STS-F04-01 denies a CUSTOMER from listing all orders', async () => {
    const { customerCookie } = await seedOrderFixture();

    const response = await api()
      .get(ADMIN_ORDERS_URL)
      .set('Cookie', customerCookie);

    expect(response.status).toBe(403);
    expect(response.body.success).toBe(false);
    expect(errorCode(response)).toBe('FORBIDDEN_ROLE');
  });

  it('STS-F04-01 denies unauthenticated access with 401', async () => {
    await seedOrderFixture();

    const response = await api().get(ADMIN_ORDERS_URL);

    expect(response.status).toBe(401);
    expect(errorCode(response)).toBe('UNAUTHORIZED');
  });

  it('AC-F04-01 lets an ADMIN list all orders and filter by status', async () => {
    const { adminCookie, customer } = await seedOrderFixture();
    const product = await createProduct({
      name: 'Product B',
      price: '50.00',
      stockQuantity: 10,
      categoryName: 'Main Course',
    });

    await createOrder({
      userId: customer.id,
      status: OrderStatus.CONFIRMED,
      items: [{ productId: product.id, quantity: 1 }],
    });

    const allResponse = await api()
      .get(ADMIN_ORDERS_URL)
      .set('Cookie', adminCookie);

    expect(allResponse.status).toBe(200);
    expect(allResponse.body.success).toBe(true);
    expect(allResponse.body.data).toHaveLength(2);

    const filteredResponse = await api()
      .get(ADMIN_ORDERS_URL)
      .query({ status: 'CONFIRMED' })
      .set('Cookie', adminCookie);

    expect(filteredResponse.status).toBe(200);
    expect(filteredResponse.body.data).toHaveLength(1);
    expect(filteredResponse.body.data[0].status).toBe('CONFIRMED');
  });

  it('STS-F04-02 rejects PENDING -> COMPLETED with INVALID_STATUS_TRANSITION', async () => {
    const { adminCookie, order } = await seedOrderFixture(OrderStatus.PENDING);

    const response = await api()
      .patch(`${ADMIN_ORDERS_URL}/${order.id}/status`)
      .set('Cookie', adminCookie)
      .send({ status: 'COMPLETED' });

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
    expect(errorCode(response)).toBe('INVALID_STATUS_TRANSITION');

    const unchanged = await prisma.order.findUniqueOrThrow({
      where: { id: order.id },
    });
    expect(unchanged.status).toBe(OrderStatus.PENDING);

    const history = await prisma.orderStatusHistory.findMany({
      where: { orderId: order.id },
    });
    expect(history).toHaveLength(0);
  });

  it('STS-F04-03 rejects updating a CANCELLED order', async () => {
    const { adminCookie, order } = await seedOrderFixture(OrderStatus.CANCELLED);

    const response = await api()
      .patch(`${ADMIN_ORDERS_URL}/${order.id}/status`)
      .set('Cookie', adminCookie)
      .send({ status: 'CONFIRMED' });

    expect(response.status).toBe(400);

    const unchanged = await prisma.order.findUniqueOrThrow({
      where: { id: order.id },
    });
    expect(unchanged.status).toBe(OrderStatus.CANCELLED);
  });

  it('AC-F04-03 rejects updating a COMPLETED order', async () => {
    const { adminCookie, order } = await seedOrderFixture(OrderStatus.COMPLETED);

    const response = await api()
      .patch(`${ADMIN_ORDERS_URL}/${order.id}/status`)
      .set('Cookie', adminCookie)
      .send({ status: 'CONFIRMED' });

    expect(response.status).toBe(400);

    const unchanged = await prisma.order.findUniqueOrThrow({
      where: { id: order.id },
    });
    expect(unchanged.status).toBe(OrderStatus.COMPLETED);
  });

  it('AC-F04-02 follows the allowed state machine and writes an audit log', async () => {
    const { adminCookie, order } = await seedOrderFixture(OrderStatus.PENDING);
    const transitions = [
      'CONFIRMED',
      'PREPARING',
      'READY',
      'COMPLETED',
    ] as const;

    let previousStatus = 'PENDING';

    for (const nextStatus of transitions) {
      const response = await api()
        .patch(`${ADMIN_ORDERS_URL}/${order.id}/status`)
        .set('Cookie', adminCookie)
        .send({ status: nextStatus });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toMatchObject({
        orderId: order.id,
        previousStatus,
        currentStatus: nextStatus,
      });
      expect(typeof response.body.data.updatedAt).toBe('string');

      previousStatus = nextStatus;
    }

    const updatedOrder = await prisma.order.findUniqueOrThrow({
      where: { id: order.id },
    });
    expect(updatedOrder.status).toBe(OrderStatus.COMPLETED);

    const history = await prisma.orderStatusHistory.findMany({
      where: { orderId: order.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(history).toHaveLength(transitions.length);
    expect(history.map((entry) => entry.newStatus)).toEqual([
      OrderStatus.CONFIRMED,
      OrderStatus.PREPARING,
      OrderStatus.READY,
      OrderStatus.COMPLETED,
    ]);
  });

  it('AC-F04-01 denies a CUSTOMER from updating an order status', async () => {
    const { customerCookie, order } = await seedOrderFixture();

    const response = await api()
      .patch(`${ADMIN_ORDERS_URL}/${order.id}/status`)
      .set('Cookie', customerCookie)
      .send({ status: 'CONFIRMED' });

    expect(response.status).toBe(403);
    expect(errorCode(response)).toBe('FORBIDDEN_ROLE');
  });

  it('AC-F04-02 rejects an unknown status value with 400', async () => {
    const { adminCookie, order } = await seedOrderFixture();

    const response = await api()
      .patch(`${ADMIN_ORDERS_URL}/${order.id}/status`)
      .set('Cookie', adminCookie)
      .send({ status: 'NOT_A_REAL_STATUS' });

    expect(response.status).toBe(400);
  });
});
