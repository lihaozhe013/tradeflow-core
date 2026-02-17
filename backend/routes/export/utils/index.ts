import BasicDataQueries from '@/routes/export/utils/basicDataQueries';
import TransactionQueries from '@/routes/export/utils/transactionQueries';
import ReceivableQueries from '@/routes/export/utils/receivableQueries';
import PayableQueries from '@/routes/export/utils/payableQueries';
import InvoiceQueries from '@/routes/export/utils/invoiceQueries';
import AnalysisQueries from '@/routes/export/utils/analysisQueries';

export default class ExportQueries {
  basicData: BasicDataQueries;
  transaction: TransactionQueries;
  receivable: ReceivableQueries;
  payable: PayableQueries;
  invoice: InvoiceQueries;
  analysis: AnalysisQueries;

  constructor() {
    this.basicData = new BasicDataQueries();
    this.transaction = new TransactionQueries();
    this.receivable = new ReceivableQueries();
    this.payable = new PayableQueries();
    this.invoice = new InvoiceQueries();
    this.analysis = new AnalysisQueries();
  }

  async getBaseInfoData(tables: string = '123') {
    return this.basicData.getBaseInfoData(tables);
  }

  async getInboundOutboundData(filters: any = {}) {
    return this.transaction.getInboundOutboundData(filters);
  }

  async getReceivablePayableData(filters: any = {}) {
    const { outboundFrom, outboundTo, paymentFrom, paymentTo } = filters || {};
    return {
      receivable_summary: await this.receivable.getReceivableSummary({
        outboundFrom,
        outboundTo,
        paymentFrom,
        paymentTo,
      }),
      receivable_details: await this.receivable.getReceivableDetails({
        outboundFrom,
        outboundTo,
      }),
      receivable_payments: await this.receivable.getReceivablePayments({
        paymentFrom,
        paymentTo,
      }),
      payable_summary: await this.payable.getPayableSummary({
        outboundFrom,
        outboundTo,
        paymentFrom,
        paymentTo,
      }),
      payable_details: await this.payable.getPayableDetails({
        outboundFrom,
        outboundTo,
      }),
      payable_payments: await this.payable.getPayablePayments({
        paymentFrom,
        paymentTo,
      }),
    };
  }

  async getInvoiceData(filters: any = {}) {
    return this.invoice.getInvoiceData(filters);
  }

  async getCustomerAnalysisData(startDate: string, endDate: string) {
    return this.analysis.getCustomerAnalysisData(startDate, endDate);
  }

  async getProductAnalysisData(startDate: string, endDate: string) {
    return this.analysis.getProductAnalysisData(startDate, endDate);
  }

  // Direct proxy methods for backward compatibility
  getPartnersData() {
    return this.basicData.getPartnersData();
  }
  getProductsData() {
    return this.basicData.getProductsData();
  }
  getPricesData() {
    return this.basicData.getPricesData();
  }
  getInboundData(filters: any = {}) {
    return this.transaction.getInboundData(filters);
  }
  getOutboundData(filters: any = {}) {
    return this.transaction.getOutboundData(filters);
  }
  getReceivableSummary(filters: any = {}) {
    return this.receivable.getReceivableSummary(filters);
  }
  getReceivableDetails(filters: any = {}) {
    return this.receivable.getReceivableDetails(filters);
  }
  getReceivablePayments(filters: any = {}) {
    return this.receivable.getReceivablePayments(filters);
  }
  getPayableSummary(filters: any = {}) {
    return this.payable.getPayableSummary(filters);
  }
  getPayableDetails(filters: any = {}) {
    return this.payable.getPayableDetails(filters);
  }
  getPayablePayments(filters: any = {}) {
    return this.payable.getPayablePayments(filters);
  }
}
