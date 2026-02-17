import * as XLSX from 'xlsx';
import ExportUtils from '@/routes/export/utils/exportUtils';

export default class BaseInfoExporter {
  private templates: any;
  constructor(templates: any) {
    this.templates = templates;
  }

  export(data: any, options: any = {}): Buffer {
    const { tables = '123' } = options || {};
    const workbook = XLSX.utils.book_new();
    if (tables.includes('1') && data.partners) {
      const worksheet = ExportUtils.createWorksheet(data.partners, this.templates.partners);
      XLSX.utils.book_append_sheet(workbook, worksheet, this.templates.partners.sheetName);
    }
    if (tables.includes('2') && data.products) {
      const worksheet = ExportUtils.createWorksheet(data.products, this.templates.products);
      XLSX.utils.book_append_sheet(workbook, worksheet, this.templates.products.sheetName);
    }
    if (tables.includes('3') && data.prices) {
      const worksheet = ExportUtils.createWorksheet(data.prices, this.templates.prices);
      XLSX.utils.book_append_sheet(workbook, worksheet, this.templates.prices.sheetName);
    }
    return XLSX.write(workbook, {
      type: 'buffer',
      bookType: 'xlsx',
    }) as unknown as Buffer;
  }
}
