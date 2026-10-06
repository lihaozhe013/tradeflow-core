import type { Prisma } from '@/prisma/client';
import { PrismaClient } from '@/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { config } from '@/utils/paths';
import { createPoolConfig, validateDatabaseConfig } from '@/utils/databaseConnection';
import { logger } from '@/utils/logger';

const prismaInstance: PrismaClient | null = null;

function getDatabaseConfig() {
  return config.database || {};
}

function createPrismaClient(options: { logQueries: boolean; maxConnections?: number }) {
  const dbConfig = validateDatabaseConfig(getDatabaseConfig());
  const { host, port, dbName, maxConnections } = dbConfig;

  logger.info(`Configured for PostgreSQL: ${host}:${port}/${dbName}`);

  // Configure connection pool explicitly
  // Default max connections to 5 as requested (safe for 20 max total connections)
  // If provided in config, use that value.
  const configuredPoolMax = maxConnections ? Number(maxConnections) : 5;
  const poolMax = options.maxConnections
    ? Math.min(configuredPoolMax, options.maxConnections)
    : configuredPoolMax;

  const pool = new Pool(createPoolConfig(dbConfig, dbName, poolMax));

  const adapter = new PrismaPg(pool);

  const log: Prisma.LogLevel[] =
    process.env['NODE_ENV'] === 'development' && options.logQueries
      ? ['query', 'info', 'warn', 'error']
      : ['error'];

  return new PrismaClient({
    adapter,
    log
  });
}

export const prisma = prismaInstance || createPrismaClient({ logQueries: true });
export const mcpPrisma = createPrismaClient({ logQueries: false, maxConnections: 2 });

// Handle graceful shutdown
process.on('beforeExit', async () => {
  await Promise.all([prisma.$disconnect(), mcpPrisma.$disconnect()]);
});
