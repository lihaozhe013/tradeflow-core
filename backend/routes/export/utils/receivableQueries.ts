import { accountSummaryQuery } from './accountSummaryQuery';
import type { Prisma } from '@/prisma/client';
import { prisma } from '@/prismaClient';
import decimalCalc from '@/utils/decimalCalculator';
import type {
  ReceivablePayableFilters as ReceivableFilters,
  ReceivablePaymentDto,
  ReceivableSummaryDto,
  OutboundRecordDto
} from '@/routes/export/utils/types';

export async function getReceivableSummary(
  filters: ReceivableFilters = {}
): Promise<ReceivableSummaryDto[]> {
  const sql = accountSummaryQuery('receivable', filters);

  type ReceivableSummaryRow = {
    customer_code: string;
    customer_short_name: string;
    customer_full_name: string;
    total_sales: number | string | null | bigint;
    total_payments: number | string | null | bigint;
  };
  const rows = await prisma.$queryRaw<ReceivableSummaryRow[]>(sql);

  return rows.map((row) => {
    const totalSales = decimalCalc.fromSqlResult(row.total_sales, 0);
    const totalPayments = decimalCalc.fromSqlResult(row.total_payments, 0);
    const balance = decimalCalc.calculateBalance(totalSales, totalPayments);
    return {
      customer_code: row.customer_code,
      customer_short_name: row.customer_short_name,
      customer_full_name: row.customer_full_name,
      total_sales: totalSales,
      total_payments: totalPayments,
      balance
    };
  });
}

export async function getReceivableDetails(
  filters: ReceivableFilters = {}
): Promise<(OutboundRecordDto & { record_id: number })[]> {
  const where: Prisma.OutboundRecordWhereInput = {};
  const dateConditions: Prisma.StringFilter = {};

  if (filters.outboundFrom) {
    dateConditions.gte = filters.outboundFrom;
  }
  if (filters.outboundTo) {
    dateConditions.lte = filters.outboundTo;
  }

  if (Object.keys(dateConditions).length > 0) {
    where.outbound_date = dateConditions;
  }

  const rows = await prisma.outboundRecord.findMany({
    where,
    include: { partner: true, product: true },
    orderBy: [{ outbound_date: 'desc' }, { id: 'desc' }]
  });
  return rows.map((r) => ({
    ...r,
    record_id: r.id,
    product_model: r.product?.product_model || '',
    customer_short_name: r.partner?.short_name || '',
    customer_full_name: r.partner?.full_name || ''
  })) as unknown as (OutboundRecordDto & { record_id: number })[];
}

export async function getReceivablePayments(
  filters: ReceivableFilters = {}
): Promise<ReceivablePaymentDto[]> {
  const where: Prisma.ReceivablePaymentWhereInput = {};
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

  return await prisma.receivablePayment.findMany({
    where,
    orderBy: [{ pay_date: 'desc' }, { id: 'desc' }]
  });
}
