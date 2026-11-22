import { escapeIdentifier } from 'pg';
import { DatabaseBootstrapError, initializeDatabase } from '@/utils/databaseBootstrap';
import { config } from '@/utils/paths';

// The E2E seed guard owns the tradeflow_e2e database; this script must never touch it.
const E2E_DATABASE_NAME = 'tradeflow_e2e';

function reportBootstrapError(error: DatabaseBootstrapError): void {
  const databaseName = config.database?.dbName;
  const user = config.database?.user;

  console.error(`[db:reset] ${error.message}`);
  if (
    error.errorCode === '42501' &&
    error.message.startsWith('Creating database ') &&
    databaseName &&
    user
  ) {
    console.error(
      '[db:reset] As a PostgreSQL administrator, create it manually with: ' +
        `CREATE DATABASE ${escapeIdentifier(databaseName)} OWNER ${escapeIdentifier(user)};`
    );
  }
  console.error(`[db:reset] ${error.recommendation}`);
}

async function main(): Promise<void> {
  const databaseName = config.database?.dbName;
  if (databaseName === E2E_DATABASE_NAME) {
    throw new Error(
      `[db:reset] Refusing to reset the isolated test database ${E2E_DATABASE_NAME}. ` +
        'Point TRADEFLOW_CONFIG_DIR at the development config.'
    );
  }

  console.info('[db:reset] Ensuring the configured PostgreSQL database and schema are ready...');
  try {
    await initializeDatabase(config.database);
  } catch (error) {
    if (error instanceof DatabaseBootstrapError) {
      reportBootstrapError(error);
      process.exitCode = 1;
      return;
    }
    throw error;
  }

  // Import Prisma and the seeder only after the schema exists so their pools never
  // target a missing database.
  const [{ prisma }, { MANUAL_PASSWORD, MANUAL_USERNAME, seedDatabase }] = await Promise.all([
    import('@/prismaClient'),
    import('@/test/seed')
  ]);

  console.info('[db:reset] Database ready. Regenerating the demo dataset...');
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

main().catch((error: unknown) => {
  console.error('[db:reset] Reset failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
