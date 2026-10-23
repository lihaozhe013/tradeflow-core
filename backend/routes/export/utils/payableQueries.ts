import { accountSummaryQuery } from './accountSummaryQuery';
import type { Prisma } from '@/prisma/client';
import { prisma } from '@/prismaClient';
import decimalCalc from '@/utils/decimalCalculator';
import type {
  ReceivablePayableFilters as PayableFilters,
  PayablePaymentDto,
  PayableSummaryDto,
  InboundRecordDto
} from '@/routes/export/utils/types';

export async function getPayableSummary(
  filters: PayableFilters = {}
): Promise<PayableSummaryDto[]> {
  const sql = accountSummaryQuery('payable', filters);

  type PayableSummaryRow = {
    supplier_code: string;
    supplier_short_name: string;
    supplier_full_name: string;
    total_purchase: number | string | null | bigint;
    total_payments: number | string | null | bigint;
  };
  const rows = await prisma.$queryRaw<PayableSummaryRow[]>(sql);

  return rows.map((row) => {
    const totalPurchase = decimalCalc.fromSqlResult(row.total_purchase, 0);
    const totalPayments = decimalCalc.fromSqlResult(row.total_payments, 0);
    const balance = decimalCalc.calculateBalance(totalPurchase, totalPayments);
    return {
      supplier_code: row.supplier_code,
      supplier_short_name: row.supplier_short_name,
      supplier_full_name: row.supplier_full_name,
      total_purchase: totalPurchase,
      total_payments: totalPayments,
      balance
    };
  });
}

export async function getPayableDetails(
  filters: PayableFilters = {}
): Promise<(InboundRecordDto & { record_id: number })[]> {
  const where: Prisma.InboundRecordWhereInput = {};
  const dateConditions: Prisma.StringFilter = {};

  if (filters.outboundFrom) {
    dateConditions.gte = filters.outboundFrom;
  }
  if (filters.outboundTo) {
    dateConditions.lte = filters.outboundTo;
  }

  if (Object.keys(dateConditions).length > 0) {
    where.inbound_date = dateConditions;
  }

  const rows = await prisma.inboundRecord.findMany({
    where,
    include: { partner: true, product: true },
    orderBy: [{ inbound_date: 'desc' }, { id: 'desc' }]
  });

  return rows.map((r) => ({
    ...r,
    record_id: r.id,
    product_model: r.product?.product_model || '',
    supplier_short_name: r.partner?.short_name || '',
    supplier_full_name: r.partner?.full_name || ''
  })) as unknown as (InboundRecordDto & { record_id: number })[];
}

export async function getPayablePayments(
  filters: PayableFilters = {}
): Promise<PayablePaymentDto[]> {
  const where: Prisma.PayablePaymentWhereInput = {};
  const dateConditions: Prisma.StringFilter = {};

  if (filters.paymentFrom) {
    dateConditions.gte = filters.paymentFrom;
  }
  if (filters.paymentTo) {
    dateConditions.lte = filters.paymentTo;
  }

  if (Object.keys(dateConditions).length > 0) {
    where.pay_date = dateConditions;
  }

  return await prisma.payablePayment.findMany({
    where,
    orderBy: [{ pay_date: 'desc' }, { id: 'desc' }]
  });
}
