import { afterAll } from 'vitest';
import './env';
import { prisma } from './db';

afterAll(async () => {
  await prisma.$disconnect();
});
