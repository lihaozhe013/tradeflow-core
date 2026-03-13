import * as XLSX from "xlsx";
import ExportUtils from "@/routes/export/utils/exportUtils";
import { TEMPLATES } from "@/routes/export/utils/exportTemplates";
import { currency_unit_symbol } from "@/utils/paths";
import {
  getCustomerAnalysisData,
  getProductAnalysisData,
} from "./analysisQueries";

/**
 * Format currency value for display
 */
function formatCurrency(value: number): string {
  return `${currency_unit_symbol}${Number(value || 0).toLocaleString("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * Format percentage value for display
 */
function formatPercentage(value: number): string {
  return `${Number(value || 0).toFixed(2)}%`;
}

/**
 * Truncate sheet name to Excel's 31 character limit
 */
function truncateSheetName(name: string, maxLength: number = 31): string {
  return name.substring(0, maxLength);
}

/**
 * Get unique sheet name
 */
function getUniqueSheetName(workbook: XLSX.WorkBook, name: string): string {
  const existingNames = new Set(workbook.SheetNames);
  let finalName = truncateSheetName(name);
  let counter = 1;

  while (existingNames.has(finalName)) {
    const suffix = `(${counter})`;
    const maxBaseLength = 31 - suffix.length;
    finalName = `${name.substring(0, maxBaseLength)}${suffix}`;
    counter++;
  }
  return finalName;
}

/**
 * Export advanced analysis data
 */
export async function generateAdvancedAnalysisExcel(
  options: { exportType?: string; startDate?: string; endDate?: string } = {},
): Promise<Buffer> {
  const { exportType, startDate, endDate } = options;

  if (!exportType || !["customer", "product"].includes(exportType)) {
    throw new Error("Export type must be customer or product");
  }

  const workbook = XLSX.utils.book_new();

  if (exportType === "customer") {
    const customerData = await getCustomerAnalysisData(startDate || "", endDate || "");
    const summaryLabels = TEMPLATES.analysis_customer_summary.labels || {};
    const detailLabels = TEMPLATES.analysis_customer_detail.labels || {};

    for (const customer of customerData) {
      if (customer.sales_amount !== 0) {
        // Create summary sheet
        const summaryData = [
          {
            customer_code: customer.customer_code,
            customer_name: customer.customer_name,
            sales_amount: formatCurrency(customer.sales_amount),
            cost_amount: formatCurrency(customer.cost_amount),
            profit_amount: formatCurrency(customer.profit_amount),
            profit_rate: formatPercentage(customer.profit_rate),
          },
        ];
        const summaryWorksheet = ExportUtils.createWorksheet(
          summaryData,
          TEMPLATES.analysis_customer_summary,
        );
        const summarySheetName = getUniqueSheetName(
          workbook,
          `${customer.customer_name}-${
            summaryLabels.summary_suffix || "Summary"
          }`,
        );
        XLSX.utils.book_append_sheet(
          workbook,
          summaryWorksheet,
          summarySheetName,
        );

        // Create detail sheet if product details exist
        if (customer.product_details && customer.product_details.length > 0) {
          const detailData = customer.product_details
            .filter((item) => item.sales_amount !== 0)
            .map((item) => ({
              product_model: item.product_model,
              sales_amount: formatCurrency(item.sales_amount),
              cost_amount: formatCurrency(item.cost_amount),
              profit_amount: formatCurrency(item.profit_amount),
              profit_rate: formatPercentage(item.profit_rate),
            }));

          if (detailData.length > 0) {
            const detailWorksheet = ExportUtils.createWorksheet(
              detailData,
              TEMPLATES.analysis_customer_detail,
            );
            const detailSheetName = getUniqueSheetName(
              workbook,
              `${customer.customer_name}-${
                detailLabels.detail_suffix || "Details"
              }`,
            );
            XLSX.utils.book_append_sheet(
              workbook,
              detailWorksheet,
              detailSheetName,
            );
          }
        }
      }
    }
  } else {
    // Product export
    const productData = await getProductAnalysisData(startDate || "", endDate || "");
    const summaryLabels = TEMPLATES.analysis_product_summary.labels || {};
    const detailLabels = TEMPLATES.analysis_product_detail.labels || {};

    for (const product of productData) {
      if (product.sales_amount !== 0) {
        const summaryData = [
          {
            product_model: product.product_model,
            sales_amount: formatCurrency(product.sales_amount),
            cost_amount: formatCurrency(product.cost_amount),
            profit_amount: formatCurrency(product.profit_amount),
            profit_rate: formatPercentage(product.profit_rate),
          },
        ];
        const summaryWorksheet = ExportUtils.createWorksheet(
          summaryData,
          TEMPLATES.analysis_product_summary,
        );
        const summarySheetName = getUniqueSheetName(
          workbook,
          `${product.product_model}-${
            summaryLabels.summary_suffix || "Summary"
          }`,
        );
        XLSX.utils.book_append_sheet(
          workbook,
          summaryWorksheet,
          summarySheetName,
        );

        if (product.customer_details && product.customer_details.length > 0) {
          const detailData = product.customer_details
            .filter((item) => item.sales_amount !== 0)
            .map((item) => ({
              customer_code: item.customer_code,
              customer_name: item.customer_name,
              sales_amount: formatCurrency(item.sales_amount),
              cost_amount: formatCurrency(item.cost_amount),
              profit_amount: formatCurrency(item.profit_amount),
              profit_rate: formatPercentage(item.profit_rate),
            }));

          if (detailData.length > 0) {
            const detailWorksheet = ExportUtils.createWorksheet(
              detailData,
              TEMPLATES.analysis_product_detail,
            );
            const detailSheetName = getUniqueSheetName(
              workbook,
              `${product.product_model}-${
                detailLabels.detail_suffix || "Details"
              }`,
            );
            XLSX.utils.book_append_sheet(
              workbook,
              detailWorksheet,
              detailSheetName,
            );
          }
        }
      }
    }
  }

  return XLSX.write(workbook, {
    type: "buffer",
    bookType: "xlsx",
  }) as unknown as Buffer;
}
