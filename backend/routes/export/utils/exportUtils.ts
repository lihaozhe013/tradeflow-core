import * as XLSX from 'xlsx';

export type ExportColumn = { key: string; label: string };
export type ExportTemplate = { sheetName: string; columns: ExportColumn[] };

export default class ExportUtils {
  /**
   * Generate export filename with timestamp
   */
  static generateFilename(exportType: string): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const typeMap: Record<string, string> = {
      'base-info': 'Base-Info-Export',
      'inbound-outbound': 'Inbound-Outbound-Export',
      'receivable-payable': 'Receivable-Payable-Export',
      invoice: 'Invoice-Export',
      statement: 'Statement-Export',
      analysis: 'Analysis-Export',
    };
    const typeName = typeMap[exportType] || exportType;
    return `${typeName}_${timestamp}.xlsx`;
  }

  /**
   * Create worksheet using template configuration
   */
  static createWorksheet(data: any[], template: ExportTemplate) {
    // Create headers
    const headers = template.columns.map((col) => col.label);

    // Create data rows
    const rows = (data || []).map((item) =>
      template.columns.map((col) => {
        const value = (item as any)[col.key];
        if (typeof value === 'number') return value;
        return value != null ? String(value) : '';
      }),
    );

    // Merge headers and data
    const sheetData = [headers, ...rows];

    // Create worksheet
    const worksheet = XLSX.utils.aoa_to_sheet(sheetData);

    // Set column widths
    const colWidths = template.columns.map((col) => {
      const labelWidth = col.label.length * 2;
      let dataWidth = 10;
      if (col.key.includes('date')) dataWidth = 12;
      else if (col.key.includes('price') || col.key.includes('amount')) dataWidth = 15;
      else if (col.key.includes('name') || col.key.includes('address')) dataWidth = 20;
      return { wch: Math.max(labelWidth, dataWidth) };
    });

    (worksheet as any)['!cols'] = colWidths;
    return worksheet;
  }
}
