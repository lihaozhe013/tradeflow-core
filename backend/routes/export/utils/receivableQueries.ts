import { Prisma } from "@prisma/client";
import { prisma } from "@/prismaClient";
import decimalCalc from "@/utils/decimalCalculator";
import {
  ReceivablePayableFilters as ReceivableFilters,
  ReceivablePaymentDto,
  ReceivableSummaryDto,
  OutboundRecordDto,
} from "@/routes/export/utils/types";

export async function getReceivableSummary(
  filters: ReceivableFilters = {},
): Promise<ReceivableSummaryDto[]> {
  const conditions: Prisma.Sql[] = [Prisma.sql`1=1`];

  if (filters.outboundFrom) {
    conditions.push(Prisma.sql`o.outbound_date >= ${filters.outboundFrom}`);
  }
  if (filters.outboundTo) {
    conditions.push(Prisma.sql`o.outbound_date <= ${filters.outboundTo}`);
  }
  if (filters.paymentFrom) {
    conditions.push(
      Prisma.sql`(p.pay_date IS NULL OR p.pay_date >= ${filters.paymentFrom})`,
    );
  }
  if (filters.paymentTo) {
    conditions.push(
      Prisma.sql`(p.pay_date IS NULL OR p.pay_date <= ${filters.paymentTo})`,
    );
  }

  const sql = Prisma.sql`
        SELECT 
          o.customer_code,
          o.customer_short_name,
          o.customer_full_name,
          COALESCE(SUM(o.total_price), 0) as total_sales,
          COALESCE(SUM(p.amount), 0) as total_payments,
          COALESCE(SUM(o.total_price), 0) - COALESCE(SUM(p.amount), 0) as balance
        FROM outbound_records o
        LEFT JOIN receivable_payments p ON o.customer_code = p.customer_code
        WHERE ${Prisma.join(conditions, " AND ")}
        GROUP BY o.customer_code, o.customer_short_name, o.customer_full_name
        ORDER BY balance DESC
      `;

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
      balance,
    };
  });
}

export async function getReceivableDetails(
  filters: ReceivableFilters = {},
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
    orderBy: [{ outbound_date: "desc" }, { id: "desc" }],
  });
  return rows.map((r) => ({ ...r, record_id: r.id }));
}

export async function getReceivablePayments(
  filters: ReceivableFilters = {},
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
    orderBy: [{ pay_date: "desc" }, { id: "desc" }],
  });
}
