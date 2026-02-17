import * as XLSX from 'xlsx';
import ExportUtils from '@/routes/export/utils/exportUtils';
import { currency_unit_symbol } from '@/utils/paths';

export default class AnalysisExporter {
  private templates: any;

  constructor(templates: any) {
    this.templates = templates;
  }

  /**
   * Format currency value for display
   */
  private formatCurrency(value: number): string {
    return `${currency_unit_symbol}${Number(value || 0).toLocaleString('zh-CN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }

  /**
   * Format percentage value for display
   */
  private formatPercentage(value: number): string {
    return `${Number(value || 0).toFixed(2)}%`;
  }

  /**
   * Export analysis data to Excel
   */
  exportAnalysis(options: any = {}): Buffer {
    const { analysisData, detailData, startDate, endDate, customerCode, productModel } =
      options || {};
    const workbook = XLSX.utils.book_new();

    if (analysisData) {
      const labels = this.templates.analysis_summary.labels || {};
      const summaryData = [
        {
          metric_name: labels.sales_amount || 'Sales Amount',
          amount: this.formatCurrency(analysisData.sales_amount),
          remark: `${labels.time_period || 'Time Period'}: ${startDate} - ${endDate}`,
        },
        {
          metric_name: labels.cost_amount || 'Cost Amount',
          amount: this.formatCurrency(analysisData.cost_amount),
          remark: `${labels.customer_filter || 'Customer'}: ${
            customerCode || labels.all || 'All'
          }, ${labels.product_filter || 'Product'}: ${productModel || labels.all || 'All'}`,
        },
        {
          metric_name: labels.profit_amount || 'Profit Amount',
          amount: this.formatCurrency(analysisData.profit_amount),
          remark: `${labels.last_updated || 'Last Updated'}: ${analysisData.last_updated || ''}`,
        },
        {
          metric_name: labels.profit_rate || 'Profit Margin',
          amount: this.formatPercentage(analysisData.profit_rate),
          remark: labels.calculation_method || 'Weighted average cost method',
        },
      ];
      const summaryWorksheet = ExportUtils.createWorksheet(
        summaryData,
        this.templates.analysis_summary,
      );
      XLSX.utils.book_append_sheet(
        workbook,
        summaryWorksheet,
        this.templates.analysis_summary.sheetName,
      );
    }

    if (detailData && detailData.length > 0) {
      const hasSpecificCustomer = customerCode && customerCode !== 'ALL';
      const hasSpecificProduct = productModel && productModel !== 'ALL';
      let template: any, formattedDetailData: any[];

      if (hasSpecificCustomer && !hasSpecificProduct) {
        // Group by product for specific customer
        template = this.templates.analysis_detail_by_product;
        formattedDetailData = detailData.map((item: any) => ({
          product_model: item.product_model || '',
          sales_amount: this.formatCurrency(item.sales_amount),
          cost_amount: this.formatCurrency(item.cost_amount),
          profit_amount: this.formatCurrency(item.profit_amount),
          profit_rate: this.formatPercentage(item.profit_rate),
        }));
      } else if (!hasSpecificCustomer && hasSpecificProduct) {
        // Group by customer for specific product
        template = this.templates.analysis_detail_by_customer;
        formattedDetailData = detailData.map((item: any) => ({
          customer_code: item.customer_code || '',
          customer_name: item.customer_name || '',
          sales_amount: this.formatCurrency(item.sales_amount),
          cost_amount: this.formatCurrency(item.cost_amount),
          profit_amount: this.formatCurrency(item.profit_amount),
          profit_rate: this.formatPercentage(item.profit_rate),
        }));
      } else {
        // Full details with both customer and product
        template = this.templates.analysis_detail;
        formattedDetailData = detailData.map((item: any) => ({
          customer_code: item.customer_code || '',
          customer_name: item.customer_name || '',
          product_model: item.product_model || '',
          sales_amount: this.formatCurrency(item.sales_amount),
          cost_amount: this.formatCurrency(item.cost_amount),
          profit_amount: this.formatCurrency(item.profit_amount),
          profit_rate: this.formatPercentage(item.profit_rate),
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
}
