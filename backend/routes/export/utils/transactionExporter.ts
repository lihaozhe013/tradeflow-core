import * as XLSX from 'xlsx';
import ExportUtils from '@/routes/export/utils/exportUtils';
import { TEMPLATES } from '@/routes/export/utils/exportTemplates';
import { InboundOutboundData, TransactionFilters } from './types';

export function generateTransactionExcel(
  data: InboundOutboundData,
  options: TransactionFilters,
): Buffer {
  const workbook = XLSX.utils.book_new();

  if (options.tables?.includes('1') && data.inbound) {
    const template = TEMPLATES.inbound;
    const worksheet = ExportUtils.createWorksheet(data.inbound, template);
    XLSX.utils.book_append_sheet(workbook, worksheet, template.sheetName);
  }
  if (options.tables?.includes('2') && data.outbound) {
    const template = TEMPLATES.outbound;
    const worksheet = ExportUtils.createWorksheet(data.outbound, template);
    XLSX.utils.book_append_sheet(workbook, worksheet, template.sheetName);
  }
  return XLSX.write(workbook, {
    type: 'buffer',
    bookType: 'xlsx',
  }) as unknown as Buffer;
}

export function generateStatementExcel(
  data: InboundOutboundData,
  options: TransactionFilters,
): Buffer {
  const workbook = XLSX.utils.book_new();

  if (options.tables?.includes('1') && data.inbound) {
    const template = TEMPLATES.inbound_statement;
    const worksheet = ExportUtils.createWorksheet(data.inbound, template);
    XLSX.utils.book_append_sheet(workbook, worksheet, template.sheetName);
  }
  if (options.tables?.includes('2') && data.outbound) {
    const template = TEMPLATES.outbound_statement;
    const worksheet = ExportUtils.createWorksheet(data.outbound, template);
    XLSX.utils.book_append_sheet(workbook, worksheet, template.sheetName);
  }
  return XLSX.write(workbook, {
    type: 'buffer',
    bookType: 'xlsx',
  }) as unknown as Buffer;
}
