import * as XLSX from 'xlsx';
import ExportUtils from '@/routes/export/utils/exportUtils';
import { TEMPLATES } from '@/routes/export/utils/exportTemplates';
import { BaseInfoData, BasicDataFilters } from '@/routes/export/utils/types';

export function generateBaseInfoExcel(data: BaseInfoData, options: BasicDataFilters = {}): Buffer {
  const { tables = '123' } = options;
  const workbook = XLSX.utils.book_new();

  if (tables.includes('1') && data.partners) {
    const template = TEMPLATES.partners;
    const worksheet = ExportUtils.createWorksheet(data.partners, template);
    XLSX.utils.book_append_sheet(workbook, worksheet, template.sheetName);
  }
  if (tables.includes('2') && data.products) {
    const template = TEMPLATES.products;
    const worksheet = ExportUtils.createWorksheet(data.products, template);
    XLSX.utils.book_append_sheet(workbook, worksheet, template.sheetName);
  }
  if (tables.includes('3') && data.prices) {
    const template = TEMPLATES.prices;
    const worksheet = ExportUtils.createWorksheet(data.prices, template);
    XLSX.utils.book_append_sheet(workbook, worksheet, template.sheetName);
  }
  return XLSX.write(workbook, {
    type: 'buffer',
    bookType: 'xlsx',
  }) as unknown as Buffer;
}
