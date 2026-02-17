import * as XLSX from 'xlsx';
import ExportUtils from '@/routes/export/utils/exportUtils';
import { currency_unit_symbol } from '@/utils/paths';

export default class AdvancedAnalysisExporter {
  private templates: any;
  private queries: any;

  constructor(templates: any, queries: any) {
    this.templates = templates;
    this.queries = queries;
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
   * Truncate sheet name to Excel's 31 character limit
   */
  private truncateSheetName(name: string, maxLength: number = 31): string {
    return name.substring(0, maxLength);
  }

  /**
   * Get unique sheet name
   */
  private getUniqueSheetName(workbook: XLSX.WorkBook, name: string): string {
    const existingNames = new Set(workbook.SheetNames);
    let finalName = this.truncateSheetName(name);
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
  async exportAdvancedAnalysis(options: any = {}): Promise<Buffer> {
    const { exportType, startDate, endDate } = options || {};
    if (!exportType || !['customer', 'product'].includes(exportType)) {
      throw new Error('Export type must be customer or product');
    }
    const workbook = XLSX.utils.book_new();
    if (exportType === 'customer') {
      await this.createCustomerSheets(workbook, startDate, endDate);
    } else {
      await this.createProductSheets(workbook, startDate, endDate);
    }
    return XLSX.write(workbook, {
      type: 'buffer',
      bookType: 'xlsx',
    }) as unknown as Buffer;
  }

  /**
   * Create customer analysis sheets
   */
  private async createCustomerSheets(workbook: XLSX.WorkBook, startDate: string, endDate: string) {
    const customerData = await this.queries.getCustomerAnalysisData(startDate, endDate);
    const summaryLabels = this.templates.analysis_customer_summary.labels || {};
    const detailLabels = this.templates.analysis_customer_detail.labels || {};

    for (const customer of customerData) {
      if (customer.sales_amount !== 0) {
        // Create summary sheet
        const summaryData = [
          {
            customer_code: customer.customer_code,
            customer_name: customer.customer_name,
            sales_amount: this.formatCurrency(customer.sales_amount),
            cost_amount: this.formatCurrency(customer.cost_amount),
            profit_amount: this.formatCurrency(customer.profit_amount),
            profit_rate: this.formatPercentage(customer.profit_rate),
          },
        ];
        const summaryWorksheet = ExportUtils.createWorksheet(
          summaryData,
          this.templates.analysis_customer_summary,
        );
        const summarySheetName = this.getUniqueSheetName(
          workbook,
          `${customer.customer_name}-${summaryLabels.summary_suffix || 'Summary'}`,
        );
        XLSX.utils.book_append_sheet(workbook, summaryWorksheet, summarySheetName);

        // Create detail sheet if product details exist
        if (customer.product_details && customer.product_details.length > 0) {
          const detailData = customer.product_details
            .filter((item: any) => item.sales_amount !== 0)
            .map((item: any) => ({
              product_model: item.product_model,
              sales_amount: this.formatCurrency(item.sales_amount),
              cost_amount: this.formatCurrency(item.cost_amount),
              profit_amount: this.formatCurrency(item.profit_amount),
              profit_rate: this.formatPercentage(item.profit_rate),
            }));
          if (detailData.length > 0) {
            const detailWorksheet = ExportUtils.createWorksheet(
              detailData,
              this.templates.analysis_customer_detail,
            );
            const detailSheetName = this.getUniqueSheetName(
              workbook,
              `${customer.customer_name}-${detailLabels.detail_suffix || 'Details'}`,
            );
            XLSX.utils.book_append_sheet(workbook, detailWorksheet, detailSheetName);
          }
        }
      }
    }
  }

  /**
   * Create product analysis sheets
   */
  private async createProductSheets(workbook: XLSX.WorkBook, startDate: string, endDate: string) {
    const productData = await this.queries.getProductAnalysisData(startDate, endDate);
    const summaryLabels = this.templates.analysis_product_summary.labels || {};
    const detailLabels = this.templates.analysis_product_detail.labels || {};

    for (const product of productData) {
      if (product.sales_amount !== 0) {
        // Create summary sheet
        const summaryData = [
          {
            product_model: product.product_model,
            sales_amount: this.formatCurrency(product.sales_amount),
            cost_amount: this.formatCurrency(product.cost_amount),
            profit_amount: this.formatCurrency(product.profit_amount),
            profit_rate: this.formatPercentage(product.profit_rate),
          },
        ];
        const summaryWorksheet = ExportUtils.createWorksheet(
          summaryData,
          this.templates.analysis_product_summary,
        );
        const summarySheetName = this.getUniqueSheetName(
          workbook,
          `${product.product_model}-${summaryLabels.summary_suffix || 'Summary'}`,
        );
        XLSX.utils.book_append_sheet(workbook, summaryWorksheet, summarySheetName);

        // Create detail sheet if customer details exist
        if (product.customer_details && product.customer_details.length > 0) {
          const detailData = product.customer_details
            .filter((item: any) => item.sales_amount !== 0)
            .map((item: any) => ({
              customer_code: item.customer_code,
              customer_name: item.customer_name,
              sales_amount: this.formatCurrency(item.sales_amount),
              cost_amount: this.formatCurrency(item.cost_amount),
              profit_amount: this.formatCurrency(item.profit_amount),
              profit_rate: this.formatPercentage(item.profit_rate),
            }));
          if (detailData.length > 0) {
            const detailWorksheet = ExportUtils.createWorksheet(
              detailData,
              this.templates.analysis_product_detail,
            );
            const detailSheetName = this.getUniqueSheetName(
              workbook,
              `${product.product_model}-${detailLabels.detail_suffix || 'Details'}`,
            );
            XLSX.utils.book_append_sheet(workbook, detailWorksheet, detailSheetName);
          }
        }
      }
    }
  }
}
