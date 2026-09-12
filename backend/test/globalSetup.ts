import { prisma } from '@/prismaClient';
import { seedDatabase, MANUAL_USERNAME, MANUAL_PASSWORD } from './seed';

export default async function globalSetup(): Promise<void> {
  console.info('[global-setup] Wiping and seeding test database...');
  const t0 = Date.now();
  const result = await seedDatabase();
  console.info(
    `[global-setup] Seed complete in ${((Date.now() - t0) / 1000).toFixed(1)}s ` +
      `(${result.supplierCodes.length} suppliers, ${result.customerCodes.length} customers, ` +
      `${result.productCodes.length} products)`
  );
  console.info(`[global-setup] Manual login: ${MANUAL_USERNAME} / ${MANUAL_PASSWORD} (superuser)`);
  await prisma.$disconnect();
}
