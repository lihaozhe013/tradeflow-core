import type { Dayjs } from 'dayjs';

export interface Customer {
  readonly code: string;
  readonly short_name: string;
  readonly full_name?: string | null;
}

export interface ReceivableRecord {
  readonly customer_code: string;
  readonly customer_short_name: string;
  readonly customer_full_name?: string | null;
  readonly total_receivable: number;
  readonly total_paid: number;
  readonly balance: number;
  readonly last_payment_date?: string | null;
  readonly last_payment_method?: string | null;
}

export interface ReceivableFilters {
  readonly customer_short_name?: string | undefined;
}

export type TableSortOrder = 'ascend' | 'descend';
export type ApiSortOrder = 'asc' | 'desc';

export interface ReceivableSorterState {
  readonly field?: string | undefined;
  readonly order?: TableSortOrder | undefined;
}

export interface FetchParams {
  readonly page?: number;
  readonly limit?: number;
  readonly customer_short_name?: string | undefined;
  readonly sort_field?: string | undefined;
  readonly sort_order?: ApiSortOrder | undefined;
}

export interface PaginationState {
  readonly current: number;
  readonly pageSize: number;
  readonly total: number;
}

export interface ReceivablePaymentFormValues {
  readonly customer_code?: string | undefined;
  readonly amount?: number | null | undefined;
  readonly pay_date?: Dayjs | null;
  readonly pay_method?: string | undefined;
  readonly remark?: string | undefined;
}

export interface ReceivablePaymentRecord {
  readonly id: number;
  readonly customer_code: string;
  readonly amount: number;
  readonly pay_date: string;
  readonly pay_method?: string | null;
  readonly remark?: string | null;
}

export interface ReceivableOutboundRecord {
  readonly id: number;
  readonly outbound_date?: string | null;
  readonly product_model?: string | null;
  readonly quantity?: number | null;
  readonly unit_price?: number | null;
  readonly total_price?: number | null;
  readonly order_number?: string | null;
  readonly remark?: string | null;
  readonly invoice_number?: string | null;
  readonly invoice_date?: string | null;
}

export interface InvoicedRecord {
  readonly invoice_number: string;
  readonly invoice_date: string | null;
  readonly total_amount: number;
  readonly record_count: number;
}

export interface InvoicedRecordsResponse {
  readonly data: InvoicedRecord[];
  readonly total: number;
  readonly page: number;
  readonly limit: number;
  readonly last_updated?: string;
}

export interface PaginationInfo {
  readonly page: number;
  readonly total: number;
}

export interface ReceivableDetailSummary {
  readonly total_receivable?: number | null;
  readonly total_paid?: number | null;
  readonly balance?: number | null;
}

export interface CustomerDetail {
  readonly code?: string | null;
  readonly short_name?: string | null;
  readonly full_name?: string | null;
}

export interface ReceivableDetailResponse {
  readonly customer?: CustomerDetail | null;
  readonly summary?: ReceivableDetailSummary | null;
  readonly payment_records?: {
    readonly data: ReceivablePaymentRecord[];
  } | null;
  readonly payment_pagination?: PaginationInfo | null;
  readonly outbound_records?: {
    readonly data: ReceivableOutboundRecord[];
  } | null;
  readonly outbound_pagination?: PaginationInfo | null;
}

export interface ReceivableListResponse {
  readonly data: ReceivableRecord[];
  readonly page?: number;
  readonly total?: number;
  readonly limit?: number;
}

export interface ReceivableSearchStats {
  readonly totalReceivable: number;
  readonly totalUnpaid: number;
}

export interface ApiListResponse<T> {
  readonly data: T[];
}
