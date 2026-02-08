/**
 * Inventory Cache Service
 * Calculate inventory from the database and cache management
 */
import { prisma } from "@/prismaClient.js";
import fs from "fs";
import path from "path";
import { logger } from "@/utils/logger.js";
import decimalCalc from "@/utils/decimalCalculator.js";
import { resolveFilesInDataPath } from "@/utils/paths.js";

const INVENTORY_CACHE_FILE = resolveFilesInDataPath("inventory-summary.json");

interface ProductInventoryData {
  current_inventory: number;
  last_inbound: string | null;
  last_outbound: string | null;
}

interface InventoryCacheData {
  last_updated: string;
  products: Record<string, ProductInventoryData>;
  total_cost_estimate?: number;
}

interface InventorySummaryItem {
  product_model: string;
  current_inventory: number;
  last_inbound: string | null;
  last_outbound: string | null;
  last_update: string;
}

interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

type ErrorCallback<T> = (err: Error | null, result?: T) => void;

/**
 * Calculate estimated total cost for current inventory
 */
async function calculateTotalCostEstimate(
  inventoryData: InventoryCacheData
): Promise<number> {
  // Get all products with available inventory
  const productsWithInventory = Object.entries(inventoryData.products).filter(
    ([_model, data]) => data.current_inventory > 0
  );

  if (productsWithInventory.length === 0) {
    return 0;
  }

  let totalCost = decimalCalc.decimal(0);

  // We can optimize this by batch querying last price for all needed models
  // Or just iterate.
  
  for (const [productModel, productData] of productsWithInventory) {
      // Retrieve the latest unit price for this product
      const row = await prisma.inboundRecord.findFirst({
          where: { product_model: productModel },
          orderBy: [
              { inbound_date: 'desc' },
              { id: 'desc' }
          ],
          select: { unit_price: true }
      });

      if (row && row.unit_price) {
          const productCost = decimalCalc.multiply(
            productData.current_inventory,
            row.unit_price
          );
          totalCost = decimalCalc.add(totalCost, productCost);
      }
  }

  return decimalCalc.toDbNumber(totalCost, 2); // 2 decimal places
}

/**
 * Perform heavy calculation: Aggregate all Inbound - Outbound for all products
 */
async function calculateAllInventory(): Promise<InventoryCacheData> {
    // 1. Group Inbound by product_model
    const inboundAgg = await prisma.inboundRecord.groupBy({
        by: ['product_model'],
        _sum: { quantity: true },
        _max: { inbound_date: true } 
    });
    
    // 2. Group Outbound by product_model
    const outboundAgg = await prisma.outboundRecord.groupBy({
        by: ['product_model'],
        _sum: { quantity: true },
        _max: { outbound_date: true }
    });
    
    const inventoryMap: Record<string, ProductInventoryData> = {};
    const allModels = new Set<string>();
    
    // Helper maps
    const inStats: Record<string, { qty: number, lastDate: string|null }> = {};
    inboundAgg.forEach(r => {
        if(r.product_model) {
            inStats[r.product_model] = { 
                qty: r._sum.quantity || 0,
                lastDate: r._max.inbound_date || null 
            };
            allModels.add(r.product_model);
        }
    });

    const outStats: Record<string, { qty: number, lastDate: string|null }> = {};
    outboundAgg.forEach(r => {
        if(r.product_model) {
            outStats[r.product_model] = { 
                qty: r._sum.quantity || 0,
                lastDate: r._max.outbound_date || null
            };
            allModels.add(r.product_model);
        }
    });
    
    // 3. Compute Net = In - Out
    allModels.forEach(model => {
        const inQty = inStats[model]?.qty || 0;
        const outQty = outStats[model]?.qty || 0;
        
        // Use decimal to be safe, though integer quantity usually fine
        const total = decimalCalc.toDbNumber(decimalCalc.subtract(inQty, outQty), 0);
        
        inventoryMap[model] = {
            current_inventory: total,
            last_inbound: inStats[model]?.lastDate || null,
            last_outbound: outStats[model]?.lastDate || null
        };
    });
    
    const data: InventoryCacheData = {
        last_updated: new Date().toISOString(),
        products: inventoryMap
    };
    
    // 4. Calculate Estimate Cost
    const totalCost = await calculateTotalCostEstimate(data);
    data.total_cost_estimate = totalCost;
    
    return data;
}

/**
 * Force refresh inventory cache
 */
export function refreshInventoryCache(
  callback?: ErrorCallback<InventoryCacheData>
): void {
  calculateAllInventory()
    .then(data => {
        try {
            // Write to file
            const dir = path.dirname(INVENTORY_CACHE_FILE);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            fs.writeFileSync(INVENTORY_CACHE_FILE, JSON.stringify(data, null, 2), "utf8");
            
            logger.info(`Inventory cache updated. Total products: ${Object.keys(data.products).length}`);
            if (callback) callback(null, data);
        } catch (e) {
            const err = e as Error;
            logger.error(`Failed to write inventory cache: ${err.message}`);
            if (callback) callback(err);
        }
    })
    .catch(err => {
        logger.error(`Failed to calculate inventory: ${err.message}`);
        if(callback) callback(err);
    });
}

/**
 * Get inventory summary (cached or calc on fly if missing)
 */
export function getAllInventoryData(
  callback: ErrorCallback<Record<string, ProductInventoryData>>
): void {
    // Try read file
    if(fs.existsSync(INVENTORY_CACHE_FILE)) {
        try {
            const raw = fs.readFileSync(INVENTORY_CACHE_FILE, 'utf8');
            const data: InventoryCacheData = JSON.parse(raw);
            return callback(null, data.products);
        } catch(e) {
            // read failed, fallback to refresh
        }
    }
    
    // If not exists or fail, refresh
    refreshInventoryCache((err, data) => {
        if(err) return callback(err);
        callback(null, data!.products);
    });
}

/**
 * Get full cache object
 */
export function getInventoryCache(
    callback: ErrorCallback<InventoryCacheData>
  ): void {
    if (fs.existsSync(INVENTORY_CACHE_FILE)) {
      try {
        const fileContent = fs.readFileSync(INVENTORY_CACHE_FILE, "utf8");
        const cacheData: InventoryCacheData = JSON.parse(fileContent);
        return callback(null, cacheData);
      } catch (e) {
         // Fail silently and refresh
      }
    }
    
    refreshInventoryCache((err, data) => {
        if (err) return callback(err);
        callback(null, data);
    });
}

/**
 * Get Inventory Summary with Pagination and Filtering
 */
export function getInventorySummary(
  filterModel: string | null,
  page: number,
  limit: number,
  callback: ErrorCallback<{
    data: InventorySummaryItem[];
    pagination: PaginationInfo;
  }>
): void {
  getAllInventoryData((err, productsMap) => {
    if (err) return callback(err);
    if (!productsMap) return callback(new Error("No inventory data available"));

    let items = Object.entries(productsMap).map(([model, info]) => ({
        product_model: model,
        current_inventory: info.current_inventory,
        last_inbound: info.last_inbound,
        last_outbound: info.last_outbound,
        last_update: new Date().toISOString() // Should technically be cache time, but for API compat use now or cache time
    }));
    
    // Filter
    if (filterModel) {
        const lower = filterModel.toLowerCase();
        items = items.filter(i => i.product_model.toLowerCase().includes(lower));
    }
    
    // Sort logic? Usually Model ASC or Quantity? Let's default to Model ASC
    items.sort((a, b) => a.product_model.localeCompare(b.product_model));
    
    // Pagination
    const total = items.length;
    const startIndex = (page - 1) * limit;
    const pagedItems = items.slice(startIndex, startIndex + limit);
    
    callback(null, {
        data: pagedItems,
        pagination: {
            page,
            limit,
            total,
            pages: Math.ceil(total / limit)
        }
    });

  });
}
