import {
  InboundRecord,
  OutboundRecord,
  Partner,
  PayablePayment,
  Product,
  ProductPrice,
  ReceivablePayment,
} from '@prisma/client';

export interface BasicDataFilters {
  tables?: string;
}

export interface TransactionFilters {
  tables?: string;
  dateFrom?: string;
  dateTo?: string;
  productCode?: string;
  customerCode?: string;
}

export interface ReceivablePayableFilters {
  outboundFrom?: string;
  outboundTo?: string;
  paymentFrom?: string;
  paymentTo?: string;
}

export interface InvoiceFilters {
  partnerCode: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface AnalysisFilters {
  startDate: string;
  endDate: string;
}

// Extended types for export formatting
export type PartnerDto = Partner & { type_name?: string };
export type ProductDto = Product;
export type PriceDto = ProductPrice;

export interface BaseInfoData {
  partners?: PartnerDto[];
  products?: ProductDto[];
  prices?: PriceDto[];
}

export type InboundRecordDto = InboundRecord;
export type OutboundRecordDto = OutboundRecord;

export interface InboundOutboundData {
  inbound?: InboundRecordDto[];
  outbound?: OutboundRecordDto[];
}

export type ReceivablePaymentDto = ReceivablePayment;
export type PayablePaymentDto = PayablePayment;

export interface ReceivableSummaryDto {
  customer_code: string;
  customer_short_name: string;
  customer_full_name: string;
  total_sales: number;
  total_payments: number;
  balance: number;
}

export interface PayableSummaryDto {
  supplier_code: string;
  supplier_short_name: string;
  supplier_full_name: string;
  total_purchase: number;
  total_payments: number;
  balance: number;
}

export interface ReceivablePayableData {
  receivable_summary?: ReceivableSummaryDto[];
  receivable_details?: OutboundRecordDto[];
  receivable_payments?: ReceivablePaymentDto[];
  payable_summary?: PayableSummaryDto[];
  payable_details?: InboundRecordDto[];
  payable_payments?: PayablePaymentDto[];
}

export interface InvoiceItemDto {
  product_model: string;
  unit_price: number;
  quantity: number;
  total_price: number;
}

export interface AnalysisSummary {
  sales_amount: number;
  cost_amount: number;
  profit_amount: number;
  last_updated?: string;
  profit_rate: number;
}

export interface AnalysisDetailItem {
  product_model?: string;
  customer_code?: string;
  customer_name?: string;
  sales_amount: number;
  cost_amount: number;
  profit_amount: number;
  profit_rate: number;
}

export interface AnalysisExportOptions {
  analysisData: AnalysisSummary;
  detailData: AnalysisDetailItem[];
  startDate: string;
  endDate: string;
  customerCode?: string;
  productModel?: string;
}

export interface InvoiceData {
  invoices: InvoiceItemDto[];
}

export interface AnalysisRecord {
  // Contains merged fields from outbound record + calculated cost
  id: number;
  product_model: string | null;
  quantity: number | null;
  outbound_date: string | null;
  unit_price: number | null;
  total_price: number | null;
  customer_code: string | null;
  customer_short_name: string | null;
  cost_amount: number;
  sales_amount: number;
  resolved_customer_code: string;
  customer_full_name: string;
}

export interface AnalysisProductDetail {
  product_model: string;
  sales_amount: number;
  cost_amount: number;
  profit_amount: number;
  profit_rate: number;
}

export interface AnalysisCustomerData {
  customer_code: string;
  customer_name: string;
  sales_amount: number;
  cost_amount: number;
  profit_amount: number;
  profit_rate: number;
  product_details: AnalysisProductDetail[];
}

export interface AnalysisCustomerDetail {
  customer_code: string;
  customer_name: string;
  sales_amount: number;
  cost_amount: number;
  profit_amount: number;
  profit_rate: number;
}

export interface AnalysisProductData {
  product_model: string;
  sales_amount: number;
  cost_amount: number;
  profit_amount: number;
  profit_rate: number;
  customer_details: AnalysisCustomerDetail[];
}
