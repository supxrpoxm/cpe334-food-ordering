const DEFAULT_TEST_DATABASE_URL =
  'postgresql://toktickit:toktickit@localhost:5433/toktickit?schema=test';

process.env.NODE_ENV = 'test';
process.env.TZ = process.env.TZ ?? 'Asia/Bangkok';

process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? DEFAULT_TEST_DATABASE_URL;

process.env.JWT_SECRET =
  process.env.TEST_JWT_SECRET ??
  'sprint1-test-only-jwt-secret-do-not-use-in-production';

process.env.BCRYPT_SALT_ROUNDS = '10';

export const TEST_DATABASE_URL = process.env.DATABASE_URL;
export const JWT_SECRET = process.env.JWT_SECRET;
export const TEST_PASSWORD = 'TestPassword123!';
export const BCRYPT_SALT_ROUNDS = 10;
