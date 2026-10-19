import type { Dayjs } from 'dayjs';
import type { AccountSummary } from '@/components/AccountSummaryCards';

export interface Supplier {
  readonly code: string;
  readonly short_name: string;
  readonly full_name?: string | null;
}

export interface PayableRecord {
  readonly supplier_code: string;
  readonly supplier_short_name: string;
  readonly supplier_full_name?: string | null;
  readonly total_payable: number;
  readonly total_paid: number;
  readonly balance: number;
  readonly last_payment_date?: string | null;
  readonly last_payment_method?: string | null;
}

export interface PayableFilters {
  readonly supplier_short_name?: string | undefined;
}

export type TableSortOrder = 'ascend' | 'descend';
export type ApiSortOrder = 'asc' | 'desc';

export interface PayableSorterState {
  readonly field?: string | undefined;
  readonly order?: TableSortOrder | undefined;
}

export interface FetchParams {
  readonly page?: number;
  readonly limit?: number;
  readonly supplier_short_name?: string | undefined;
  readonly sort_field?: string | undefined;
  readonly sort_order?: ApiSortOrder | undefined;
}

export interface PaginationState {
  readonly current: number;
  readonly pageSize: number;
  readonly total: number;
}

export interface PayablePaymentFormValues {
  readonly supplier_code?: string | undefined;
  readonly amount?: number | null | undefined;
  readonly pay_date?: Dayjs | null;
  readonly pay_method?: string | undefined;
  readonly remark?: string | undefined;
}

export interface PayablePaymentRecord {
  readonly id: number;
  readonly supplier_code: string;
  readonly amount: number;
  readonly pay_date: string;
  readonly pay_method?: string | null;
  readonly remark?: string | null;
}

export interface PayableInboundRecord {
  readonly id: number;
  readonly inbound_date?: string | null;
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

export interface PaginatedData<T> {
  readonly data: T[];
  readonly page: number;
  readonly limit: number;
  readonly total: number;
}

export interface PayableDetailSummary {
  readonly total_payable?: number | null;
  readonly total_paid?: number | null;
  readonly balance?: number | null;
}

export interface SupplierDetail {
  readonly code?: string | null;
  readonly short_name?: string | null;
  readonly full_name?: string | null;
}

export interface PayableDetailResponse {
  readonly supplier?: SupplierDetail | null;
  readonly summary?: PayableDetailSummary | null;
  readonly payment_records?: PaginatedData<PayablePaymentRecord> | null;
  readonly inbound_records?: PaginatedData<PayableInboundRecord> | null;
}

export interface PayableListResponse {
  readonly data: PayableRecord[];
  readonly page?: number;
  readonly total?: number;
  readonly limit?: number;
  readonly summary?: AccountSummary | null;
}

export interface ApiListResponse<T> {
  readonly data: T[];
}
