import { PrismaClient } from '@prisma/client';
import { beforeAll, afterAll } from 'vitest';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: 'file:memdb1?mode=memory&cache=shared',
    },
  },
});

beforeAll(async () => {
  await prisma.$connect();
});

afterAll(async () => {
  await prisma.$disconnect();
});

export { prisma };
