import * as XLSX from 'xlsx';
import ExportUtils from '@/routes/export/utils/exportUtils';
import type { ExportTemplates } from '@/settings/schema';
import type { InboundOutboundData, TransactionFilters } from '@/routes/export/utils/types';

export function generateTransactionExcel(
  data: InboundOutboundData,
  options: TransactionFilters,
  TEMPLATES: ExportTemplates
): Buffer {
  const workbook = XLSX.utils.book_new();

  if (options.tables?.includes('1') && data.inbound) {
    const template = TEMPLATES.inbound;
    const worksheet = ExportUtils.createWorksheet(data.inbound, template);
    ExportUtils.appendWorksheet(workbook, worksheet, ExportUtils.safeSheetName(template.sheetName));
  }
  if (options.tables?.includes('2') && data.outbound) {
    const template = TEMPLATES.outbound;
    const worksheet = ExportUtils.createWorksheet(data.outbound, template);
    ExportUtils.appendWorksheet(workbook, worksheet, ExportUtils.safeSheetName(template.sheetName));
  }
  return XLSX.write(workbook, {
    type: 'buffer',
    bookType: 'xlsx'
  }) as unknown as Buffer;
}

export function generateStatementExcel(
  data: InboundOutboundData,
  options: TransactionFilters,
  TEMPLATES: ExportTemplates
): Buffer {
  const workbook = XLSX.utils.book_new();

  if (options.tables?.includes('1') && data.inbound) {
    const template = TEMPLATES.inbound_statement;
    const worksheet = ExportUtils.createWorksheet(data.inbound, template);
    ExportUtils.appendWorksheet(workbook, worksheet, ExportUtils.safeSheetName(template.sheetName));
  }
  if (options.tables?.includes('2') && data.outbound) {
    const template = TEMPLATES.outbound_statement;
    const worksheet = ExportUtils.createWorksheet(data.outbound, template);
    ExportUtils.appendWorksheet(workbook, worksheet, ExportUtils.safeSheetName(template.sheetName));
  }
  return XLSX.write(workbook, {
    type: 'buffer',
    bookType: 'xlsx'
  }) as unknown as Buffer;
}
