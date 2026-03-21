import * as XLSX from "xlsx";
import ExportUtils from "@/routes/export/utils/exportUtils";
import { TEMPLATES } from "@/routes/export/utils/exportTemplates";
import { InventoryExportRow } from "@/routes/export/utils/inventoryQueries";

export function generateInventoryExcel(data: InventoryExportRow[]): Buffer {
  const workbook = XLSX.utils.book_new();
  const template = (TEMPLATES as any).inventory;

  if (!template) {
    throw new Error("Inventory export template not found");
  }

  const worksheet = ExportUtils.createWorksheet(data, template);
  XLSX.utils.book_append_sheet(workbook, worksheet, template.sheetName);

  return XLSX.write(workbook, {
    type: "buffer",
    bookType: "xlsx",
  }) as unknown as Buffer;
}
