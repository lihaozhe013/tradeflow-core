import { TEMPLATES } from '@/routes/export/utils/exportTemplates';
import ExportQueries from '@/routes/export/utils';
import BaseInfoExporter from '@/routes/export/utils/baseInfoExporter';
import TransactionExporter from '@/routes/export/utils/transactionExporter';
import FinancialExporter from '@/routes/export/utils/financialExporter';
import AnalysisExporter from '@/routes/export/utils/analysisExporter';
import AdvancedAnalysisExporter from '@/routes/export/utils/advancedAnalysisExporter';
import InvoiceExporter from '@/routes/export/utils/invoiceExporter';
import ExportUtils from '@/routes/export/utils/exportUtils';

export default class ExcelExporter {
  private queries: ExportQueries;
  private baseInfoExporter: BaseInfoExporter;
  private transactionExporter: TransactionExporter;
  private financialExporter: FinancialExporter;
  private analysisExporter: AnalysisExporter;
  private advancedAnalysisExporter: AdvancedAnalysisExporter;
  private invoiceExporter: InvoiceExporter;

  constructor() {
    this.queries = new ExportQueries();
    this.baseInfoExporter = new BaseInfoExporter(TEMPLATES as any);
    this.transactionExporter = new TransactionExporter(TEMPLATES as any);
    this.financialExporter = new FinancialExporter(TEMPLATES as any);
    this.analysisExporter = new AnalysisExporter(TEMPLATES as any);
    this.advancedAnalysisExporter = new AdvancedAnalysisExporter(TEMPLATES as any, this.queries);
    this.invoiceExporter = new InvoiceExporter(TEMPLATES as any);
  }

  async exportBaseInfo(options: any = {}): Promise<Buffer> {
    try {
      const data = await this.queries.getBaseInfoData(options.tables || '123');
      return this.baseInfoExporter.export(data, options);
    } catch (error: any) {
      throw new Error(`Base info export failed: ${error.message}`);
    }
  }

  async exportInboundOutbound(options: any = {}): Promise<Buffer> {
    try {
      const data = await this.queries.getInboundOutboundData(options);
      return this.transactionExporter.exportInboundOutbound(data, options);
    } catch (error: any) {
      throw new Error(`Inbound/outbound export failed: ${error.message}`);
    }
  }

  async exportReceivablePayable(options: any = {}): Promise<Buffer> {
    try {
      const data = await this.queries.getReceivablePayableData(options);
      return this.financialExporter.exportReceivablePayable(data);
    } catch (error: any) {
      throw new Error(`Receivable/payable export failed: ${error.message}`);
    }
  }

  async exportStatement(options: any = {}): Promise<Buffer> {
    try {
      const data = await this.queries.getInboundOutboundData(options);
      return this.transactionExporter.exportStatement(data, options);
    } catch (error: any) {
      throw new Error(`Statement export failed: ${error.message}`);
    }
  }

  async exportAnalysis(options: any = {}): Promise<Buffer> {
    try {
      return this.analysisExporter.exportAnalysis(options);
    } catch (error: any) {
      throw new Error(`Analysis export failed: ${error.message}`);
    }
  }

  async exportAdvancedAnalysis(options: any = {}): Promise<Buffer> {
    try {
      return await this.advancedAnalysisExporter.exportAdvancedAnalysis(options);
    } catch (error: any) {
      throw new Error(`Advanced analysis export failed: ${error.message}`);
    }
  }

  async exportInvoice(options: any = {}): Promise<Buffer> {
    try {
      const { partnerCode, dateFrom, dateTo } = options || {};
      if (!partnerCode) throw new Error('Partner code is required');
      const data = await this.queries.getInvoiceData({
        partnerCode,
        dateFrom,
        dateTo,
      });
      return this.invoiceExporter.exportInvoice(data, options);
    } catch (error: any) {
      throw new Error(`Invoice export failed: ${error.message}`);
    }
  }

  createWorksheet(data: any[], template: any) {
    return ExportUtils.createWorksheet(data, template);
  }

  generateFilename(exportType: string) {
    return ExportUtils.generateFilename(exportType);
  }
}
