import { Prisma } from '@/prisma/client';
import type { ReceivablePayableFilters } from './types';

/** Aggregate each ledger before joining to avoid multiplying transactions by payments. */
export function accountSummaryQuery(
  kind: 'receivable' | 'payable',
  filters: ReceivablePayableFilters
): Prisma.Sql {
  const receivable = kind === 'receivable';
  const code = Prisma.raw(receivable ? 'customer_code' : 'supplier_code');
  const records = Prisma.raw(receivable ? 'outbound_records' : 'inbound_records');
  const payments = Prisma.raw(receivable ? 'receivable_payments' : 'payable_payments');
  const date = Prisma.raw(receivable ? 'outbound_date' : 'inbound_date');
  const amount = Prisma.raw(receivable ? 'total_sales' : 'total_purchase');
  const shortName = Prisma.raw(receivable ? 'customer_short_name' : 'supplier_short_name');
  const fullName = Prisma.raw(receivable ? 'customer_full_name' : 'supplier_full_name');
  const recordConditions = [Prisma.sql`1=1`];
  const paymentConditions = [Prisma.sql`1=1`];
  if (filters.outboundFrom) recordConditions.push(Prisma.sql`${date} >= ${filters.outboundFrom}`);
  if (filters.outboundTo) recordConditions.push(Prisma.sql`${date} <= ${filters.outboundTo}`);
  if (filters.paymentFrom) paymentConditions.push(Prisma.sql`pay_date >= ${filters.paymentFrom}`);
  if (filters.paymentTo) paymentConditions.push(Prisma.sql`pay_date <= ${filters.paymentTo}`);
  return Prisma.sql`
    WITH transactions AS (
      SELECT ${code} AS partner_code, SUM(total_price) AS amount
      FROM ${records} WHERE ${Prisma.join(recordConditions, ' AND ')} GROUP BY ${code}
    ), payments AS (
      SELECT ${code} AS partner_code, SUM(amount) AS paid
      FROM ${payments} WHERE ${Prisma.join(paymentConditions, ' AND ')} GROUP BY ${code}
    )
    SELECT COALESCE(t.partner_code, p.partner_code) AS ${code},
      pa.short_name AS ${shortName}, pa.full_name AS ${fullName},
      COALESCE(t.amount, 0) AS ${amount}, COALESCE(p.paid, 0) AS total_payments,
      COALESCE(t.amount, 0) - COALESCE(p.paid, 0) AS balance
    FROM transactions t FULL OUTER JOIN payments p ON t.partner_code = p.partner_code
    LEFT JOIN partners pa ON pa.code = COALESCE(t.partner_code, p.partner_code)
    ORDER BY balance DESC, COALESCE(t.partner_code, p.partner_code) ASC
  `;
}
