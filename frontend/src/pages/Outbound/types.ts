import type { Dayjs } from 'dayjs';

export type Partner = {
  readonly code?: string | undefined;
  readonly short_name: string;
  readonly full_name?: string;
  readonly type: number;
};

export type Product = {
  readonly code?: string | undefined;
  readonly product_model: string;
  readonly category?: string;
};

export type OutboundRecord = {
  readonly id: number;
  readonly customer_code: string;
  readonly partner?: Partner;
  readonly product_code: string;
  readonly product_model: string;
  readonly product_category?: string | null;
  readonly quantity: number;
  readonly unit_price: number;
  readonly total_price: number;
  readonly outbound_date: string;
  readonly invoice_date?: string | null;
  readonly invoice_number?: string | null;
  readonly receipt_number?: string | null;
  readonly order_number?: string | null;
  readonly remark?: string | null;
};

export type DateRangeValue = readonly [string | null, string | null];

export interface OutboundFilters {
  readonly customer_short_name?: string | undefined;
  readonly product_model?: string | undefined;
  readonly dateRange: DateRangeValue;
}

export interface SorterState {
  readonly field?: string | undefined;
  readonly order?: 'asc' | 'desc' | undefined;
}

export type OutboundFormValues = {
  readonly customer_code?: string | null | undefined;
  readonly customer_short_name?: string | null | undefined;
  readonly customer_full_name?: string | null | undefined;
  readonly product_code?: string | null | undefined;
  readonly product_model?: string | null | undefined;
  readonly product_category?: string | null | undefined;
  readonly outbound_date?: Dayjs | null;
  readonly invoice_date?: Dayjs | null;
  readonly manual_price?: boolean | undefined;
  readonly quantity?: number | undefined;
  readonly unit_price?: number | undefined;
  readonly total_price?: number | undefined;
  readonly invoice_number?: string | null | undefined;
  readonly order_number?: string | null | undefined;
  // UI receipt number input
  readonly receipt_number?: string | null | undefined;
  readonly remark?: string | null | undefined;
};

export interface OutboundListResponse {
  readonly data: OutboundRecord[];
  readonly pagination?: {
    readonly page?: number;
    readonly limit?: number;
    readonly total?: number;
  };
}

export interface ApiListResponse<T> {
  readonly data: T[];
}

export interface FetchParams {
  readonly page?: number;
  readonly customer_short_name?: string | undefined;
  readonly product_model?: string | undefined;
  readonly start_date?: string | null | undefined;
  readonly end_date?: string | null | undefined;
  readonly sort_field?: string | undefined;
  readonly sort_order?: 'asc' | 'desc' | undefined;
}
