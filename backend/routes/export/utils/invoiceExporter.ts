import * as XLSX from "xlsx";
import ExportUtils from "@/routes/export/utils/exportUtils";
import { TEMPLATES } from "@/routes/export/utils/exportTemplates";
import { InvoiceItemDto } from "@/routes/export/utils/types";

export function generateInvoiceExcel(data: InvoiceItemDto[]): Buffer {
  const template = TEMPLATES.invoice;
  const workbook = XLSX.utils.book_new();
  const worksheet = ExportUtils.createWorksheet(data || [], template);
  XLSX.utils.book_append_sheet(workbook, worksheet, template.sheetName);
  return XLSX.write(workbook, {
    type: "buffer",
    bookType: "xlsx",
  }) as unknown as Buffer;
}
