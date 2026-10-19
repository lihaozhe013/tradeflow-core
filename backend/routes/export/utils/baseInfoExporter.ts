import * as XLSX from 'xlsx';
import ExportUtils from '@/routes/export/utils/exportUtils';
import type { ExportTemplates } from '@/settings/schema';
import type { BaseInfoData, BasicDataFilters } from '@/routes/export/utils/types';

export function generateBaseInfoExcel(
  data: BaseInfoData,
  options: BasicDataFilters = {},
  TEMPLATES: ExportTemplates
): Buffer {
  const { tables = '123' } = options;
  const workbook = XLSX.utils.book_new();

  if (tables.includes('1') && data.partners) {
    const template = TEMPLATES.partners;
    const worksheet = ExportUtils.createWorksheet(data.partners, template);
    ExportUtils.appendWorksheet(workbook, worksheet, ExportUtils.safeSheetName(template.sheetName));
  }
  if (tables.includes('2') && data.products) {
    const template = TEMPLATES.products;
    const worksheet = ExportUtils.createWorksheet(data.products, template);
    ExportUtils.appendWorksheet(workbook, worksheet, ExportUtils.safeSheetName(template.sheetName));
  }
  if (tables.includes('3') && data.prices) {
    const template = TEMPLATES.prices;
    const worksheet = ExportUtils.createWorksheet(data.prices, template);
    ExportUtils.appendWorksheet(workbook, worksheet, ExportUtils.safeSheetName(template.sheetName));
  }
  return XLSX.write(workbook, {
    type: 'buffer',
    bookType: 'xlsx'
  }) as unknown as Buffer;
}
