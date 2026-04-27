import { prisma } from '@/prismaClient';
import { Prisma } from '@/prisma/client';
import {
  InboundOutboundData,
  InboundRecordDto,
  OutboundRecordDto,
  TransactionFilters,
} from '@/routes/export/utils/types';

export async function getInboundOutboundData(
  filters: TransactionFilters = {},
): Promise<InboundOutboundData> {
  const { tables = '12' } = filters;
  const result: InboundOutboundData = {};

  if (tables.includes('1')) {
    result.inbound = await getInboundData(filters);
  }
  if (tables.includes('2')) {
    result.outbound = await getOutboundData(filters);
  }
  return result;
}

export async function getInboundData(
  filters: TransactionFilters = {},
): Promise<InboundRecordDto[]> {
  const andConditions: Prisma.InboundRecordWhereInput[] = [];

  if (filters.dateFrom) {
    andConditions.push({ inbound_date: { gte: filters.dateFrom } });
  }
  if (filters.dateTo) {
    andConditions.push({ inbound_date: { lte: filters.dateTo } });
  }

  if (filters.productCode) {
    andConditions.push({
      OR: [
        { product_code: { contains: filters.productCode } },
        { product: { product_model: { contains: filters.productCode } } },
      ],
    });
  }

  if (filters.customerCode) {
    andConditions.push({
      OR: [
        { supplier_code: { contains: filters.customerCode } },
        { partner: { short_name: { contains: filters.customerCode } } },
      ],
    });
  }

  const where: Prisma.InboundRecordWhereInput =
    andConditions.length > 0 ? { AND: andConditions } : {};

  const records = await prisma.inboundRecord.findMany({
    where,
    include: {
      partner: true,
    },
    orderBy: [{ inbound_date: 'desc' }, { id: 'desc' }],
  });

  return records.map((record) => ({
    ...record,
    supplier_short_name: record.partner?.short_name || '',
    supplier_full_name: record.partner?.full_name || '',
  })) as unknown as InboundRecordDto[];
}

export async function getOutboundData(
  filters: TransactionFilters = {},
): Promise<OutboundRecordDto[]> {
  const andConditions: Prisma.OutboundRecordWhereInput[] = [];

  if (filters.dateFrom) {
    andConditions.push({ outbound_date: { gte: filters.dateFrom } });
  }
  if (filters.dateTo) {
    andConditions.push({ outbound_date: { lte: filters.dateTo } });
  }

  if (filters.productCode) {
    andConditions.push({
      OR: [
        { product_code: { contains: filters.productCode } },
        { product: { product_model: { contains: filters.productCode } } },
      ],
    });
  }

  if (filters.customerCode) {
    andConditions.push({
      OR: [
        { customer_code: { contains: filters.customerCode } },
        { partner: { short_name: { contains: filters.customerCode } } },
      ],
    });
  }

  const where: Prisma.OutboundRecordWhereInput =
    andConditions.length > 0 ? { AND: andConditions } : {};

  const records = await prisma.outboundRecord.findMany({
    where,
    include: {
      partner: true,
    },
    orderBy: [{ outbound_date: 'desc' }, { id: 'desc' }],
  });

  return records.map((record) => ({
    ...record,
    customer_short_name: record.partner?.short_name || '',
    customer_full_name: record.partner?.full_name || '',
  })) as unknown as OutboundRecordDto[];
}
