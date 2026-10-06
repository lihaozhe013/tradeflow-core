import type { Prisma } from '@/prisma/client';
import { mcpPrisma } from '@/prismaClient';

export function withMcpReadOnlyTransaction<T>(
  handler: (db: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  return mcpPrisma.$transaction(async (db) => {
    await db.$executeRaw`SET TRANSACTION READ ONLY`;
    return handler(db);
  });
}
