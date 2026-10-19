import * as XLSX from 'xlsx';
import ExportUtils from '@/routes/export/utils/exportUtils';
import type { ExportTemplates } from '@/settings/schema';
import type { InvoiceItemDto } from '@/routes/export/utils/types';

export function generateInvoiceExcel(data: InvoiceItemDto[], TEMPLATES: ExportTemplates): Buffer {
  const template = TEMPLATES.invoice;
  const workbook = XLSX.utils.book_new();
  const worksheet = ExportUtils.createWorksheet(data || [], template);
  ExportUtils.appendWorksheet(workbook, worksheet, ExportUtils.safeSheetName(template.sheetName));
  return XLSX.write(workbook, {
    type: 'buffer',
    bookType: 'xlsx'
  }) as unknown as Buffer;
}

export function generateMultiInvoiceExcel(
  dataMap: Record<string, InvoiceItemDto[]>,
  TEMPLATES: ExportTemplates
): Buffer {
  const template = TEMPLATES.invoice;
  const workbook = XLSX.utils.book_new();

  for (const [partnerName, data] of Object.entries(dataMap)) {
    if (!data || data.length === 0) continue;
    const worksheet = ExportUtils.createWorksheet(data, template);
    // Sheet names in Excel have a 31 character limit and cannot contain certain characters like [ ] * ? : / \
    const safeSheetName = partnerName.replace(/[[\]*?:/\\]/g, '').substring(0, 31);

    // Check if a sheet with the same name exists (in case truncation makes matches)
    let finalSheetName = safeSheetName;
    let idx = 1;
    while (workbook.SheetNames.includes(finalSheetName)) {
      const suffix = `_${idx}`;
      finalSheetName = safeSheetName.substring(0, 31 - suffix.length) + suffix;
      idx++;
    }

    ExportUtils.appendWorksheet(workbook, worksheet, finalSheetName);
  }

  // If no sheets were added, add an empty sheet to prevent errors
  if (workbook.SheetNames.length === 0) {
    const worksheet = ExportUtils.createWorksheet([], template);
    ExportUtils.appendWorksheet(workbook, worksheet, ExportUtils.safeSheetName(template.sheetName));
  }

  return XLSX.write(workbook, {
    type: 'buffer',
    bookType: 'xlsx'
  }) as unknown as Buffer;
}
