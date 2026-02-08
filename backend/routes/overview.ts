// Using proper Prisma types and client
import express, { Request, Response, Router } from 'express';
import fs from 'fs';
import path from 'path';
import { prisma } from '@/prismaClient.js';
import { getAllInventoryData } from '@/utils/inventoryCacheService.js';
import decimalCalc from '@/utils/decimalCalculator.js';
import { resolveFilesInDataPath } from '@/utils/paths.js';

const router: Router = express.Router();

// ========== Type Definitions ==========

interface AvgCostData {
  avg_cost_price: number;
  total_inbound_quantity: number;
}

interface OverviewStats {
  total_inbound: number;
  total_outbound: number;
  suppliers_count: number;
  customers_count: number;
  products_count: number;
  total_purchase_amount: number;
  total_sales_amount: number;
  sold_goods_cost: number;
  inventoryed_products: number;
}

interface TopSalesProduct {
  product_model: string;
  total_sales: number;
}

interface MonthlyInventoryChange {
  product_model: string;
  month_start_inventory: number;
  current_inventory: number;
  monthly_change: number;
  query_date: string;
}

interface StatsCache {
  out_of_inventory_products?: { product_model: string }[];
  overview?: OverviewStats;
  top_sales_products?: TopSalesProduct[];
  monthly_inventory_changes?: Record<string, MonthlyInventoryChange>;
  [key: string]: any;
}

// ========== Helper Functions ==========

/**
 * Calculate the real cost of sold goods (weighted average cost method)
 * Inbound records with negative unit prices are treated as special income, reducing costs
 * Only calculates data from the past year
 */
async function calculateSoldGoodsCost(): Promise<number> {
  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
  const oneYearAgoStr = oneYearAgo.toISOString().split('T')[0];

  // 1. Calculate weighted average inbound price for each product (only positive unit price records from past year)
  const inboundRecords = await prisma.inboundRecord.groupBy({
    by: ['product_model'],
    where: {
      unit_price: { gte: 0 },
      inbound_date: { gte: oneYearAgoStr }
    },
    _sum: {
      quantity: true,
      total_price: true, // Assuming total_price corresponds to quantity * unit_price
    }
  });

  const avgCostMap: Record<string, AvgCostData> = {};
  
  for (const item of inboundRecords) {
    if (!item.product_model) continue;

    const totalQty = item._sum.quantity || 0;
    const totalPrice = item._sum.total_price || 0;
    
    // In SQL it was SUM(quantity * unit_price) / SUM(quantity)
    // prisma item._sum.total_price is ideally quantity * unit_price. 
    
    if (totalQty > 0) {
      avgCostMap[item.product_model] = {
        avg_cost_price: decimalCalc.fromSqlResult(totalPrice / totalQty, 0, 4),
        total_inbound_quantity: decimalCalc.fromSqlResult(totalQty, 0),
      };
    }
  }

  // 2. Get all outbound records from the past year (only positive unit price records for cost calculation)
  const outboundRecords = await prisma.outboundRecord.findMany({
    where: {
      unit_price: { gte: 0 },
      outbound_date: { gte: oneYearAgoStr }
    },
    select: {
      product_model: true,
      quantity: true,
      unit_price: true // as selling_price
    }
  });

  if (outboundRecords.length === 0) {
    return 0;
  }

  let totalSoldGoodsCost = decimalCalc.decimal(0);

  // 3. Use average cost to calculate cost for each sales record (only positive unit price items)
  for (const outRecord of outboundRecords) {
    const productModel = outRecord.product_model || "unknown";
    const soldQuantity = decimalCalc.decimal(outRecord.quantity || 0);
    const sellingPrice = decimalCalc.fromSqlResult(outRecord.unit_price || 0, 0, 4);

    if (avgCostMap[productModel]) {
       // Use weighted average inbound price for this product
       const avgCost = decimalCalc.decimal(avgCostMap[productModel].avg_cost_price);
       const cost = decimalCalc.multiply(soldQuantity, avgCost);
       totalSoldGoodsCost = totalSoldGoodsCost.add(cost);
    } else {
       // If no corresponding inbound records, use outbound price as cost (conservative estimate)
       const cost = decimalCalc.multiply(soldQuantity, sellingPrice);
       totalSoldGoodsCost = totalSoldGoodsCost.add(cost);
    }
  }

  // 4. Calculate special income from inbound negative unit price items from past year, reduce total cost
  // SQL: SELECT COALESCE(SUM(ABS(quantity * unit_price)), 0) ... WHERE unit_price < 0
  const specialIncomeRecords = await prisma.inboundRecord.findMany({
    where: {
      unit_price: { lt: 0 },
      inbound_date: { gte: oneYearAgoStr }
    },
    select: {
      quantity: true,
      unit_price: true
    }
  });

  let specialIncomeDec = decimalCalc.decimal(0);
  for (const r of specialIncomeRecords) {
     const amt = Math.abs((r.quantity || 0) * (r.unit_price || 0));
     specialIncomeDec = decimalCalc.add(specialIncomeDec, amt);
  }

  const finalCost = decimalCalc.subtract(totalSoldGoodsCost, specialIncomeDec);

  // Ensure cost is not negative and keep two decimal places
  return decimalCalc.toDbNumber(
    decimalCalc.decimal(Math.max(0, finalCost.toNumber())),
    2
  );
}

// ========== Route Handlers ==========

// 获取系统统计数据
// GET Read cache only
router.get('/stats', (_req: Request, res: Response) => {
  const statsFile = resolveFilesInDataPath("overview-stats.json");
  if (fs.existsSync(statsFile)) {
    try {
      const json = fs.readFileSync(statsFile, 'utf-8');
      return res.json(JSON.parse(json));
    } catch (e) {
      // If reading fails, continue to recalculate
    }
  }
  // Cache doesn't exist or reading failed, return empty or error
  return res.status(503).json({ error: 'Statistics data not generated, please refresh first.' });
});

// POST Force refresh and write to cache (including top_sales_products and monthly_inventory_changes)
router.post('/stats', async (_req: Request, res: Response): Promise<void> => {
  const statsFile = resolveFilesInDataPath("overview-stats.json");
  const stats: StatsCache = {};

  // Get the date one year ago from now
  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
  const oneYearAgoStr = oneYearAgo.toISOString().split('T')[0];

  try {
    // -------------------------------------------------------------------------
    // 1. Out of Inventory Products
    // -------------------------------------------------------------------------
    const outOfInventoryPromise = new Promise<{ product_model: string }[]>((resolve, reject) => {
      getAllInventoryData((err, inventoryData) => {
        if (err) return reject(err);
        const outOfStockProducts = Object.entries(inventoryData!)
          .filter(([, data]) => data.current_inventory <= 0)
          .map(([product_model]) => ({ product_model }));
        resolve(outOfStockProducts);
      });
    });

    stats.out_of_inventory_products = await outOfInventoryPromise;

    // -------------------------------------------------------------------------
    // 2. Overview Stats (Counts & Amounts)
    // -------------------------------------------------------------------------
    const counts = {
      total_inbound: await prisma.inboundRecord.count({ where: { inbound_date: { gte: oneYearAgoStr } } }),
      total_outbound: await prisma.outboundRecord.count({ where: { outbound_date: { gte: oneYearAgoStr } } }),
      suppliers_count: await prisma.partner.count({ where: { type: 0 } }),
      customers_count: await prisma.partner.count({ where: { type: 1 } }),
      products_count: await prisma.product.count(),
    };

    // Purchase Amount: Normal (>0)
    // We need SUM(quantity * unit_price). Prisma does not support arithmetic aggregation directly on arbitrary columns unless stored.
    // Assuming 'total_price' field stores (quantity * unit_price).
    const normalPurchaseAgg = await prisma.inboundRecord.aggregate({
      _sum: { total_price: true },
      where: { unit_price: { gte: 0 }, inbound_date: { gte: oneYearAgoStr } }
    });
    const normalPurchase = decimalCalc.fromSqlResult(normalPurchaseAgg._sum.total_price || 0, 0);

    // Purchase Amount: Special Income (Abs(negative))
    // We cannot do SUM(ABS(...)) easily in Prisma without raw query or iterating.
    // Fetching raw records for negative items:
    const negativeInbound = await prisma.inboundRecord.findMany({
      where: { unit_price: { lt: 0 }, inbound_date: { gte: oneYearAgoStr } },
      select: { quantity: true, unit_price: true }
    });
    let specialIncomeDec = decimalCalc.decimal(0);
    for (const r of negativeInbound) {
      specialIncomeDec = decimalCalc.add(specialIncomeDec, Math.abs((r.quantity || 0) * (r.unit_price || 0)));
    }
    
    // Sales Amount: Normal (>0)
    const normalSalesAgg = await prisma.outboundRecord.aggregate({
      _sum: { total_price: true },
      where: { unit_price: { gte: 0 }, outbound_date: { gte: oneYearAgoStr } }
    });
    const normalSales = decimalCalc.fromSqlResult(normalSalesAgg._sum.total_price || 0, 0);

    // Sales Amount: Special Expense (Abs(negative))
    const negativeOutbound = await prisma.outboundRecord.findMany({
        where: { unit_price: { lt: 0 }, outbound_date: { gte: oneYearAgoStr } },
        select: { quantity: true, unit_price: true }
    });
    let specialExpenseDec = decimalCalc.decimal(0);
    for (const r of negativeOutbound) {
        specialExpenseDec = decimalCalc.add(specialExpenseDec, Math.abs((r.quantity || 0) * (r.unit_price || 0)));
    }

    const totalPurchaseAmt = decimalCalc.toDbNumber(decimalCalc.subtract(normalPurchase, specialIncomeDec));
    const totalSalesAmt = decimalCalc.toDbNumber(decimalCalc.subtract(normalSales, specialExpenseDec));

    // Sold Goods Cost
    const soldGoodsCost = await calculateSoldGoodsCost();

    // Inventory Count
    const inventoryCountPromise = new Promise<number>((resolve, reject) => {
        getAllInventoryData((err, inventoryData) => {
            if (err) return reject(err);
            resolve(Object.keys(inventoryData!).length);
        });
    });
    const inventoryCount = await inventoryCountPromise;

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
    const topSalesGroups = await prisma.outboundRecord.groupBy({
        by: ['product_model'],
        where: { unit_price: { gte: 0 }, outbound_date: { gte: oneYearAgoStr } },
        _sum: { total_price: true },
        // Prisma doesn't support 'orderBy' in groupBy easily for aggregates in all versions 
        // We will sort in JS.
    });

    const processedRows = topSalesGroups.map(g => ({
        product_model: g.product_model || "unknown",
        total_sales: decimalCalc.fromSqlResult(g._sum.total_price || 0, 0, 2)
    })).sort((a, b) => b.total_sales - a.total_sales); // Descending

    const topN = 10;
    const top = processedRows.slice(0, topN);
    const others = processedRows.slice(topN);

    let otherTotalDecimal = decimalCalc.decimal(0);
    others.forEach(r => {
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
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthStartStr = monthStart.toISOString().split('T')[0];

    const allProductModels = await prisma.product.findMany({ select: { product_model: true }, distinct: ['product_model'] });
    
    // We can optimize this loop by fetching all records and processing in memory if dataset is small, 
    // but for now let's use Promise.all to parallelize reasonably or just iterate over models.
    // Iterating one by one might be slow if many products.
    // Let's optimize: Fetch Aggregations for ALL products grouped by product_model
    
    // Before Month Inbound
    const beforeMonthInboundAgg = await prisma.inboundRecord.groupBy({
        by: ['product_model'],
        where: { inbound_date: { lt: monthStartStr } },
        _sum: { quantity: true }
    });
    // Convert to Map
    const beforeInMap: Record<string, number> = {};
    beforeMonthInboundAgg.forEach(x => { if(x.product_model) beforeInMap[x.product_model] = x._sum.quantity || 0; });

    // Before Month Outbound
    const beforeMonthOutboundAgg = await prisma.outboundRecord.groupBy({
        by: ['product_model'],
        where: { outbound_date: { lt: monthStartStr } },
        _sum: { quantity: true }
    });
    const beforeOutMap: Record<string, number> = {};
    beforeMonthOutboundAgg.forEach(x => { if(x.product_model) beforeOutMap[x.product_model] = x._sum.quantity || 0; });

    // Current Month Inbound
    const curMonthInboundAgg = await prisma.inboundRecord.groupBy({
        by: ['product_model'],
        where: { inbound_date: { gte: monthStartStr } },
        _sum: { quantity: true }
    });
    const curInMap: Record<string, number> = {};
    curMonthInboundAgg.forEach(x => { if(x.product_model) curInMap[x.product_model] = x._sum.quantity || 0; });

    // Current Month Outbound
    const curMonthOutboundAgg = await prisma.outboundRecord.groupBy({
        by: ['product_model'],
        where: { outbound_date: { gte: monthStartStr } },
        _sum: { quantity: true }
    });
    const curOutMap: Record<string, number> = {};
    curMonthOutboundAgg.forEach(x => { if(x.product_model) curOutMap[x.product_model] = x._sum.quantity || 0; });


    const monthlyChanges: Record<string, MonthlyInventoryChange> = {};
    
    for (const p of allProductModels) {
        if (!p.product_model) continue;

        const beforeIn = decimalCalc.fromSqlResult(beforeInMap[p.product_model] || 0, 0, 0);
        const beforeOut = decimalCalc.fromSqlResult(beforeOutMap[p.product_model] || 0, 0, 0);
        
        const curIn = decimalCalc.fromSqlResult(curInMap[p.product_model] || 0, 0, 0);
        const curOut = decimalCalc.fromSqlResult(curOutMap[p.product_model] || 0, 0, 0);

        // Start Inventory = Total In (before) - Total Out (before)
        // Note: This logic assumes simple inventory (no adjustments/losses other than outbound).
        const monthStartInventory = decimalCalc.toDbNumber(decimalCalc.subtract(beforeIn, beforeOut), 0);
        
        const monthlyChange = decimalCalc.toDbNumber(decimalCalc.subtract(curIn, curOut), 0);
        const currentInventory = decimalCalc.toDbNumber(decimalCalc.add(monthStartInventory, monthlyChange), 0);

        monthlyChanges[p.product_model] = {
            product_model: p.product_model,
            month_start_inventory: monthStartInventory,
            current_inventory: currentInventory,
            monthly_change: monthlyChange,
            query_date: new Date().toISOString(),
        };
    }
    stats.monthly_inventory_changes = monthlyChanges;

    // Write file
    try {
        fs.mkdirSync(path.dirname(statsFile), { recursive: true });
        fs.writeFileSync(statsFile, JSON.stringify(stats, null, 2), 'utf-8');
    } catch (e) {
        console.error('Failed to write overview-stats.json:', e);
    }
    
    res.json(stats);

  } catch (err: any) {
    console.error("Overview Stats Error:", err);
    res.status(500).json({ error: err.message || "Internal Server Error" });
  }
});

// Get top 10 products by sales amount and "Others" total (read from overview-stats.json)
router.get('/top-sales-products', (_req: Request, res: Response) => {
  const statsFile = resolveFilesInDataPath("overview-stats.json");
  if (fs.existsSync(statsFile)) {
    try {
      const json = fs.readFileSync(statsFile, 'utf-8');
      const stats: StatsCache = JSON.parse(json);
      if (Array.isArray(stats.top_sales_products)) {
        return res.json({ success: true, data: stats.top_sales_products });
      }
    } catch (e) {
      // Reading failed
    }
  }
  return res.status(503).json({ error: 'Statistics data not generated, please refresh first.' });
});

// Get monthly inventory change for specified product (read from overview-stats.json)
router.get('/monthly-inventory-change/:productModel', (req: Request, res: Response) => {
  const productModel = req.params['productModel'] as string;

  if (!productModel) {
    return res.status(400).json({
      success: false,
      message: 'Product model cannot be empty',
    });
  }

  const statsFile = resolveFilesInDataPath("overview-stats.json");
  if (fs.existsSync(statsFile)) {
    try {
      const json = fs.readFileSync(statsFile, 'utf-8');
      const stats: StatsCache = JSON.parse(json);

      // Find monthly inventory change data for specified product from cache
      if (stats.monthly_inventory_changes && stats.monthly_inventory_changes[productModel]) {
        return res.json({
          success: true,
          data: stats.monthly_inventory_changes[productModel],
        });
      } else {
        return res.json({
          success: false,
          message: 'Monthly inventory change data not found for this product, please refresh statistics first',
        });
      }
    } catch (e) {
      // Reading failed
    }
  }

  return res.status(503).json({
    success: false,
    error: 'Statistics data not generated, please refresh first.',
  });
});

export default router;
