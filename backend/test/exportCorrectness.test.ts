import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { Prisma } from '@/prisma/client';
import { prisma } from '@/prismaClient';
import { accountSummaryQuery } from '@/routes/export/utils/accountSummaryQuery';
import { generateAnalysisExcel } from '@/routes/export/utils/analysisExporter';
import { DEFAULT_SETTINGS } from '@/settings/defaults';
import { parseSetting } from '@/settings/schema';

describe('Export numerical correctness', () => {
  it('preserves fractional amounts in the generated analysis workbook', () => {
    const buffer = generateAnalysisExcel(
      {
        analysisData: {
          sales_amount: 1234.56,
          cost_amount: 1000.12,
          profit_amount: 234.44,
          profit_rate: 18.99
        },
        detailData: [
          {
            product_model: '0001',
            sales_amount: 1234.56,
            cost_amount: 1000.12,
            profit_amount: 234.44,
            profit_rate: 18.99
          }
        ],
        startDate: '2026-10-01',
        endDate: '2026-10-23'
      },
      parseSetting('export-templates', DEFAULT_SETTINGS['export-templates'])
    );
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const summary = workbook.Sheets[workbook.SheetNames[0]!]!;
    expect(summary['B2']?.v).toBe(1234.56);
    expect(summary['B3']?.v).toBe(1000.12);
    expect(summary['B4']?.v).toBe(234.44);
    const details = XLSX.utils.sheet_to_json<Record<string, unknown>>(
      workbook.Sheets[workbook.SheetNames[1]!]!
    );
    expect(Object.values(details[0]!)).toContain('0001');
    expect(Object.values(details[0]!)).toContain(1234.56);
  });

  for (const kind of ['receivable', 'payable'] as const) {
    const receivable = kind === 'receivable';
    const records = Prisma.raw(receivable ? 'outbound_records' : 'inbound_records');
    const payments = Prisma.raw(receivable ? 'receivable_payments' : 'payable_payments');
    const code = Prisma.raw(receivable ? 'customer_code' : 'supplier_code');
    const date = Prisma.raw(receivable ? 'outbound_date' : 'inbound_date');
    const fixture = (query: Prisma.Sql) =>
      prisma.$queryRaw<Record<string, unknown>[]>(Prisma.sql`
      WITH ${records} (${code}, total_price, ${date}) AS (
        VALUES ('A', 100.25, '2026-10-01'), ('A', 200.50, '2026-10-02'), ('B', 40.00, '2026-10-01')
      ), ${payments} (${code}, amount, pay_date) AS (
        VALUES ('A', 50.10, '2026-10-01'), ('A', 60.20, '2026-10-02'), ('C', 20.00, '2026-10-03')
      ), partners (code, short_name, full_name) AS (
        VALUES ('A', 'Alpha', 'Alpha'), ('B', 'Beta', 'Beta'), ('C', 'Gamma', 'Gamma')
      ) SELECT * FROM (${query}) result
    `);

    it(`${kind}: counts multiple transactions and payments once, including payment-only partners`, async () => {
      const rows = await fixture(accountSummaryQuery(kind, {}));
      const row = rows.find((r) => r[receivable ? 'customer_code' : 'supplier_code'] === 'A')!;
      expect(Number(row[receivable ? 'total_sales' : 'total_purchase'])).toBe(300.75);
      expect(Number(row['total_payments'])).toBe(110.3);
      expect(Number(row['balance'])).toBe(190.45);
      expect(rows.map((r) => Number(r['balance']))).toContain(-20);
    });

    it(`${kind}: applies transaction and payment ranges independently`, async () => {
      const rows = await fixture(
        accountSummaryQuery(kind, {
          outboundFrom: '2026-10-02',
          outboundTo: '2026-10-02',
          paymentFrom: '2026-10-01',
          paymentTo: '2026-10-01'
        })
      );
      expect(rows).toHaveLength(1);
      expect(Number(rows[0]!['balance'])).toBe(150.4);
    });
  }
});
