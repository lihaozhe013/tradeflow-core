import * as XLSX from 'xlsx';
import ExportUtils from '@/routes/export/utils/exportUtils';
import type { ExportTemplates } from '@/settings/schema';
import type { InventoryExportRow } from '@/routes/export/utils/inventoryQueries';

export function generateInventoryExcel(
  data: InventoryExportRow[],
  TEMPLATES: ExportTemplates
): Buffer {
  const workbook = XLSX.utils.book_new();
  const template = TEMPLATES.inventory;

  if (!template) {
    throw new Error('Inventory export template not found');
  }

  const worksheet = ExportUtils.createWorksheet(data, template);
  ExportUtils.appendWorksheet(workbook, worksheet, ExportUtils.safeSheetName(template.sheetName));

  return XLSX.write(workbook, {
    type: 'buffer',
    bookType: 'xlsx'
  }) as unknown as Buffer;
}
