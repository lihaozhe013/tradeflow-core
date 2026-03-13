import * as XLSX from "xlsx";

export type ExportColumn = { key: string; label: string };
export type ExportTemplate = { sheetName: string; columns: ExportColumn[] };

/**
 * Generate export filename with timestamp
 */
export function generateFilename(exportType: string): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const typeMap: Record<string, string> = {
    "base-info": "Base-Info-Export",
    "inbound-outbound": "Inbound-Outbound-Export",
    "receivable-payable": "Receivable-Payable-Export",
    invoice: "Invoice-Export",
    statement: "Statement-Export",
    analysis: "Analysis-Export",
  };
  const typeName = typeMap[exportType] || exportType;
  return `${typeName}_${timestamp}.xlsx`;
}

/**
 * Create worksheet using template configuration
 */
export function createWorksheet(data: unknown[], template: ExportTemplate) {
  // Create headers
  const headers = template.columns.map((col) => col.label);
  const dataRows = data.map((item) =>
    template.columns.map((col) => {
      const row = item as Record<string, unknown>;
      // Handle nested properties if key contains dot
      if (col.key.includes(".")) {
        return (
          col.key
            .split(".")
            .reduce<unknown>(
              (obj, key) => (obj as Record<string, unknown>)?.[key],
              row,
            ) ?? ""
        );
      }
      return row[col.key] ?? "";
    }),
  );

  const wsData = [headers, ...dataRows];
  const worksheet = XLSX.utils.aoa_to_sheet(wsData);

  // Set column widths
  const colWidths = template.columns.map(() => ({ wch: 15 }));
  worksheet["!cols"] = colWidths;

  return worksheet;
}

export default {
  generateFilename,
  createWorksheet,
};
