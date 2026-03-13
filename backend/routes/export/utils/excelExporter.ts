import {
  BasicDataFilters,
  TransactionFilters,
  ReceivablePayableFilters,
  InvoiceFilters,
  AnalysisExportOptions,
} from "./types";
import { getBaseInfoData } from "./basicDataQueries";
import { generateBaseInfoExcel } from "./baseInfoExporter";
import { getInboundOutboundData } from "./transactionQueries";
import {
  generateTransactionExcel,
  generateStatementExcel,
} from "./transactionExporter";
import {
  getReceivableSummary,
  getReceivableDetails,
  getReceivablePayments,
} from "./receivableQueries";
import {
  getPayableSummary,
  getPayableDetails,
  getPayablePayments,
} from "./payableQueries";
import { generateFinancialExcel } from "./financialExporter";
import { generateAnalysisExcel } from "./analysisExporter";
import { generateAdvancedAnalysisExcel } from "./advancedAnalysisExporter";
import { getInvoiceData } from "./invoiceQueries";
import { generateInvoiceExcel } from "./invoiceExporter";
import ExportUtils from "./exportUtils";

export async function exportBaseInfo(
  options: BasicDataFilters = {},
): Promise<Buffer> {
  const data = await getBaseInfoData(options.tables || "123");
  return generateBaseInfoExcel(data, options);
}

export async function exportInboundOutbound(
  options: TransactionFilters = {},
): Promise<Buffer> {
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

export async function exportStatement(
  options: TransactionFilters = {},
): Promise<Buffer> {
  const data = await getInboundOutboundData(options);
  return generateStatementExcel(data, options);
}

export async function exportAnalysis(
  options: AnalysisExportOptions,
): Promise<Buffer> {
  // Purely formatting provided data
  return generateAnalysisExcel(options);
}

export async function exportAdvancedAnalysis(
  options: { exportType?: string; startDate?: string; endDate?: string } = {},
): Promise<Buffer> {
  // Fetches data internally via analysisQueries and formats
  return await generateAdvancedAnalysisExcel(options);
}

export async function exportInvoice(
  options: InvoiceFilters,
): Promise<Buffer> {
  const { partnerCode, dateFrom, dateTo } = options || {};
  if (!partnerCode) throw new Error("Partner code is required");
  const data = await getInvoiceData({
    partnerCode,
    dateFrom,
    dateTo,
  });
  return generateInvoiceExcel(data);
}

export function generateFilename(exportType: string) {
  return ExportUtils.generateFilename(exportType);
}

