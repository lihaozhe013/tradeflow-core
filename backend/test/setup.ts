import { afterAll } from 'vitest';
import { prisma } from '@/prismaClient';

afterAll(async () => {
  await prisma.$disconnect();
});
