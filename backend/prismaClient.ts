import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import fs from 'fs';
import { appConfigPath } from "@/utils/paths.js";
import { logger } from "@/utils/logger.js";

let prismaInstance: PrismaClient | null = null;

function getDatabaseConfig() {
  try {
    if (fs.existsSync(appConfigPath)) {
      const configContent = fs.readFileSync(appConfigPath, "utf8");
      const config = JSON.parse(configContent);
      return config.database || {};
    }
    return {};
  } catch (error) {
    logger.warn("Failed to read appConfig for database configuration, using defaults.");
    return {};
  }
}

function createPrismaClient() {
  const dbConfig = getDatabaseConfig();
  
  // Default to nothing if not postgres, or throw
  const { user, password, host, port, dbName } = dbConfig;
  const connectionString = `postgresql://${user}:${password}@${host}:${port}/${dbName}`;
  
  logger.info(`Configured for PostgreSQL: ${host}:${port}/${dbName}`);

  const pool = new pg.Pool({ connectionString });
  const adapter = new PrismaPg(pool);

  const log: any[] = process.env['NODE_ENV'] === 'development' 
    ? ['query', 'info', 'warn', 'error'] 
    : ['error'];

  return new PrismaClient({
    adapter,
    // @ts-ignore
    log,
  });
}

export const prisma = prismaInstance || (prismaInstance = createPrismaClient());

// Handle graceful shutdown
process.on('beforeExit', async () => {
  await prisma.$disconnect();
});
