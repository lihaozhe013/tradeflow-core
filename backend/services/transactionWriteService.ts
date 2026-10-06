import type { Prisma } from '@/prisma/client';
import decimalCalc from '@/utils/decimalCalculator';
import { inventoryService } from '@/utils/inventoryService';

type InboundCreate = Prisma.InboundRecordUncheckedCreateInput;
type OutboundCreate = Prisma.OutboundRecordUncheckedCreateInput;

export async function createInboundRecord(
  tx: Prisma.TransactionClient,
  data: InboundCreate
) {
  const record = await tx.inboundRecord.create({
    data: {
      ...data,
      total_price: decimalCalc.calculateTotalPrice(data.quantity ?? 0, data.unit_price ?? 0)
    },
    include: { product: true }
  });
  await inventoryService.onInboundCreate(record, tx);
  return record;
}

export async function createOutboundRecord(
  tx: Prisma.TransactionClient,
  data: OutboundCreate
) {
  const record = await tx.outboundRecord.create({
    data: {
      ...data,
      total_price: decimalCalc.calculateTotalPrice(data.quantity ?? 0, data.unit_price ?? 0)
    },
    include: { product: true }
  });
  await inventoryService.onOutboundCreate(record, tx);
  return record;
}
