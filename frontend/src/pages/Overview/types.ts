export type OverviewMetrics = {
  total_sales_amount: number;
  sold_goods_cost: number;
  total_purchase_amount: number;
};

export type OutOfStockProduct = {
  product_model: string;
};

export type OverviewStatsResponse = {
  overview: OverviewMetrics;
  out_of_inventory_products: OutOfStockProduct[];
};

export const DEFAULT_OVERVIEW_STATS: OverviewStatsResponse = {
  overview: {
    total_sales_amount: 0,
    sold_goods_cost: 0,
    total_purchase_amount: 0
  },
  out_of_inventory_products: []
};

export type TopSalesRecord = {
  product_model: string;
  total_sales: number;
};

export type TopSalesResponse = {
  success: boolean;
  data: TopSalesRecord[];
  message?: string;
};

export const DEFAULT_TOP_SALES_RESPONSE: TopSalesResponse = {
  success: false,
  data: []
};
