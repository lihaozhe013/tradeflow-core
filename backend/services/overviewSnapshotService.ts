import { prisma } from '@/prismaClient';
import type { Prisma } from '@/prisma/client';
import decimalCalc from '@/utils/decimalCalculator';
import { parseSnapshot, refreshSnapshot } from './snapshotRefresh';
import { overviewSnapshotSchema } from './snapshotTypes';
import type { OverviewSnapshotData, MonthlyInventoryChange } from './snapshotTypes';

type Decimal = ReturnType<typeof decimalCalc.decimal>;

interface InboundGroup {
  product_code: string | null;
  _sum: {
    quantity: number | null;
    total_price: number | null;
  };
}

interface QuantityPriceRow {
  quantity: number | null;
  unit_price: number | null;
}

interface OutboundRow extends QuantityPriceRow {
  product_code: string | null;
}

interface AvgCostData {
  avg_cost_price: number;
  total_inbound_quantity: number;
}

type TopSalesProduct = OverviewSnapshotData['top_sales_products'][number];

function buildAvgCostMap(inboundRecords: InboundGroup[]): Record<string, AvgCostData> {
  return inboundRecords.reduce(
    (map, item) => {
      if (!item.product_code) return map;

      const totalQty = item._sum.quantity || 0;
      const totalPrice = item._sum.total_price || 0;

      if (totalQty > 0) {
        map[item.product_code] = {
          avg_cost_price: decimalCalc.fromSqlResult(totalPrice / totalQty, 0, 4),
          total_inbound_quantity: decimalCalc.fromSqlResult(totalQty, 0)
        };
      }
      return map;
    },
    {} as Record<string, AvgCostData>
  );
}

/**
 * Helper: Calculate cost for a single sales record
 */
function calculateOutboundCost(record: OutboundRow, avgCostMap: Record<string, AvgCostData>) {
  const productModel = record.product_code || 'unknown';
  const soldQuantity = decimalCalc.decimal(record.quantity || 0);

  // Use weighted average inbound price for this product if exists
  const costPerUnit = avgCostMap[productModel]
    ? decimalCalc.decimal(avgCostMap[productModel].avg_cost_price)
    : decimalCalc.fromSqlResult(record.unit_price || 0, 0, 4); // Fallback to selling price

  return decimalCalc.multiply(soldQuantity, costPerUnit);
}

/**
 * Helper: Calculate special income from negative unit price record
 */
function calculateSpecialIncome(record: QuantityPriceRow) {
  const amt = Math.abs((record.quantity || 0) * (record.unit_price || 0));
  return decimalCalc.decimal(amt);
}

/**
 * Helper: Reducer for summing Decimals
 */
function sumDecimals(acc: Decimal, curr: Decimal) {
  return acc.add(curr);
}

/**
 * Calculate the real cost of sold goods (weighted average cost method)
 * Inbound records with negative unit prices are treated as special income, reducing costs
 * Only calculates data from the past year
 */
async function calculateSoldGoodsCost(
  tx: Prisma.TransactionClient,
  oneYearAgoStr: string
): Promise<number> {
  // 1. Calculate weighted average inbound price for each product (only positive unit price records from past year)
  const inboundRecords = await tx.inboundRecord.groupBy({
    by: ['product_code'],
    where: {
      unit_price: { gte: 0 },
      inbound_date: { gte: oneYearAgoStr }
    },
    _sum: {
      quantity: true,
      total_price: true // Assuming total_price corresponds to quantity * unit_price
    }
  });

  const avgCostMap = buildAvgCostMap(inboundRecords);

  // 2. Get all outbound records from the past year (only positive unit price records for cost calculation)
  const outboundRecords = await tx.outboundRecord.findMany({
    where: {
      unit_price: { gte: 0 },
      outbound_date: { gte: oneYearAgoStr }
    },
    select: {
      product_code: true,
      quantity: true,
      unit_price: true // as selling_price
    }
  });

  if (outboundRecords.length === 0) {
    return 0;
  }

  // 3. Use average cost to calculate sold goods cost
  const totalSoldGoodsCost = outboundRecords
    .map((record) => calculateOutboundCost(record, avgCostMap))
    .reduce(sumDecimals, decimalCalc.decimal(0));

  // 4. Calculate special income from inbound negative unit price items from past year, reduce total cost
  // SQL: SELECT COALESCE(SUM(ABS(quantity * unit_price)), 0) ... WHERE unit_price < 0
  const specialIncomeRecords = await tx.inboundRecord.findMany({
    where: {
      unit_price: { lt: 0 },
      inbound_date: { gte: oneYearAgoStr }
    },
    select: {
      quantity: true,
      unit_price: true
    }
  });

  const totalSpecialIncome = specialIncomeRecords
    .map(calculateSpecialIncome)
    .reduce(sumDecimals, decimalCalc.decimal(0));

  const finalCost = decimalCalc.subtract(totalSoldGoodsCost, totalSpecialIncome);

  // Ensure cost is not negative and keep two decimal places
  return decimalCalc.toDbNumber(decimalCalc.decimal(Math.max(0, finalCost.toNumber())), 2);
}

async function calculateOverview(
  tx: Prisma.TransactionClient,
  now: Date
): Promise<OverviewSnapshotData> {
  const stats: Partial<OverviewSnapshotData> = {};
  // Get the date one year ago from now
  const oneYearAgo = new Date(now);
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
  const oneYearAgoStr = oneYearAgo.toISOString().slice(0, 10);

  const outOfInventoryPromise = tx.inventory.findMany({
    where: { quantity: { lte: 0 } },
    select: { product_model: true }
  });

  // Convert to simple array of objects { product_model: string }
  stats.out_of_inventory_products = await outOfInventoryPromise;

  // -------------------------------------------------------------------------
  // 2. Overview Stats (Counts & Amounts)
  // -------------------------------------------------------------------------
  const counts = {
    total_inbound: await tx.inboundRecord.count({
      where: { inbound_date: { gte: oneYearAgoStr } }
    }),
    total_outbound: await tx.outboundRecord.count({
      where: { outbound_date: { gte: oneYearAgoStr } }
    }),
    suppliers_count: await tx.partner.count({ where: { type: 0 } }),
    customers_count: await tx.partner.count({ where: { type: 1 } }),
    products_count: await tx.product.count()
  };

  // Purchase Amount: Normal (>0)
  // We need SUM(quantity * unit_price). Prisma does not support arithmetic aggregation directly on arbitrary columns unless stored.
  // Assuming 'total_price' field stores (quantity * unit_price).
  const normalPurchaseAgg = await tx.inboundRecord.aggregate({
    _sum: { total_price: true },
    where: { unit_price: { gte: 0 }, inbound_date: { gte: oneYearAgoStr } }
  });
  const normalPurchase = decimalCalc.fromSqlResult(normalPurchaseAgg._sum.total_price || 0, 0);

  // Purchase Amount: Special Income (Abs(negative))
  // We cannot do SUM(ABS(...)) easily in Prisma without raw query or iterating.
  // Fetching raw records for negative items:
  const negativeInbound = await tx.inboundRecord.findMany({
    where: { unit_price: { lt: 0 }, inbound_date: { gte: oneYearAgoStr } },
    select: { quantity: true, unit_price: true }
  });
  let specialIncomeDec = decimalCalc.decimal(0);
  for (const r of negativeInbound) {
    specialIncomeDec = decimalCalc.add(
      specialIncomeDec,
      Math.abs((r.quantity || 0) * (r.unit_price || 0))
    );
  }

  // Sales Amount: Normal (>0)
  const normalSalesAgg = await tx.outboundRecord.aggregate({
    _sum: { total_price: true },
    where: { unit_price: { gte: 0 }, outbound_date: { gte: oneYearAgoStr } }
  });
  const normalSales = decimalCalc.fromSqlResult(normalSalesAgg._sum.total_price || 0, 0);

  // Sales Amount: Special Expense (Abs(negative))
  const negativeOutbound = await tx.outboundRecord.findMany({
    where: { unit_price: { lt: 0 }, outbound_date: { gte: oneYearAgoStr } },
    select: { quantity: true, unit_price: true }
  });
  let specialExpenseDec = decimalCalc.decimal(0);
  for (const r of negativeOutbound) {
    specialExpenseDec = decimalCalc.add(
      specialExpenseDec,
      Math.abs((r.quantity || 0) * (r.unit_price || 0))
    );
  }

  const totalPurchaseAmt = decimalCalc.toDbNumber(
    decimalCalc.subtract(normalPurchase, specialIncomeDec)
  );
  const totalSalesAmt = decimalCalc.toDbNumber(
    decimalCalc.subtract(normalSales, specialExpenseDec)
  );

  // Sold Goods Cost
  const soldGoodsCost = await calculateSoldGoodsCost(tx, oneYearAgoStr);

  // Inventory Count
  const inventoryCount = await tx.inventory.count();

  stats.overview = {
    ...counts,
    total_purchase_amount: totalPurchaseAmt,
    total_sales_amount: totalSalesAmt,
    sold_goods_cost: soldGoodsCost,
    inventoryed_products: inventoryCount
  };

  // -------------------------------------------------------------------------
  // 3. Top Sales Products
  // -------------------------------------------------------------------------
  // Raw SQL was: SELECT product_model, SUM(quantity * unit_price) ... GROUP BY product_model
  // Again, assuming total_price is reliable.
  const topSalesGroups = await tx.outboundRecord.groupBy({
    by: ['product_code'],
    where: { unit_price: { gte: 0 }, outbound_date: { gte: oneYearAgoStr } },
    _sum: { total_price: true }
    // Prisma doesn't support 'orderBy' in groupBy easily for aggregates in all versions
    // We will sort in JS.
  });

  const allProductsOverview = await tx.product.findMany({
    select: { code: true, product_model: true }
  });
  const pMapOverview = new Map<string, string>();
  allProductsOverview.forEach((p) => pMapOverview.set(p.code, p.product_model || 'unknown'));

  const processedRows = topSalesGroups
    .map((g) => ({
      product_model: (g.product_code ? pMapOverview.get(g.product_code) : 'unknown') || 'unknown',
      total_sales: decimalCalc.fromSqlResult(g._sum.total_price || 0, 0, 2)
    }))
    .sort((a, b) => b.total_sales - a.total_sales); // Descending

  const topN = 10;
  const top = processedRows.slice(0, topN);
  const others = processedRows.slice(topN);

  let otherTotalDecimal = decimalCalc.decimal(0);
  others.forEach((r) => {
    otherTotalDecimal = decimalCalc.add(otherTotalDecimal, r.total_sales);
  });
  const otherTotal = decimalCalc.toDbNumber(otherTotalDecimal, 2);

  const topSalesResult: TopSalesProduct[] = [...top];
  if (otherTotal > 0) {
    topSalesResult.push({ product_model: 'Others', total_sales: otherTotal });
  }
  stats.top_sales_products = topSalesResult;

  // -------------------------------------------------------------------------
  // 4. Monthly Inventory Changes
  // -------------------------------------------------------------------------
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthStartStr = monthStart.toISOString().slice(0, 10);

  const allProductModels = await tx.product.findMany({
    select: { code: true, product_model: true }
  });

  // We can optimize this loop by fetching all records and processing in memory if dataset is small,
  // but for now let's use Promise.all to parallelize reasonably or just iterate over models.
  // Iterating one by one might be slow if many products.
  // Let's optimize: Fetch Aggregations for ALL products grouped by product_model

  // Before Month Inbound
  const beforeMonthInboundAgg = await tx.inboundRecord.groupBy({
    by: ['product_code'],
    where: { inbound_date: { lt: monthStartStr } },
    _sum: { quantity: true }
  });
  // Convert to Map
  const beforeInMap: Record<string, number> = {};
  beforeMonthInboundAgg.forEach((x) => {
    if (x.product_code) beforeInMap[x.product_code] = x._sum.quantity || 0;
  });

  // Before Month Outbound
  const beforeMonthOutboundAgg = await tx.outboundRecord.groupBy({
    by: ['product_code'],
    where: { outbound_date: { lt: monthStartStr } },
    _sum: { quantity: true }
  });
  const beforeOutMap: Record<string, number> = {};
  beforeMonthOutboundAgg.forEach((x) => {
    if (x.product_code) beforeOutMap[x.product_code] = x._sum.quantity || 0;
  });

  // Current Month Inbound
  const curMonthInboundAgg = await tx.inboundRecord.groupBy({
    by: ['product_code'],
    where: { inbound_date: { gte: monthStartStr } },
    _sum: { quantity: true }
  });
  const curInMap: Record<string, number> = {};
  curMonthInboundAgg.forEach((x) => {
    if (x.product_code) curInMap[x.product_code] = x._sum.quantity || 0;
  });

  // Current Month Outbound
  const curMonthOutboundAgg = await tx.outboundRecord.groupBy({
    by: ['product_code'],
    where: { outbound_date: { gte: monthStartStr } },
    _sum: { quantity: true }
  });
  const curOutMap: Record<string, number> = {};
  curMonthOutboundAgg.forEach((x) => {
    if (x.product_code) curOutMap[x.product_code] = x._sum.quantity || 0;
  });

  const monthlyChanges: Record<string, MonthlyInventoryChange> = {};

  for (const p of allProductModels) {
    if (!p.code) continue;

    const beforeIn = decimalCalc.fromSqlResult(beforeInMap[p.code] || 0, 0, 0);
    const beforeOut = decimalCalc.fromSqlResult(beforeOutMap[p.code] || 0, 0, 0);

    const curIn = decimalCalc.fromSqlResult(curInMap[p.code] || 0, 0, 0);
    const curOut = decimalCalc.fromSqlResult(curOutMap[p.code] || 0, 0, 0);

    // Start Inventory = Total In (before) - Total Out (before)
    // Note: This logic assumes simple inventory (no adjustments/losses other than outbound).
    const monthStartInventory = decimalCalc.toDbNumber(
      decimalCalc.subtract(beforeIn, beforeOut),
      0
    );

    const monthlyChange = decimalCalc.toDbNumber(decimalCalc.subtract(curIn, curOut), 0);
    const currentInventory = decimalCalc.toDbNumber(
      decimalCalc.add(monthStartInventory, monthlyChange),
      0
    );

    monthlyChanges[p.product_model || 'unknown'] = {
      product_model: p.product_model || 'unknown',
      month_start_inventory: monthStartInventory,
      current_inventory: currentInventory,
      monthly_change: monthlyChange,
      query_date: now.toISOString()
    };
  }
  stats.monthly_inventory_changes = monthlyChanges;

  return parseSnapshot(overviewSnapshotSchema, stats);
}

export async function getOverviewSnapshot() {
  const snapshot = await prisma.overviewSnapshot.findUnique({ where: { id: 'global' } });
  if (!snapshot) return null;
  return {
    ...parseSnapshot(overviewSnapshotSchema, snapshot.data),
    last_updated: snapshot.last_updated.toISOString()
  };
}

export async function refreshOverviewSnapshot() {
  return refreshSnapshot('overview:global', async (tx) => {
    const data = await calculateOverview(tx, new Date());
    const snapshot = await tx.overviewSnapshot.upsert({
      where: { id: 'global' },
      create: { id: 'global', data, last_updated: new Date() },
      update: { data, last_updated: new Date() }
    });
    return { ...data, last_updated: snapshot.last_updated.toISOString() };
  });
}
