import { z } from 'zod';
import { prisma } from '@/prismaClient';
import { readSetting } from '@/settings/service';
import { getInboundOutboundData } from './utils/transactionQueries';
import { getAllInvoiceData, getInvoiceData } from './utils/invoiceQueries';
import { previewColumns } from './previewTemplates';

export const reportSpec = z
  .strictObject({
    report: z.enum(['statement', 'invoice']),
    filters: z
      .strictObject({
        tables: z.enum(['1', '2', '12']).optional(),
        dateFrom: z.iso.date().optional(),
        dateTo: z.iso.date().optional(),
        productCode: z.string().trim().max(100).optional(),
        customerCode: z.string().trim().max(100).optional(),
        partnerCode: z.string().trim().min(1).max(100).optional()
      })
      .refine((v) => !v.dateFrom || !v.dateTo || v.dateFrom <= v.dateTo)
  })
  .refine((v) => v.report !== 'invoice' || Boolean(v.filters.partnerCode));

export async function prepareReport(input: z.infer<typeof reportSpec>) {
  return prisma.$transaction(
    async (db) => {
      const templates = await readSetting('export-templates', db);
      const sheets: {
        key: string;
        sheetName: string;
        columns: ReturnType<typeof previewColumns>;
        rows: Record<string, string | number | null>[];
      }[] = [];
      const add = (
        key: string,
        template: typeof templates.invoice,
        data: unknown[],
        name = template.sheetName
      ) => {
        const columns = previewColumns([template], []);
        sheets.push({
          key,
          sheetName: name,
          columns,
          rows: data.map((value, index) => {
            const raw = value as Record<string, unknown>;
            return {
              __rowKey: `${key}-${index}`,
              ...Object.fromEntries(columns.map((c) => [c.key, raw[c.key] ?? null]))
            } as Record<string, string | number | null>;
          })
        });
      };
      if (input.report === 'statement') {
        const data = await getInboundOutboundData(input.filters, db);
        if (data.inbound) add('inbound', templates.inbound_statement, data.inbound);
        if (data.outbound) add('outbound', templates.outbound_statement, data.outbound);
      } else if (input.filters.partnerCode!.toLowerCase() === 'all') {
        const data = await getAllInvoiceData(input.filters, db);
        Object.entries(data).forEach(([name, rows], index) =>
          add(`invoice-${index}`, templates.invoice, rows, name)
        );
        if (!sheets.length) add('invoice', templates.invoice, []);
      } else {
        add(
          'invoice',
          templates.invoice,
          await getInvoiceData({ ...input.filters, partnerCode: input.filters.partnerCode! }, db)
        );
      }
      return sheets;
    },
    { isolationLevel: 'RepeatableRead', timeout: 30000 }
  );
}
