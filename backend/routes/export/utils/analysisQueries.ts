import { prisma } from '@/prismaClient';
import decimalCalc from '@/utils/decimalCalculator';
import { AnalysisCustomerData, AnalysisProductData, AnalysisRecord } from './types';

interface Batch {
  quantity_remaining: number;
  unit_price: number;
}

interface ProductStats {
  product_model: string;
  sales_amount: number;
  cost_amount: number;
  profit_amount: number;
  profit_rate: number;
}

interface CustomerStats {
  customer_code: string;
  customer_name: string;
  sales_amount: number;
  cost_amount: number;
  profit_amount: number;
  profit_rate: number;
}

interface CustomerAggregation extends CustomerStats {
  product_details_map: Record<string, ProductStats>;
}

interface ProductAggregation extends ProductStats {
  customer_details_map: Record<string, CustomerStats>;
}

/**
 * Perform FIFO calculation and return enriched outbound records
 */
async function calculateFIFOData(startDate: string, endDate: string): Promise<AnalysisRecord[]> {
  // 1. Fetch Data
  const [allInbound, allOutbound, partners] = await Promise.all([
    // Inbound: All history, sorted by date asc for FIFO
    prisma.inboundRecord.findMany({
      where: { quantity: { gt: 0 } },
      orderBy: [{ inbound_date: 'asc' }, { id: 'asc' }],
      select: { product_model: true, quantity: true, unit_price: true },
    }),
    // Outbound: Up to endDate
    prisma.outboundRecord.findMany({
      where: { quantity: { gt: 0 }, outbound_date: { lte: endDate } },
      orderBy: [{ outbound_date: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        product_model: true,
        quantity: true,
        outbound_date: true,
        unit_price: true,
        total_price: true,
        customer_code: true,
        customer_short_name: true,
      },
    }),
    // Partners for resolution
    prisma.partner.findMany({
      select: { code: true, short_name: true, full_name: true },
    }),
  ]);

  // 2. Prepare Maps
  const partnerCodeMap = new Map<string, { code: string; full_name: string }>();
  const partnerShortMap = new Map<string, { code: string; full_name: string }>();
  partners.forEach((p) => {
    if (p.code)
      partnerCodeMap.set(p.code, {
        code: p.code,
        full_name: p.full_name || "",
      });
    if (p.short_name)
      partnerShortMap.set(p.short_name, {
        code: p.code || "",
        full_name: p.full_name || "",
      });
  });

  // 3. FIFO Simulation
  const inventoryState: Record<string, Batch[]> = {};
  const processedRecords: AnalysisRecord[] = [];

  // Initial Inventory (Inbound)
  for (const inRecord of allInbound) {
    if (!inRecord.product_model || !inRecord.quantity) continue;
    if (!inventoryState[inRecord.product_model]) inventoryState[inRecord.product_model] = [];

    inventoryState[inRecord.product_model]!.push({
      quantity_remaining: Number(inRecord.quantity),
      unit_price: Number(inRecord.unit_price),
    });
  }

  // Process Outbound
  for (const outRecord of allOutbound) {
    if (!outRecord.product_model || !outRecord.quantity) continue;

    const model = outRecord.product_model;
    let qtyToFulfill = Number(outRecord.quantity);
    let currentRecordCost = decimalCalc.decimal(0);

    const batches = inventoryState[model] || [];

    // Determine if this record is in our target period
    const isTarget = outRecord.outbound_date! >= startDate && outRecord.outbound_date! <= endDate;

    // Resolve Partner - match behavior of "p.code IS NOT NULL"
    let partner = null;
    if (outRecord.customer_code && partnerCodeMap.has(outRecord.customer_code)) {
      partner = partnerCodeMap.get(outRecord.customer_code);
    } else if (
      outRecord.customer_short_name &&
      partnerShortMap.has(outRecord.customer_short_name)
    ) {
      partner = partnerShortMap.get(outRecord.customer_short_name);
    }

    // FIFO consumption
    while (qtyToFulfill > 0) {
      if (batches.length === 0) break;

      const batch = batches[0];
      if (!batch) break;

      const take = Math.min(batch.quantity_remaining, qtyToFulfill);

      if (isTarget && partner) {
        const portionCost = decimalCalc.multiply(take, batch.unit_price);
        currentRecordCost = decimalCalc.add(currentRecordCost, portionCost);
      }

      batch.quantity_remaining -= take;
      qtyToFulfill -= take;

      if (batch.quantity_remaining <= 0) {
        batches.shift();
      } else {
        // If batch not exhausted, don't shift. Loop continues?
        // If qtyToFulfill > 0, we continue.
        // Wait, 'take' is min(batch, qtyToFulfill).
        // If batch > qty, then take = qty. batch remains > 0. qty becomes 0. loop ends.
        // If batch < qty, then take = batch. batch becomes 0. qty remains > 0. shift.
        // Logic is sound.
      }
    }

    if (isTarget && partner) {
      // Record this transaction for analysis
      processedRecords.push({
        id: outRecord.id,
        product_model: outRecord.product_model,
        quantity: Number(outRecord.quantity),
        outbound_date: outRecord.outbound_date,
        unit_price: Number(outRecord.unit_price),
        total_price: Number(outRecord.total_price),
        customer_code: outRecord.customer_code,
        customer_short_name: outRecord.customer_short_name,
        cost_amount: decimalCalc.toNumber(currentRecordCost, 2), // Decimal
        sales_amount: Number(outRecord.total_price || 0),
        customer_full_name: partner.full_name,
        resolved_customer_code: partner.code,
      });
    }
  }

  return processedRecords;
}

/**
 * Get customer analysis data with product details
 */
export async function getCustomerAnalysisData(
  startDate: string,
  endDate: string,
): Promise<AnalysisCustomerData[]> {
  const records = await calculateFIFOData(startDate, endDate);

  const customerMap: Record<string, CustomerAggregation> = {};

  for (const row of records) {
    const customerCode = row.resolved_customer_code;
    const customerName = row.customer_full_name;
    const productModel = row.product_model;

    const salesAmount = row.sales_amount;
    const costAmount = row.cost_amount;
    const profitAmount = salesAmount - costAmount;

    if (!customerMap[customerCode]) {
      customerMap[customerCode] = {
        customer_code: customerCode,
        customer_name: customerName,
        sales_amount: 0,
        cost_amount: 0,
        profit_amount: 0,
        profit_rate: 0,
        product_details_map: {},
      };
    }

    const cust = customerMap[customerCode];
    cust.sales_amount += salesAmount;
    cust.cost_amount += costAmount;
    cust.profit_amount += profitAmount;

    // productModel could be null in DB but filtered out in calculateFIFOData
    const modelKey = productModel || 'Unknown';

    if (!cust.product_details_map[modelKey]) {
      cust.product_details_map[modelKey] = {
        product_model: modelKey,
        sales_amount: 0,
        cost_amount: 0,
        profit_amount: 0,
        profit_rate: 0,
      };
    }
    const prod = cust.product_details_map[modelKey];
    prod.sales_amount += salesAmount;
    prod.cost_amount += costAmount;
    prod.profit_amount += profitAmount;
  }

  return Object.values(customerMap)
    .map((cust) => {
      cust.profit_rate =
        cust.sales_amount !== 0 ? (cust.profit_amount / cust.sales_amount) * 100 : 0;
      const productDetails = Object.values(cust.product_details_map)
        .map((prod) => {
          prod.profit_rate =
            prod.sales_amount !== 0 ? (prod.profit_amount / prod.sales_amount) * 100 : 0;
          return prod;
        })
        .sort((a, b) => b.sales_amount - a.sales_amount);

      // Construct final object without the map
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { product_details_map, ...rest } = cust;
      return { ...rest, product_details: productDetails };
    })
    .sort((a, b) => b.sales_amount - a.sales_amount);
}

/**
 * Get product analysis data with customer details
 */
export async function getProductAnalysisData(
  startDate: string,
  endDate: string,
): Promise<AnalysisProductData[]> {
  const records = await calculateFIFOData(startDate, endDate);
  const productMap: Record<string, ProductAggregation> = {};

  for (const row of records) {
    const customerCode = row.resolved_customer_code;
    const customerName = row.customer_full_name;
    const productModel = row.product_model || 'Unknown';

    const salesAmount = row.sales_amount;
    const costAmount = row.cost_amount;
    const profitAmount = salesAmount - costAmount;

    if (!productMap[productModel]) {
      productMap[productModel] = {
        product_model: productModel,
        sales_amount: 0,
        cost_amount: 0,
        profit_amount: 0,
        profit_rate: 0,
        customer_details_map: {},
      };
    }

    const prod = productMap[productModel];
    prod.sales_amount += salesAmount;
    prod.cost_amount += costAmount;
    prod.profit_amount += profitAmount;

    if (!prod.customer_details_map[customerCode]) {
      prod.customer_details_map[customerCode] = {
        customer_code: customerCode,
        customer_name: customerName,
        sales_amount: 0,
        cost_amount: 0,
        profit_amount: 0,
        profit_rate: 0,
      };
    }
    const cust = prod.customer_details_map[customerCode];
    cust.sales_amount += salesAmount;
    cust.cost_amount += costAmount;
    cust.profit_amount += profitAmount;
  }

  return Object.values(productMap)
    .map((prod) => {
      prod.profit_rate =
        prod.sales_amount !== 0 ? (prod.profit_amount / prod.sales_amount) * 100 : 0;
      const customerDetails = Object.values(prod.customer_details_map)
        .map((cust) => {
          cust.profit_rate =
            cust.sales_amount !== 0 ? (cust.profit_amount / cust.sales_amount) * 100 : 0;
          return cust;
        })
        .sort((a, b) => b.sales_amount - a.sales_amount);

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { customer_details_map, ...rest } = prod;
      return { ...rest, customer_details: customerDetails };
    })
    .sort((a, b) => b.sales_amount - a.sales_amount);
}
