import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
import { config } from '@/utils/paths';
import { assertTestDatabaseConfig, E2E_DATABASE_NAME } from './testDatabaseSafety';

function runPrismaSchemaPush(): void {
  const backendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const result = spawnSync(
    'bun',
    [
      'run',
      '--cwd',
      backendDir,
      'prisma',
      'db',
      'push',
      '--schema',
      'prisma/schema.prisma',
      '--config',
      'prisma.e2e.config.ts'
    ],
    { cwd: backendDir, env: process.env, stdio: 'inherit' }
  );

  if (result.error) {
    throw new Error(`Failed to start Prisma schema setup: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`Prisma schema setup failed with exit code ${String(result.status ?? 1)}.`);
  }
}

async function ensureDatabaseExists(): Promise<void> {
  const database = config.database;
  if (!database?.host || !database.user || !database.port) {
    throw new Error('[test:db] The E2E config must specify database host, port, and user.');
  }

  const pool = new Pool({
    host: database.host,
    port: Number(database.port),
    user: database.user,
    password: database.password,
    database: 'postgres',
    max: 1,
    connectionTimeoutMillis: 5000
  });

  try {
    const result = await pool.query('SELECT 1 FROM pg_database WHERE datname = $1', [
      E2E_DATABASE_NAME
    ]);
    if (result.rowCount === 0) {
      try {
        await pool.query(`CREATE DATABASE "${E2E_DATABASE_NAME}"`);
        console.info(`[test:db] Created ${E2E_DATABASE_NAME}.`);
      } catch (error) {
        if ((error as { code?: string }).code !== '42P04') throw error;
      }
    }
  } catch (error) {
    if ((error as { code?: string }).code === '42501') {
      throw new Error(
        `[test:db] The configured PostgreSQL user cannot create databases. ` +
          `Create an empty ${E2E_DATABASE_NAME} database, then rerun this command.`,
        { cause: error }
      );
    }
    throw error;
  } finally {
    await pool.end();
  }
}

async function main(): Promise<void> {
  assertTestDatabaseConfig();
  await ensureDatabaseExists();
  runPrismaSchemaPush();
  console.info(`[test:db] ${E2E_DATABASE_NAME} is ready.`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
