import {
  BasicDataFilters,
  TransactionFilters,
  ReceivablePayableFilters,
  InvoiceFilters,
  AnalysisExportOptions,
} from '@/routes/export/utils/types';
import { getBaseInfoData } from '@/routes/export/utils/basicDataQueries';
import { generateBaseInfoExcel } from '@/routes/export/utils/baseInfoExporter';
import { getInboundOutboundData } from '@/routes/export/utils/transactionQueries';
import { generateTransactionExcel, generateStatementExcel } from '@/routes/export/utils/transactionExporter';
import {
  getReceivableSummary,
  getReceivableDetails,
  getReceivablePayments,
} from '@/routes/export/utils/receivableQueries';
import { getPayableSummary, getPayableDetails, getPayablePayments } from '@/routes/export/utils/payableQueries';
import { generateFinancialExcel } from '@/routes/export/utils/financialExporter';
import { generateAnalysisExcel } from '@/routes/export/utils/analysisExporter';
import { generateAdvancedAnalysisExcel } from '@/routes/export/utils/advancedAnalysisExporter';
import { getInvoiceData } from '@/routes/export/utils/invoiceQueries';
import { generateInvoiceExcel } from '@/routes/export/utils/invoiceExporter';
import { getInventoryData } from '@/routes/export/utils/inventoryQueries';
import { generateInventoryExcel } from '@/routes/export/utils/inventoryExporter';

export async function exportBaseInfo(options: BasicDataFilters = {}): Promise<Buffer> {
  const data = await getBaseInfoData(options.tables || '123');
  return generateBaseInfoExcel(data, options);
}

export async function exportInboundOutbound(options: TransactionFilters = {}): Promise<Buffer> {
  const data = await getInboundOutboundData(options);
  return generateTransactionExcel(data, options);
}

export async function exportReceivablePayable(
  options: ReceivablePayableFilters = {},
): Promise<Buffer> {
  const { outboundFrom, outboundTo, paymentFrom, paymentTo } = options || {};
  const data = {
    receivable_summary: await getReceivableSummary({
      outboundFrom,
      outboundTo,
      paymentFrom,
      paymentTo,
    }),
    receivable_details: await getReceivableDetails({
      outboundFrom,
      outboundTo,
    }),
    receivable_payments: await getReceivablePayments({
      paymentFrom,
      paymentTo,
    }),
    payable_summary: await getPayableSummary({
      outboundFrom,
      outboundTo,
      paymentFrom,
      paymentTo,
    }),
    payable_details: await getPayableDetails({ outboundFrom, outboundTo }),
    payable_payments: await getPayablePayments({ paymentFrom, paymentTo }),
  };
  return generateFinancialExcel(data); // Use "data" directly, assuming type compatibility will be checked
}

export async function exportStatement(options: TransactionFilters = {}): Promise<Buffer> {
  const data = await getInboundOutboundData(options);
  return generateStatementExcel(data, options);
}

export async function exportAnalysis(options: AnalysisExportOptions): Promise<Buffer> {
  // Purely formatting provided data
  return generateAnalysisExcel(options);
}

export async function exportAdvancedAnalysis(
  options: { exportType?: string; startDate?: string; endDate?: string } = {},
): Promise<Buffer> {
  // Fetches data internally via analysisQueries and formats
  return await generateAdvancedAnalysisExcel(options);
}

export async function exportInvoice(options: InvoiceFilters): Promise<Buffer> {
  const { partnerCode, dateFrom, dateTo } = options || {};
  if (!partnerCode) throw new Error('Partner code is required');
  const data = await getInvoiceData({
    partnerCode,
    dateFrom,
    dateTo,
  });
  return generateInvoiceExcel(data);
}

export async function exportInventory(): Promise<Buffer> {
  const data = await getInventoryData();
  return generateInventoryExcel(data);
}
