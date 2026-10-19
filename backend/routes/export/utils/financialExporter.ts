import * as XLSX from 'xlsx';
import ExportUtils from '@/routes/export/utils/exportUtils';
import type { ExportTemplates } from '@/settings/schema';
import type { ReceivablePayableData } from '@/routes/export/utils/types';

export function generateFinancialExcel(
  data: ReceivablePayableData,
  TEMPLATES: ExportTemplates
): Buffer {
  const workbook = XLSX.utils.book_new();

  if (data.receivable_summary && data.receivable_summary.length > 0) {
    const template = TEMPLATES.receivable_summary;
    const worksheet = ExportUtils.createWorksheet(data.receivable_summary, template);
    ExportUtils.appendWorksheet(workbook, worksheet, ExportUtils.safeSheetName(template.sheetName));
  }
  if (data.receivable_details && data.receivable_details.length > 0) {
    const template = TEMPLATES.receivable_details;
    const worksheet = ExportUtils.createWorksheet(data.receivable_details, template);
    ExportUtils.appendWorksheet(workbook, worksheet, ExportUtils.safeSheetName(template.sheetName));
  }
  if (data.receivable_payments && data.receivable_payments.length > 0) {
    const template = TEMPLATES.receivable_payments;
    const worksheet = ExportUtils.createWorksheet(data.receivable_payments, template);
    ExportUtils.appendWorksheet(workbook, worksheet, ExportUtils.safeSheetName(template.sheetName));
  }
  if (data.payable_summary && data.payable_summary.length > 0) {
    const template = TEMPLATES.payable_summary;
    const worksheet = ExportUtils.createWorksheet(data.payable_summary, template);
    ExportUtils.appendWorksheet(workbook, worksheet, ExportUtils.safeSheetName(template.sheetName));
  }
  if (data.payable_details && data.payable_details.length > 0) {
    const template = TEMPLATES.payable_details;
    const worksheet = ExportUtils.createWorksheet(data.payable_details, template);
    ExportUtils.appendWorksheet(workbook, worksheet, ExportUtils.safeSheetName(template.sheetName));
  }
  if (data.payable_payments && data.payable_payments.length > 0) {
    const template = TEMPLATES.payable_payments;
    const worksheet = ExportUtils.createWorksheet(data.payable_payments, template);
    ExportUtils.appendWorksheet(workbook, worksheet, ExportUtils.safeSheetName(template.sheetName));
  }
  return XLSX.write(workbook, {
    type: 'buffer',
    bookType: 'xlsx'
  }) as unknown as Buffer;
}
