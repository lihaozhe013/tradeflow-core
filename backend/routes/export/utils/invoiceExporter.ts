import * as XLSX from 'xlsx';
import ExportUtils from '@/routes/export/utils/exportUtils';

export default class InvoiceExporter {
  private templates: any;
  constructor(templates: any) {
    this.templates = templates;
  }

  exportInvoice(data: any[], _options: any = {}): Buffer {
    const workbook = XLSX.utils.book_new();
    const worksheet = ExportUtils.createWorksheet(data || [], this.templates.invoice);
    XLSX.utils.book_append_sheet(workbook, worksheet, this.templates.invoice.sheetName);
    return XLSX.write(workbook, {
      type: 'buffer',
      bookType: 'xlsx',
    }) as unknown as Buffer;
  }
}
