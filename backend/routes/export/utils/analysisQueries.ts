import { prisma } from '@/prismaClient';
import decimalCalc from '@/utils/decimalCalculator';

interface Batch {
  quantity_remaining: number;
  unit_price: number;
}

export default class AnalysisQueries {
  /**
   * Helper to perform FIFO calculation and return enriched outbound records
   */
  private async calculateFIFOData(startDate: string, endDate: string) {
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
    const partnerCodeMap = new Map<string, any>();
    const partnerShortMap = new Map<string, any>();
    partners.forEach((p) => {
      if (p.code) partnerCodeMap.set(p.code, p);
      if (p.short_name) partnerShortMap.set(p.short_name, p);
    });

    // 3. FIFO Simulation
    const inventoryState: Record<string, Batch[]> = {};
    const processedRecords: any[] = [];

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

        const batch = batches[0]!;
        const take = Math.min(batch.quantity_remaining, qtyToFulfill);

        if (isTarget && partner) {
          const portionCost = decimalCalc.multiply(take, batch.unit_price);
          currentRecordCost = decimalCalc.add(currentRecordCost, portionCost);
        }

        batch.quantity_remaining -= take;
        qtyToFulfill -= take;

        if (batch.quantity_remaining <= 0) {
          batches.shift();
        }
      }

      if (isTarget && partner) {
        // Record this transaction for analysis
        processedRecords.push({
          ...outRecord,
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
  async getCustomerAnalysisData(startDate: string, endDate: string): Promise<any[]> {
    try {
      const records = await this.calculateFIFOData(startDate, endDate);

      const customerMap: Record<string, any> = {};

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

        if (!cust.product_details_map[productModel]) {
          cust.product_details_map[productModel] = {
            product_model: productModel,
            sales_amount: 0,
            cost_amount: 0,
            profit_amount: 0,
            profit_rate: 0,
          };
        }
        const prod = cust.product_details_map[productModel];
        prod.sales_amount += salesAmount;
        prod.cost_amount += costAmount;
        prod.profit_amount += profitAmount;
      }

      return Object.values(customerMap)
        .map((cust: any) => {
          cust.profit_rate =
            cust.sales_amount !== 0 ? (cust.profit_amount / cust.sales_amount) * 100 : 0;
          cust.product_details = Object.values(cust.product_details_map)
            .map((prod: any) => {
              prod.profit_rate =
                prod.sales_amount !== 0 ? (prod.profit_amount / prod.sales_amount) * 100 : 0;
              return prod;
            })
            .sort((a: any, b: any) => b.sales_amount - a.sales_amount);

          delete cust.product_details_map;
          return cust;
        })
        .sort((a: any, b: any) => b.sales_amount - a.sales_amount);
    } catch (error) {
      throw error as Error;
    }
  }

  /**
   * Get product analysis data with customer details
   */
  async getProductAnalysisData(startDate: string, endDate: string): Promise<any[]> {
    try {
      const records = await this.calculateFIFOData(startDate, endDate);
      const productMap: Record<string, any> = {};

      for (const row of records) {
        const customerCode = row.resolved_customer_code;
        const customerName = row.customer_full_name;
        const productModel = row.product_model;

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
        const custDetails = prod.customer_details_map[customerCode];
        custDetails.sales_amount += salesAmount;
        custDetails.cost_amount += costAmount;
        custDetails.profit_amount += profitAmount;
      }

      return Object.values(productMap)
        .map((prod: any) => {
          prod.profit_rate =
            prod.sales_amount !== 0 ? (prod.profit_amount / prod.sales_amount) * 100 : 0;
          prod.customer_details = Object.values(prod.customer_details_map)
            .map((cust: any) => {
              cust.profit_rate =
                cust.sales_amount !== 0 ? (cust.profit_amount / cust.sales_amount) * 100 : 0;
              return cust;
            })
            .sort((a: any, b: any) => b.sales_amount - a.sales_amount);

          delete prod.customer_details_map;
          return prod;
        })
        .filter((product: any) => product.product_model && product.product_model.trim() !== '')
        .sort((a: any, b: any) => b.sales_amount - a.sales_amount);
    } catch (error) {
      throw error as Error;
    }
  }
}
