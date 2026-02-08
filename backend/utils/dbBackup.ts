import { logger } from '@/utils/logger.js';

export async function backupDatabase(): Promise<string> {
  logger.warn('Database backup is temporarily disabled directly via API for Prisma migration.');
  throw new Error("Backup feature is only supported for SQLite (Legacy). For PostgreSQL, please use standard backup tools (pg_dump).");
}
