import * as XLSX from 'xlsx';
import ExportUtils, { ExportTemplate } from '@/routes/export/utils/exportUtils';
import { TEMPLATES } from '@/routes/export/utils/exportTemplates';
import { currency_unit_symbol } from '@/utils/paths';
import { AnalysisExportOptions } from '@/routes/export/utils/types';

/**
 * Format currency value for display
 */
function formatCurrency(value: number): string {
  return `${currency_unit_symbol}${Number(value || 0).toLocaleString('zh-CN', {
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
 * Export analysis data to Excel
 */
export function generateAnalysisExcel(options: AnalysisExportOptions): Buffer {
  const { analysisData, detailData, startDate, endDate, customerCode, productModel } = options;
  const workbook = XLSX.utils.book_new();

  // Summary Sheet
  if (analysisData) {
    const labels = TEMPLATES.analysis_summary.labels || {};
    const summaryData = [
      {
        metric_name: labels.sales_amount || 'Sales Amount',
        amount: formatCurrency(analysisData.sales_amount),
        remark: `${labels.time_period || 'Time Period'}: ${startDate} - ${endDate}`,
      },
      {
        metric_name: labels.cost_amount || 'Cost Amount',
        amount: formatCurrency(analysisData.cost_amount),
        remark: `${labels.customer_filter || 'Customer'}: ${
          customerCode || labels.all || 'All'
        }, ${labels.product_filter || 'Product'}: ${productModel || labels.all || 'All'}`,
      },
      {
        metric_name: labels.profit_amount || 'Profit Amount',
        amount: formatCurrency(analysisData.profit_amount),
        remark: `${labels.last_updated || 'Last Updated'}: ${analysisData.last_updated || ''}`,
      },
      {
        metric_name: labels.profit_rate || 'Profit Margin',
        amount: formatPercentage(analysisData.profit_rate),
        remark: labels.calculation_method || 'Weighted average cost method',
      },
    ];
    const summaryWorksheet = ExportUtils.createWorksheet(summaryData, TEMPLATES.analysis_summary);
    XLSX.utils.book_append_sheet(workbook, summaryWorksheet, TEMPLATES.analysis_summary.sheetName);
  }

  // Detail Sheet
  if (detailData && detailData.length > 0) {
    const hasSpecificCustomer = customerCode && customerCode !== 'ALL';
    const hasSpecificProduct = productModel && productModel !== 'ALL';
    let template: ExportTemplate;
    let formattedDetailData: Record<string, unknown>[];

    if (hasSpecificCustomer && !hasSpecificProduct) {
      // Group by product for specific customer
      template = TEMPLATES.analysis_detail_by_product as ExportTemplate;
      formattedDetailData = detailData.map((item) => ({
        product_model: item.product_model || '',
        sales_amount: formatCurrency(item.sales_amount),
        cost_amount: formatCurrency(item.cost_amount),
        profit_amount: formatCurrency(item.profit_amount),
        profit_rate: formatPercentage(item.profit_rate),
      }));
    } else if (!hasSpecificCustomer && hasSpecificProduct) {
      // Group by customer for specific product
      template = TEMPLATES.analysis_detail_by_customer as ExportTemplate;
      formattedDetailData = detailData.map((item) => ({
        customer_code: item.customer_code || '',
        customer_name: item.customer_name || '',
        sales_amount: formatCurrency(item.sales_amount),
        cost_amount: formatCurrency(item.cost_amount),
        profit_amount: formatCurrency(item.profit_amount),
        profit_rate: formatPercentage(item.profit_rate),
      }));
    } else {
      // General detail (assuming by product model) or custom
      template = TEMPLATES.analysis_detail_by_product as ExportTemplate;
      formattedDetailData = detailData.map((item) => ({
        product_model: item.product_model || '',
        customer_code: item.customer_code || '',
        customer_name: item.customer_name || '',
        sales_amount: formatCurrency(item.sales_amount),
        cost_amount: formatCurrency(item.cost_amount),
        profit_amount: formatCurrency(item.profit_amount),
        profit_rate: formatPercentage(item.profit_rate),
      }));
    }

    const detailWorksheet = ExportUtils.createWorksheet(formattedDetailData, template);
    XLSX.utils.book_append_sheet(workbook, detailWorksheet, template.sheetName);
  }

  return XLSX.write(workbook, {
    type: 'buffer',
    bookType: 'xlsx',
  }) as unknown as Buffer;
}
