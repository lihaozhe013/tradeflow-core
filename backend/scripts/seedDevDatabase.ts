import { prisma } from '@/prismaClient';
import { config } from '@/utils/paths';
import { MANUAL_PASSWORD, MANUAL_USERNAME, seedDatabase, truncateAll } from '@/test/seed';

// The E2E seed guard owns the tradeflow_e2e database; this script must never touch it.
const E2E_DATABASE_NAME = 'tradeflow_e2e';

async function main(): Promise<void> {
  const databaseName = config.database?.dbName;
  if (databaseName === E2E_DATABASE_NAME) {
    throw new Error(
      `[db:reset] Refusing to reset the isolated test database ${E2E_DATABASE_NAME}. ` +
        'Point TRADEFLOW_CONFIG_DIR at the development config.'
    );
  }

  // Always start from a clean slate: drop every row, then regenerate the full dataset.
  await truncateAll();
  console.info('[db:reset] Cleared all existing data.');

  const t0 = Date.now();
  const result = await seedDatabase();
  console.info(
    `[db:reset] Regenerated demo dataset in ${((Date.now() - t0) / 1000).toFixed(1)}s: ` +
      `${result.supplierCodes.length} suppliers, ${result.customerCodes.length} customers, ` +
      `${result.productCodes.length} products, ${result.usernames.length} users.`
  );
  console.info(`[db:reset] Ready. Login with ${MANUAL_USERNAME} / ${MANUAL_PASSWORD}.`);
  await prisma.$disconnect();
}

main().catch(async (error: unknown) => {
  console.error('[db:reset] Reset failed:', error instanceof Error ? error.message : error);
  await prisma.$disconnect();
  process.exit(1);
});
