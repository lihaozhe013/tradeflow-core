import { prisma } from '@/prismaClient';
import type { Prisma } from '@/prisma/client';
import type { ZodType } from 'zod';

export class SnapshotError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string
  ) {
    super(message);
    this.name = 'SnapshotError';
  }
}

export function parseSnapshot<T>(schema: ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) throw new Error('Snapshot data failed validation.');
  return result.data;
}

export async function refreshSnapshot<T>(
  scope: string,
  refresh: (tx: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  try {
    return await prisma.$transaction(
      async (tx) => {
        const [result] = await tx.$queryRaw<{ locked: boolean }[]>`
          SELECT pg_try_advisory_xact_lock(hashtext(${`tradeflow:snapshot:${scope}`})) AS locked
        `;
        if (!result?.locked) {
          throw new SnapshotError(
            409,
            'SNAPSHOT_REFRESH_IN_PROGRESS',
            'Data refresh is already in progress.'
          );
        }
        return refresh(tx);
      },
      { isolationLevel: 'RepeatableRead', timeout: 60_000 }
    );
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'P2034') {
      throw new SnapshotError(
        409,
        'SNAPSHOT_REFRESH_CONFLICT',
        'Data changed during refresh. Please retry.'
      );
    }
    throw error;
  }
}
