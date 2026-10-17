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
  top_sales_products: TopSalesRecord[];
  monthly_inventory_changes: Record<string, MonthlyInventoryChangeData>;
  last_updated: string;
};

export const DEFAULT_OVERVIEW_STATS: OverviewStatsResponse = {
  overview: {
    total_sales_amount: 0,
    sold_goods_cost: 0,
    total_purchase_amount: 0
  },
  out_of_inventory_products: [],
  top_sales_products: [],
  monthly_inventory_changes: {},
  last_updated: ''
};

export type TopSalesRecord = {
  product_model: string;
  total_sales: number;
};

export type MonthlyInventoryChangeData = {
  product_model: string;
  month_start_inventory: number;
  current_inventory: number;
  monthly_change: number;
  query_date: string;
};
