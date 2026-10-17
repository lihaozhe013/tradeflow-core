import { z } from 'zod';

export const monthlyInventoryChangeSchema = z.object({
  product_model: z.string(),
  month_start_inventory: z.number(),
  current_inventory: z.number(),
  monthly_change: z.number(),
  query_date: z.iso.datetime()
});

export const overviewSnapshotSchema = z.object({
  overview: z.object({
    total_inbound: z.number(),
    total_outbound: z.number(),
    suppliers_count: z.number(),
    customers_count: z.number(),
    products_count: z.number(),
    total_purchase_amount: z.number(),
    total_sales_amount: z.number(),
    sold_goods_cost: z.number(),
    inventoryed_products: z.number()
  }),
  out_of_inventory_products: z.array(z.object({ product_model: z.string() })),
  top_sales_products: z.array(z.object({ product_model: z.string(), total_sales: z.number() })),
  monthly_inventory_changes: z.record(z.string(), monthlyInventoryChangeSchema)
});

export const invoicedRecordsSchema = z.array(
  z.object({
    invoice_number: z.string(),
    invoice_date: z.string().nullable(),
    total_amount: z.number(),
    record_count: z.number().int().nonnegative()
  })
);

export type OverviewSnapshotData = z.infer<typeof overviewSnapshotSchema>;
export type MonthlyInventoryChange = z.infer<typeof monthlyInventoryChangeSchema>;
export type InvoicedRecord = z.infer<typeof invoicedRecordsSchema>[number];
export type InvoiceDirection = 'receivable' | 'payable';
