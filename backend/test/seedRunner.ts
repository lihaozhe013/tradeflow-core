import { prisma } from '@/prismaClient';
import { seedDatabase } from './seed';
import { assertTestDatabaseConfig } from './testDatabaseSafety';

async function main(): Promise<void> {
  assertTestDatabaseConfig();
  const t0 = Date.now();
  const result = await seedDatabase();
  console.info(
    `Seed complete in ${((Date.now() - t0) / 1000).toFixed(1)}s: ` +
      `${result.supplierCodes.length} suppliers, ${result.customerCodes.length} customers, ` +
      `${result.productCodes.length} products, ${result.usernames.length} users.`
  );
  await prisma.$disconnect();
}

main().catch(async (err: unknown) => {
  console.error('Seed failed', err);
  await prisma.$disconnect();
  process.exit(1);
});
