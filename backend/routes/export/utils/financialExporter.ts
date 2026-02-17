import * as XLSX from 'xlsx';
import ExportUtils from '@/routes/export/utils/exportUtils';

export default class FinancialExporter {
  private templates: any;
  constructor(templates: any) {
    this.templates = templates;
  }

  exportReceivablePayable(data: any): Buffer {
    const workbook = XLSX.utils.book_new();
    if (data.receivable_summary && data.receivable_summary.length > 0) {
      const worksheet = ExportUtils.createWorksheet(
        data.receivable_summary,
        this.templates.receivable_summary,
      );
      XLSX.utils.book_append_sheet(
        workbook,
        worksheet,
        this.templates.receivable_summary.sheetName,
      );
    }
    if (data.receivable_details && data.receivable_details.length > 0) {
      const worksheet = ExportUtils.createWorksheet(
        data.receivable_details,
        this.templates.receivable_details,
      );
      XLSX.utils.book_append_sheet(
        workbook,
        worksheet,
        this.templates.receivable_details.sheetName,
      );
    }
    if (data.receivable_payments && data.receivable_payments.length > 0) {
      const worksheet = ExportUtils.createWorksheet(
        data.receivable_payments,
        this.templates.receivable_payments,
      );
      XLSX.utils.book_append_sheet(
        workbook,
        worksheet,
        this.templates.receivable_payments.sheetName,
      );
    }
    if (data.payable_summary && data.payable_summary.length > 0) {
      const worksheet = ExportUtils.createWorksheet(
        data.payable_summary,
        this.templates.payable_summary,
      );
      XLSX.utils.book_append_sheet(workbook, worksheet, this.templates.payable_summary.sheetName);
    }
    if (data.payable_details && data.payable_details.length > 0) {
      const worksheet = ExportUtils.createWorksheet(
        data.payable_details,
        this.templates.payable_details,
      );
      XLSX.utils.book_append_sheet(workbook, worksheet, this.templates.payable_details.sheetName);
    }
    if (data.payable_payments && data.payable_payments.length > 0) {
      const worksheet = ExportUtils.createWorksheet(
        data.payable_payments,
        this.templates.payable_payments,
      );
      XLSX.utils.book_append_sheet(workbook, worksheet, this.templates.payable_payments.sheetName);
    }
    return XLSX.write(workbook, {
      type: 'buffer',
      bookType: 'xlsx',
    }) as unknown as Buffer;
  }
}
