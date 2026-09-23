import { prisma } from '@/prismaClient';
import { seedDatabase } from './seed';
import { assertTestDatabaseConfig } from './testDatabaseSafety';

export default async function globalSetup(): Promise<void> {
  assertTestDatabaseConfig();
  console.info('[global-setup] Wiping and seeding test database...');
  const t0 = Date.now();
  const result = await seedDatabase();
  console.info(
    `[global-setup] Seed complete in ${((Date.now() - t0) / 1000).toFixed(1)}s ` +
      `(${result.supplierCodes.length} suppliers, ${result.customerCodes.length} customers, ` +
      `${result.productCodes.length} products)`
  );
  await prisma.$disconnect();
}
