import { Prisma } from '@/prisma/client';
import { prisma } from '@/prismaClient';
import decimalCalc from '@/utils/decimalCalculator';

/**
 * Calculate the Cost of Goods Sold (COGS) using FIFO (First-In, First-Out) method.
 * This provides much more accurate profit analysis than global weighted average.
 */

export async function calculateFilteredSoldGoodsCost(
  startDate: string,
  endDate: string,
  customerCode: string | null | undefined,
  productModel: string | null | undefined,
): Promise<number> {
  // 1. Fetch all INBOUND records (Supply) - Sorted Oldest First
  // We need 'all' history to trace the FIFO queue correctly.
  const inboundWhere: Prisma.InboundRecordWhereInput = {
    quantity: { gt: 0 },
  };
  if (productModel && productModel !== 'All') {
    inboundWhere.product = { product_model: productModel };
  }

  const allInbound = await prisma.inboundRecord.findMany({
    where: inboundWhere,
    orderBy: [{ inbound_date: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      product: { select: { product_model: true } },
      quantity: true,
      unit_price: true,
      inbound_date: true,
    },
  });

  // 2. Fetch all OUTBOUND records (Demand) - Sorted Oldest First
  // We also need history to know what was consumed before the start_date
  const outboundWhere: Prisma.OutboundRecordWhereInput = {
    quantity: { gt: 0 },
  };
  // Optimization: We only strictly need outbound records <= endDate.
  // Future outbound records don't affect the cost of the period we are analyzing.
  outboundWhere.outbound_date = { lte: endDate };

  if (productModel && productModel !== 'All') {
    outboundWhere.product = { product_model: productModel };
  }

  // Note: We don't filter by customerCode here initially because we need to calculate
  // proper FIFO consumption for *all* sales of this product to know which batch is being sold
  // to *this* customer. FIFO is global per product.

  const allOutbound = await prisma.outboundRecord.findMany({
    where: outboundWhere,
    orderBy: [{ outbound_date: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      product: { select: { product_model: true } },
      quantity: true,
      outbound_date: true,
      customer_code: true,
      unit_price: true, // selling price (for fallback)
    },
  });

  // 3. FIFO Simulation

  // State: Available inventory batches for each product
  // Map<ProductModel, Array<{ quantity_remaining: number, cost: number }>>
  const inventoryState: Record<
    string,
    Array<{ quantity_remaining: number; unit_price: number }>
  > = {};

  // Initialize state with all inbound
  for (const inRecord of allInbound) {
    if (!inRecord.product?.product_model || !inRecord.quantity || inRecord.quantity <= 0) continue;

    if (!inventoryState[inRecord.product?.product_model]) {
      inventoryState[inRecord.product?.product_model] = [];
    }
    if (!inventoryState[inRecord.product?.product_model]) {
      inventoryState[inRecord.product?.product_model] = [];
    }
    inventoryState[inRecord.product?.product_model]!.push({
      quantity_remaining: inRecord.quantity,
      unit_price: inRecord.unit_price || 0,
    });
  }

  let totalPeriodCost = decimalCalc.decimal(0);

  // Process outbound in chronological order
  for (const outRecord of allOutbound) {
    if (!outRecord.product?.product_model || !outRecord.quantity) continue;

    const model = outRecord.product?.product_model;
    let qtyToFulfill = outRecord.quantity;
    let currentRecordCost = decimalCalc.decimal(0);

    // Is this record within our analysis window and filters?
    const isTargetRecord =
      outRecord.outbound_date! >= startDate &&
      outRecord.outbound_date! <= endDate &&
      (!customerCode || customerCode === 'All' || outRecord.customer_code === customerCode);

    // FIFO matching loop
    const batches = inventoryState[model] || [];

    while (qtyToFulfill > 0) {
      if (batches.length === 0) {
        break;
      }

      const batch = batches[0]!;

      if (batch.quantity_remaining > qtyToFulfill) {
        // Batch has enough
        if (isTargetRecord) {
          const costChunk = decimalCalc.multiply(qtyToFulfill, batch.unit_price);
          currentRecordCost = decimalCalc.add(currentRecordCost, costChunk);
        }
        batch.quantity_remaining -= qtyToFulfill;
        qtyToFulfill = 0;
      } else {
        // Batch exhausted
        if (isTargetRecord) {
          const costChunk = decimalCalc.multiply(batch.quantity_remaining, batch.unit_price);
          currentRecordCost = decimalCalc.add(currentRecordCost, costChunk);
        }
        qtyToFulfill -= batch.quantity_remaining;
        batches.shift(); // Remove empty batch
      }
    }

    if (isTargetRecord) {
      totalPeriodCost = decimalCalc.add(totalPeriodCost, currentRecordCost);
    }
  }
  const finalResult = decimalCalc.toDbNumber(totalPeriodCost, 2);
  return finalResult;
}
