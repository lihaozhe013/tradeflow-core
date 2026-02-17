import * as XLSX from 'xlsx';
import ExportUtils from '@/routes/export/utils/exportUtils';

export default class TransactionExporter {
  private templates: any;
  constructor(templates: any) {
    this.templates = templates;
  }

  exportInboundOutbound(data: any, options: any = {}): Buffer {
    const workbook = XLSX.utils.book_new();
    if (options.tables?.includes('1') && data.inbound) {
      const worksheet = ExportUtils.createWorksheet(data.inbound, this.templates.inbound);
      XLSX.utils.book_append_sheet(workbook, worksheet, this.templates.inbound.sheetName);
    }
    if (options.tables?.includes('2') && data.outbound) {
      const worksheet = ExportUtils.createWorksheet(data.outbound, this.templates.outbound);
      XLSX.utils.book_append_sheet(workbook, worksheet, this.templates.outbound.sheetName);
    }
    return XLSX.write(workbook, {
      type: 'buffer',
      bookType: 'xlsx',
    }) as unknown as Buffer;
  }

  exportStatement(data: any, options: any = {}): Buffer {
    const workbook = XLSX.utils.book_new();
    if (options.tables?.includes('1') && data.inbound) {
      const worksheet = ExportUtils.createWorksheet(data.inbound, this.templates.inbound_statement);
      XLSX.utils.book_append_sheet(workbook, worksheet, this.templates.inbound_statement.sheetName);
    }
    if (options.tables?.includes('2') && data.outbound) {
      const worksheet = ExportUtils.createWorksheet(
        data.outbound,
        this.templates.outbound_statement,
      );
      XLSX.utils.book_append_sheet(
        workbook,
        worksheet,
        this.templates.outbound_statement.sheetName,
      );
    }
    return XLSX.write(workbook, {
      type: 'buffer',
      bookType: 'xlsx',
    }) as unknown as Buffer;
  }
}
