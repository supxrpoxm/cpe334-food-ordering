import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import bcrypt from 'bcryptjs';
import { OrderStatus, Role } from '@prisma/client';
import { api, errorCode } from './support/http';
import {
  accessTokenFor,
  cookieFor,
  cookieValue,
  corruptSignature,
  expiredTokenFor,
  findSetCookie,
  signToken,
  signTokenWithSecret,
  tamperPayload,
  wrongSecretTokenFor,
} from './support/auth';
import {
  createOrder,
  createProduct,
  createUser,
  prisma,
  resetDatabase,
} from './support/db';
import {
  BCRYPT_SALT_ROUNDS,
  TEST_PASSWORD,
} from './support/env';

const LOGIN_URL = '/api/auth/login';
const LOGOUT_URL = '/api/auth/logout';
const ORDERS_URL = '/api/orders';
const PRODUCTS_URL = '/api/v1/products';
const ADMIN_ORDERS_URL = '/api/v1/admin/orders';

beforeEach(async () => {
  await resetDatabase();
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function login(
  email: string,
  password: string = TEST_PASSWORD,
) {
  return api().post(LOGIN_URL).send({ email, password });
}

async function loginToken(
  email: string,
  password: string = TEST_PASSWORD,
): Promise<string> {
  const response = await login(email, password);

  expect(response.status).toBe(200);

  const token = cookieValue(response, 'access_token');
  expect(token).toBeTruthy();

  return token as string;
}

async function seedCustomer(email = 'customer@example.com') {
  return createUser({
    email,
    name: 'Customer One',
    role: Role.CUSTOMER,
    password: TEST_PASSWORD,
  });
}

describe('F-05 Role-Based Access Control & Auth', () => {
  it('STS-F05-01 logs in with valid credentials and issues an HttpOnly JWT cookie', async () => {
    const customer = await seedCustomer();

    const response = await login(customer.email);

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      id: customer.id,
      email: customer.email,
      name: customer.name,
      role: 'CUSTOMER',
    });
    expect(response.body.data.passwordHash).toBeUndefined();
    expect(response.body.data.password).toBeUndefined();
    expect(JSON.stringify(response.body)).not.toContain('passwordHash');

    const accessCookie = findSetCookie(response, 'access_token');
    expect(accessCookie).toBeTruthy();
    expect(accessCookie).toMatch(/HttpOnly/i);
    expect(accessCookie).toMatch(/SameSite=Lax/i);
    expect(accessCookie).toMatch(/Path=\//i);
    expect(cookieValue(response, 'access_token')).toBeTruthy();
  });

  it('STS-F05-02 rejects a wrong password with generic INVALID_CREDENTIALS', async () => {
    const customer = await seedCustomer();

    const response = await login(customer.email, 'WrongPassword123!');

    expect(response.status).toBe(401);
    expect(errorCode(response)).toBe('INVALID_CREDENTIALS');
    expect(response.body.error.message).toMatch(/invalid email or password/i);
    expect(findSetCookie(response, 'access_token')).toBeUndefined();
  });

  it('STS-F05-02 rejects an unknown email with the same generic message', async () => {
    const customer = await seedCustomer();

    const wrongPasswordResponse = await login(
      customer.email,
      'WrongPassword123!',
    );
    const unknownEmailResponse = await login(
      'does-not-exist@example.com',
      TEST_PASSWORD,
    );

    expect(unknownEmailResponse.status).toBe(401);
    expect(errorCode(unknownEmailResponse)).toBe('INVALID_CREDENTIALS');
    expect(unknownEmailResponse.body.error.message).toBe(
      wrongPasswordResponse.body.error.message,
    );
    expect(findSetCookie(unknownEmailResponse, 'access_token')).toBeUndefined();
  });

  it('STS-F05-02 rejects a missing email with 400 VALIDATION_ERROR', async () => {
    await seedCustomer();

    const response = await api()
      .post(LOGIN_URL)
      .send({ password: TEST_PASSWORD });

    expect(response.status).toBe(400);
    expect(errorCode(response)).toBe('VALIDATION_ERROR');
    expect(findSetCookie(response, 'access_token')).toBeUndefined();
  });

  it('STS-F05-02 rejects a missing password with 400 VALIDATION_ERROR', async () => {
    const customer = await seedCustomer();

    const response = await api()
      .post(LOGIN_URL)
      .send({ email: customer.email });

    expect(response.status).toBe(400);
    expect(errorCode(response)).toBe('VALIDATION_ERROR');
    expect(findSetCookie(response, 'access_token')).toBeUndefined();
  });

  it('STS-F05-02 normalizes email by trimming and lowercasing before lookup', async () => {
    const customer = await seedCustomer('customer@example.com');

    const response = await login(`  ${customer.email.toUpperCase()}  `);

    expect(response.status).toBe(200);
    expect(response.body.data.id).toBe(customer.id);
  });

  it('STS-F05-03 rejects protected requests without a valid JWT', async () => {
    const customer = await seedCustomer();
    const validToken = accessTokenFor(customer);

    const scenarios: Array<{ label: string; cookie?: string }> = [
      { label: 'no cookie' },
      { label: 'expired', cookie: cookieFor(expiredTokenFor(customer)) },
      { label: 'bad signature', cookie: cookieFor(corruptSignature(validToken)) },
      { label: 'malformed', cookie: cookieFor('not-a-jwt-at-all') },
      { label: 'wrong secret', cookie: cookieFor(wrongSecretTokenFor(customer)) },
    ];

    for (const scenario of scenarios) {
      const request = api().get(ORDERS_URL);

      if (scenario.cookie) {
        request.set('Cookie', scenario.cookie);
      }

      const response = await request;

      expect(response.status, scenario.label).toBe(401);
      expect(errorCode(response), scenario.label).toBe('UNAUTHORIZED');
      expect(response.body.data, scenario.label).toBeUndefined();
    }
  });

  it('STS-F05-04 logout clears the cookie and is idempotent', async () => {
    await seedCustomer();
    const token = await loginToken('customer@example.com');
    const cookie = cookieFor(token);

    const firstLogout = await api()
      .post(LOGOUT_URL)
      .set('Cookie', cookie);

    expect(firstLogout.status).toBe(204);
    const clearedCookie = findSetCookie(firstLogout, 'access_token');
    expect(clearedCookie).toBeTruthy();
    expect(clearedCookie).toMatch(/Max-Age=0/i);

    const repeatedLogout = await api()
      .post(LOGOUT_URL)
      .set('Cookie', cookie);

    expect(repeatedLogout.status).toBe(204);

    const logoutWithoutCookie = await api().post(LOGOUT_URL);

    expect(logoutWithoutCookie.status).toBe(204);
  });

  it('STS-F05-05 documents that a logged-out token still works until it expires', async () => {
    const customer = await seedCustomer();
    const product = await createProduct({
      name: 'Product A',
      price: '125.00',
      stockQuantity: 10,
      categoryName: 'Main Course',
    });
    await createOrder({
      userId: customer.id,
      items: [{ productId: product.id, quantity: 1 }],
    });

    const token = await loginToken(customer.email);
    const cookie = cookieFor(token);

    const logoutResponse = await api()
      .post(LOGOUT_URL)
      .set('Cookie', cookie);
    expect(logoutResponse.status).toBe(204);

    const response = await api().get(ORDERS_URL).set('Cookie', cookie);

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
  });

  it('STS-F05-06 isolates customer orders while allowing admin access to all orders', async () => {
    const customerA = await seedCustomer('customer-a@example.com');
    const customerB = await seedCustomer('customer-b@example.com');
    const admin = await createUser({
      email: 'admin@example.com',
      name: 'Admin One',
      role: Role.ADMIN,
      password: TEST_PASSWORD,
    });
    const product = await createProduct({
      name: 'Product A',
      price: '125.00',
      stockQuantity: 20,
      categoryName: 'Main Course',
    });
    const orderA = await createOrder({
      userId: customerA.id,
      items: [{ productId: product.id, quantity: 1 }],
    });
    const orderB = await createOrder({
      userId: customerB.id,
      items: [{ productId: product.id, quantity: 2 }],
    });

    const tokenA = await loginToken(customerA.email);
    const customerCookie = cookieFor(tokenA);

    const listA = await api()
      .get(ORDERS_URL)
      .set('Cookie', customerCookie);

    expect(listA.status).toBe(200);
    expect(listA.body.data).toHaveLength(1);
    expect(listA.body.data[0].id).toBe(orderA.id);
    expect(
      listA.body.data.every(
        (order: { userId?: string }) => order.userId === customerA.id,
      ),
    ).toBe(true);

    const ownDetail = await api()
      .get(`${ORDERS_URL}/${orderA.id}`)
      .set('Cookie', customerCookie);
    expect(ownDetail.status).toBe(200);
    expect(ownDetail.body.data.id).toBe(orderA.id);

    const otherDetail = await api()
      .get(`${ORDERS_URL}/${orderB.id}`)
      .set('Cookie', customerCookie);

    expect(otherDetail.status).toBe(403);
    expect(errorCode(otherDetail)).toBe('FORBIDDEN_RESOURCE');
    expect(JSON.stringify(otherDetail.body)).not.toContain(orderB.id);

    const tokenAdmin = await loginToken(admin.email);
    const adminCookie = cookieFor(tokenAdmin);

    const adminList = await api()
      .get(ORDERS_URL)
      .set('Cookie', adminCookie);

    expect(adminList.status).toBe(200);
    expect(adminList.body.data).toHaveLength(2);
    expect(
      adminList.body.data.map((order: { id: string }) => order.id).sort(),
    ).toEqual([orderA.id, orderB.id].sort());

    const adminDetail = await api()
      .get(`${ORDERS_URL}/${orderB.id}`)
      .set('Cookie', adminCookie);

    expect(adminDetail.status).toBe(200);
    expect(adminDetail.body.data.id).toBe(orderB.id);
  });

  it('STS-F05-07 enforces the customer/admin access matrix', async () => {
    const customer = await seedCustomer();
    const admin = await createUser({
      email: 'admin@example.com',
      name: 'Admin One',
      role: Role.ADMIN,
      password: TEST_PASSWORD,
    });
    const product = await createProduct({
      name: 'Product A',
      price: '125.00',
      stockQuantity: 20,
      categoryName: 'Main Course',
    });
    const order = await createOrder({
      userId: customer.id,
      status: OrderStatus.PENDING,
      items: [{ productId: product.id, quantity: 1 }],
    });

    const adminCookie = cookieFor(await loginToken(admin.email));
    const customerCookie = cookieFor(await loginToken(customer.email));

    const adminCreateOrder = await api()
      .post(ORDERS_URL)
      .set('Cookie', adminCookie)
      .send({ items: [{ productId: product.id, quantity: 1 }] });

    expect(adminCreateOrder.status).toBe(403);
    expect(errorCode(adminCreateOrder)).toBe('FORBIDDEN_ROLE');

    const customerPatchStatus = await api()
      .patch(`${ADMIN_ORDERS_URL}/${order.id}/status`)
      .set('Cookie', customerCookie)
      .send({ status: 'CONFIRMED' });

    expect(customerPatchStatus.status).toBe(403);
    expect(errorCode(customerPatchStatus)).toBe('FORBIDDEN_ROLE');

    const customerCreateOrder = await api()
      .post(ORDERS_URL)
      .set('Cookie', customerCookie)
      .send({ items: [{ productId: product.id, quantity: 1 }] });

    expect(customerCreateOrder.status).toBe(201);

    const adminPatchStatus = await api()
      .patch(`${ADMIN_ORDERS_URL}/${order.id}/status`)
      .set('Cookie', adminCookie)
      .send({ status: 'CONFIRMED' });

    expect(adminPatchStatus.status).toBe(200);
  });

  it('STS-F05-08 keeps public endpoints public and protected endpoints protected', async () => {
    const customer = await seedCustomer();
    await createProduct({
      name: 'Product A',
      price: '125.00',
      stockQuantity: 10,
      categoryName: 'Main Course',
    });

    const productsResponse = await api().get(PRODUCTS_URL);
    expect(productsResponse.status).toBe(200);

    const loginResponse = await login(customer.email);
    expect(loginResponse.status).toBe(200);

    const logoutResponse = await api().post(LOGOUT_URL);
    expect(logoutResponse.status).toBe(204);

    const ordersResponse = await api().get(ORDERS_URL);
    expect(ordersResponse.status).toBe(401);
    expect(errorCode(ordersResponse)).toBe('UNAUTHORIZED');
    expect(ordersResponse.body.data).toBeUndefined();
  });

  it('STS-F05-09 rejects a JWT whose role claim was tampered to ADMIN', async () => {
    const customer = await seedCustomer();
    const tampered = tamperPayload(accessTokenFor(customer), {
      role: 'ADMIN',
    });

    const response = await api()
      .get(ADMIN_ORDERS_URL)
      .set('Cookie', cookieFor(tampered));

    expect(response.status).toBe(401);
    expect(errorCode(response)).toBe('UNAUTHORIZED');
    expect(response.body.data).toBeUndefined();
  });

  it('STS-F05-09 rejects a JWT signed with a different secret', async () => {
    const customer = await seedCustomer();
    const forged = signTokenWithSecret(
      { userId: customer.id, role: 'ADMIN' },
      'attacker-controlled-secret',
    );

    const response = await api()
      .get(ADMIN_ORDERS_URL)
      .set('Cookie', cookieFor(forged));

    expect(response.status).toBe(401);
    expect(errorCode(response)).toBe('UNAUTHORIZED');
  });

  it('STS-F05-10 never exposes the password hash and stores only a bcrypt hash', async () => {
    const customer = await seedCustomer();

    const logSpies = [
      vi.spyOn(console, 'log').mockImplementation(() => undefined),
      vi.spyOn(console, 'info').mockImplementation(() => undefined),
      vi.spyOn(console, 'warn').mockImplementation(() => undefined),
      vi.spyOn(console, 'error').mockImplementation(() => undefined),
      vi.spyOn(console, 'debug').mockImplementation(() => undefined),
    ];

    const response = await login(customer.email);
    expect(response.status).toBe(200);
    expect(JSON.stringify(response.body)).not.toContain('passwordHash');
    expect(JSON.stringify(response.body)).not.toContain(customer.passwordHash);

    const storedUser = await prisma.user.findUniqueOrThrow({
      where: { id: customer.id },
    });

    expect(storedUser.passwordHash).not.toBe(TEST_PASSWORD);
    expect(storedUser.passwordHash).not.toBe(customer.passwordHash);
    await expect(
      bcrypt.compare(TEST_PASSWORD, storedUser.passwordHash),
    ).resolves.toBe(true);
    expect(bcrypt.getRounds(storedUser.passwordHash)).toBe(
      BCRYPT_SALT_ROUNDS,
    );

    const loggedText = logSpies
      .flatMap((spy) => spy.mock.calls)
      .map((args) => args.map(String).join(' '))
      .join('\n');

    expect(loggedText).not.toContain(TEST_PASSWORD);
    expect(loggedText).not.toContain(storedUser.passwordHash);
    expect(loggedText.toLowerCase()).not.toContain('passwordhash');
  });

  it('STS-F05-11 rejects an unknown role claim with 401', async () => {
    const customer = await seedCustomer();
    const token = signToken({
      userId: customer.id,
      role: 'SUPERADMIN',
    });

    const response = await api()
      .get(ORDERS_URL)
      .set('Cookie', cookieFor(token));

    expect(response.status).toBe(401);
    expect(errorCode(response)).toBe('UNAUTHORIZED');
    expect(response.body.data).toBeUndefined();
  });

  it('STS-F05-11 rejects a JWT without a userId claim with 401', async () => {
    const token = signToken({ role: 'CUSTOMER' });

    const response = await api()
      .get(ORDERS_URL)
      .set('Cookie', cookieFor(token));

    expect(response.status).toBe(401);
    expect(errorCode(response)).toBe('UNAUTHORIZED');
    expect(response.body.data).toBeUndefined();
  });

  it('STS-F05-12 prevents a customer from reading or mutating another customer order', async () => {
    const customerA = await seedCustomer('customer-a@example.com');
    const customerB = await seedCustomer('customer-b@example.com');
    const product = await createProduct({
      name: 'Product A',
      price: '125.00',
      stockQuantity: 10,
      categoryName: 'Main Course',
    });
    const orderB = await createOrder({
      userId: customerB.id,
      items: [{ productId: product.id, quantity: 1 }],
    });

    const customerCookie = cookieFor(await loginToken(customerA.email));

    const getResponse = await api()
      .get(`${ORDERS_URL}/${orderB.id}`)
      .set('Cookie', customerCookie);

    expect(getResponse.status).toBe(403);
    expect(errorCode(getResponse)).toBe('FORBIDDEN_RESOURCE');
    expect(JSON.stringify(getResponse.body)).not.toContain(orderB.id);

    const patchResponse = await api()
      .patch(`${ADMIN_ORDERS_URL}/${orderB.id}/status`)
      .set('Cookie', customerCookie)
      .send({ status: 'CONFIRMED' });

    expect(patchResponse.status).toBe(403);
    expect(errorCode(patchResponse)).toBe('FORBIDDEN_ROLE');
    expect(JSON.stringify(patchResponse.body)).not.toContain(orderB.id);
  });
});
