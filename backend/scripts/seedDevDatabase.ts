import { Pool, escapeIdentifier } from 'pg';
import { DatabaseBootstrapError, initializeDatabase } from '@/utils/databaseBootstrap';
import { createPoolConfig, validateDatabaseConfig } from '@/utils/databaseConnection';
import { config } from '@/utils/paths';

// The E2E seed guard owns the tradeflow_e2e database; this script must never touch it.
const E2E_DATABASE_NAME = 'tradeflow_e2e';
const PROTECTED_DATABASES = new Set(['postgres', 'template0', 'template1', E2E_DATABASE_NAME]);
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
const DROP_FLAG = '--drop';

function pgErrorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : undefined;
}

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

async function dropExistingDatabase(): Promise<void> {
  const database = validateDatabaseConfig(config.database);
  if (PROTECTED_DATABASES.has(database.dbName)) {
    throw new Error(`[db:reset] Refusing to drop protected database ${database.dbName}.`);
  }
  if (!database.bootstrap.createDatabase) {
    throw new Error(
      '[db:reset] Cannot recreate the database when database.bootstrap.createDatabase is false.'
    );
  }
  if (
    !LOOPBACK_HOSTS.has(database.host.toLowerCase()) &&
    process.env['TRADEFLOW_ALLOW_REMOTE_DB_RESET'] !== '1'
  ) {
    throw new Error(
      `[db:reset] Refusing to drop database ${database.dbName} on non-local host ` +
        `${database.host}. Set TRADEFLOW_ALLOW_REMOTE_DB_RESET=1 only if this is a disposable ` +
        'development database.'
    );
  }

  const pool = new Pool(createPoolConfig(database, database.bootstrap.maintenanceDatabase, 1));
  try {
    const canCreate = await pool.query<{ allowed: boolean }>(
      'SELECT rolcreatedb OR rolsuper AS allowed FROM pg_roles WHERE rolname = current_user'
    );
    if (!canCreate.rows[0]?.allowed) {
      throw new Error(
        `[db:reset] Cannot recreate database ${database.dbName}: the configured role cannot ` +
          'create databases. Grant CREATEDB or create the database manually before rerunning.'
      );
    }

    const exists = await pool.query<{ present: boolean }>(
      'SELECT EXISTS (SELECT 1 FROM pg_database WHERE datname = $1) AS present',
      [database.dbName]
    );
    if (!exists.rows[0]?.present) {
      console.info(`[db:reset] Database ${database.dbName} does not exist yet.`);
      return;
    }

    await pool.query(
      'SELECT pg_terminate_backend(pid) FROM pg_stat_activity ' +
        'WHERE datname = $1 AND pid <> pg_backend_pid()',
      [database.dbName]
    );
    await pool.query(`DROP DATABASE ${escapeIdentifier(database.dbName)}`);
    console.info(`[db:reset] Dropped existing database ${database.dbName}.`);
  } catch (error) {
    const code = pgErrorCode(error);
    if (code === '42501') {
      throw new Error(
        `[db:reset] Cannot drop database ${database.dbName}: the configured role must own it ` +
          'or be a superuser.',
        { cause: error }
      );
    }
    if (code === '55006') {
      throw new Error(
        `[db:reset] Cannot drop database ${database.dbName} because it is still in use. ` +
          'Stop `bun run dev` and rerun this command.',
        { cause: error }
      );
    }
    throw error;
  } finally {
    await pool.end();
  }
}

async function main(): Promise<void> {
  const databaseName = config.database?.dbName;
  if (databaseName === E2E_DATABASE_NAME) {
    throw new Error(
      `[db:reset] Refusing to reset the isolated test database ${E2E_DATABASE_NAME}. ` +
        'Point TRADEFLOW_CONFIG_DIR at the development config.'
    );
  }

  if (process.argv.includes(DROP_FLAG)) {
    console.info('[db:reset] Dropping the configured PostgreSQL database...');
    await dropExistingDatabase();
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
