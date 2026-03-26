import { PrismaClient, Prisma } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { config } from '@/utils/paths';
import { logger } from '@/utils/logger';

const prismaInstance: PrismaClient | null = null;

function getDatabaseConfig() {
  return config.database || {};
}

function createPrismaClient() {
  const dbConfig = getDatabaseConfig();
  const { user, password, host, port, dbName, maxConnections } = dbConfig;
  const connectionString = `postgresql://${user}:${password}@${host}:${port}/${dbName}`;

  logger.info(`Configured for PostgreSQL: ${host}:${port}/${dbName}`);

  // Configure connection pool explicitly
  // Default max connections to 5 as requested (safe for 20 max total connections)
  // If provided in config, use that value.
  const poolMax = maxConnections ? Number(maxConnections) : 5;

  const pool = new Pool({
    connectionString,
    max: poolMax,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });

  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-expect-error
  const adapter = new PrismaPg(pool);

  const log: Prisma.LogLevel[] =
    process.env['NODE_ENV'] === 'development' ? ['query', 'info', 'warn', 'error'] : ['error'];

  return new PrismaClient({
    adapter,
    log,
  });
}

export const prisma = prismaInstance || createPrismaClient();

// Handle graceful shutdown
process.on('beforeExit', async () => {
  await prisma.$disconnect();
});
