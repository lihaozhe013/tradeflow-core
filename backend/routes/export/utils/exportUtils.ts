import * as XLSX from 'xlsx';

export type ExportColumn = { key: string; label: string; visible?: boolean };
export type ExportTemplate = { sheetName: string; columns: ExportColumn[] };

/**
 * Generate export filename with timestamp
 */
export function generateFilename(exportType: string): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const typeMap: Record<string, string> = {
    'base-info': 'Base-Info-Export',
    'inbound-outbound': 'Inbound-Outbound-Export',
    'receivable-payable': 'Receivable-Payable-Export',
    invoice: 'Invoice-Export',
    statement: 'Statement-Export',
    analysis: 'Analysis-Export'
  };
  const typeName = typeMap[exportType] || exportType;
  return `${typeName}_${timestamp}.xlsx`;
}

/**
 * Create worksheet using template configuration
 */
export function createWorksheet(data: unknown[], template: ExportTemplate) {
  // Create headers
  const columns = template.columns.filter((column) => column.visible !== false);
  const headers = columns.map((col) => col.label);
  const dataRows = data.map((item) =>
    columns.map((col) => {
      const row = item as Record<string, unknown>;
      // Handle nested properties if key contains dot
      if (col.key.includes('.')) {
        return (
          col.key
            .split('.')
            .reduce<unknown>((obj, key) => (obj as Record<string, unknown>)?.[key], row) ?? ''
        );
      }
      return row[col.key] ?? '';
    })
  );

  const wsData = [headers, ...dataRows];
  const worksheet = XLSX.utils.aoa_to_sheet(wsData);

  // Set column widths
  const colWidths = columns.map(() => ({ wch: 15 }));
  worksheet['!cols'] = colWidths;

  return worksheet;
}

export function safeSheetName(name: string): string {
  return (
    name
      .replace(/[[\]*?:/\\]/g, '_')
      .replace(/^'+|'+$/g, '')
      .slice(0, 31) || 'Sheet'
  );
}

export function appendWorksheet(
  workbook: XLSX.WorkBook,
  worksheet: XLSX.WorkSheet,
  name: string
): void {
  const base = safeSheetName(name);
  const used = new Set(workbook.SheetNames.map((value) => value.toLowerCase()));
  let candidate = base;
  let count = 1;
  while (used.has(candidate.toLowerCase())) {
    const suffix = `_${count++}`;
    candidate = base.slice(0, 31 - suffix.length) + suffix;
  }
  XLSX.utils.book_append_sheet(workbook, worksheet, candidate);
}

export default {
  appendWorksheet,
  safeSheetName,
  generateFilename,
  createWorksheet
};
