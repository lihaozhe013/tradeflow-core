export type AnalysisType = 'inbound' | 'outbound';

export interface PartnerOption {
  code: string;
  name: string;
}

export interface ProductOption {
  model: string;
  name: string;
}

export interface AnalysisData {
  // Outbound
  sales_amount?: number;
  cost_amount?: number;
  profit_amount?: number;
  profit_rate?: number;

  // Inbound
  purchase_amount?: number;
  normal_purchase?: number;
  special_income?: number;

  // Generic (if backend sends these)
  normal_amount?: number;
  special_amount?: number;
  total_amount?: number;

  last_updated?: string;
}

export interface DetailItem {
  group_key: string;
  customer_code?: string;
  supplier_code?: string;
  partner_code?: string;
  product_model?: string;

  sales_amount?: number;
  cost_amount?: number;
  profit_amount?: number;
  profit_rate?: number;

  purchase_amount?: number;
  total_amount?: number;
}

export interface AnalysisApiResult<T> {
  success: boolean;
  data?: T;
  message?: string;
  customers?: PartnerOption[];
  suppliers?: PartnerOption[];
  products?: ProductOption[];
  status?: number;
}
