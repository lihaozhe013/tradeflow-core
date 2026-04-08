import * as XLSX from 'xlsx';
import ExportUtils from '@/routes/export/utils/exportUtils';
import { TEMPLATES } from '@/routes/export/utils/exportTemplates';
import { InvoiceItemDto } from '@/routes/export/utils/types';

export function generateInvoiceExcel(data: InvoiceItemDto[]): Buffer {
  const template = TEMPLATES.invoice;
  const workbook = XLSX.utils.book_new();
  const worksheet = ExportUtils.createWorksheet(data || [], template);
  XLSX.utils.book_append_sheet(workbook, worksheet, template.sheetName);
  return XLSX.write(workbook, {
    type: 'buffer',
    bookType: 'xlsx',
  }) as unknown as Buffer;
}

export function generateMultiInvoiceExcel(dataMap: Record<string, InvoiceItemDto[]>): Buffer {
  const template = TEMPLATES.invoice;
  const workbook = XLSX.utils.book_new();

  for (const [partnerName, data] of Object.entries(dataMap)) {
    if (!data || data.length === 0) continue;
    const worksheet = ExportUtils.createWorksheet(data, template);
    // Sheet names in Excel have a 31 character limit and cannot contain certain characters like [ ] * ? : / \
    const safeSheetName = partnerName.replace(/[\[\]*?:/\\]/g, '').substring(0, 31);

    // Check if a sheet with the same name exists (in case truncation makes matches)
    let finalSheetName = safeSheetName;
    let idx = 1;
    while (workbook.SheetNames.includes(finalSheetName)) {
      const suffix = `_${idx}`;
      finalSheetName = safeSheetName.substring(0, 31 - suffix.length) + suffix;
      idx++;
    }

    XLSX.utils.book_append_sheet(workbook, worksheet, finalSheetName);
  }

  // If no sheets were added, add an empty sheet to prevent errors
  if (workbook.SheetNames.length === 0) {
    const worksheet = ExportUtils.createWorksheet([], template);
    XLSX.utils.book_append_sheet(workbook, worksheet, template.sheetName);
  }

  return XLSX.write(workbook, {
    type: 'buffer',
    bookType: 'xlsx',
  }) as unknown as Buffer;
}
