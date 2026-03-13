export type AnalysisType = 'inbound' | 'outbound';

export interface AnalysisSummary {
  normal_amount: number;
  special_amount: number;
  total_amount: number;
}

export interface SalesData {
  normal_sales: number;
  special_expense: number;
  sales_amount: number;
}

export interface PurchaseData {
  purchase_amount: number;
}

export interface DetailItem {
  group_key: string;
  customer_code?: string | null | undefined;
  supplier_code?: string | null | undefined;
  product_model: string | null | undefined;
  sales_amount?: number;
  purchase_amount?: number;
  cost_amount?: number;
  profit_amount?: number;
  profit_rate?: number;
}

export interface FilterOptions {
  customers: Array<{ code: string; name: string }>;
  suppliers: Array<{ code: string; name: string }>;
  products: Array<{ model: string; name: string }>;
}

export interface ValidationResult {
  isValid: boolean;
  error?: string;
}
