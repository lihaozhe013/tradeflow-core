import { Prisma } from '@prisma/client';
import { prisma } from '@/prismaClient';
import decimalCalc from '@/utils/decimalCalculator';
import {
  ReceivablePayableFilters as PayableFilters,
  PayablePaymentDto,
  PayableSummaryDto,
  InboundRecordDto,
} from '@/routes/export/utils/types';

export async function getPayableSummary(
  filters: PayableFilters = {},
): Promise<PayableSummaryDto[]> {
  const conditions: Prisma.Sql[] = [Prisma.sql`1=1`];

  if (filters.outboundFrom) {
    conditions.push(Prisma.sql`i.inbound_date >= ${filters.outboundFrom}`);
  }
  if (filters.outboundTo) {
    conditions.push(Prisma.sql`i.inbound_date <= ${filters.outboundTo}`);
  }
  if (filters.paymentFrom) {
    conditions.push(Prisma.sql`(p.pay_date IS NULL OR p.pay_date >= ${filters.paymentFrom})`);
  }
  if (filters.paymentTo) {
    conditions.push(Prisma.sql`(p.pay_date IS NULL OR p.pay_date <= ${filters.paymentTo})`);
  }

  const sql = Prisma.sql`
        SELECT 
          i.supplier_code,
          pa.short_name as supplier_short_name,
          pa.full_name as supplier_full_name,
          COALESCE(SUM(i.total_price), 0) as total_purchase,
          COALESCE(SUM(p.amount), 0) as total_payments,
          COALESCE(SUM(i.total_price), 0) - COALESCE(SUM(p.amount), 0) as balance
        FROM inbound_records i
        LEFT JOIN payable_payments p ON i.supplier_code = p.supplier_code
        LEFT JOIN partners pa ON i.supplier_code = pa.code
        WHERE ${Prisma.join(conditions, ' AND ')}
        GROUP BY i.supplier_code, pa.short_name, pa.full_name
        ORDER BY balance DESC
      `;

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
      balance,
    };
  });
}

export async function getPayableDetails(
  filters: PayableFilters = {},
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
    orderBy: [{ inbound_date: 'desc' }, { id: 'desc' }],
  });

  return rows.map((r) => ({ ...r, record_id: r.id }));
}

export async function getPayablePayments(
  filters: PayableFilters = {},
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
    orderBy: [{ pay_date: 'desc' }, { id: 'desc' }],
  });
}
