import { prisma } from '@/prismaClient';
import decimalCalc from '@/utils/decimalCalculator';

export interface InventoryExportRow {
  product_model: string;
  quantity: number;
  unit_cost: number;
  total_value: number;
}

export async function getInventoryData(): Promise<InventoryExportRow[]> {
  const items = await prisma.inventory.findMany({
    where: { quantity: { gt: 0 } },
    orderBy: { product_model: 'asc' },
  });

  const results: InventoryExportRow[] = [];

  for (const item of items) {
    let unitCost = 0;
    let totalValue = 0;

    // Get latest purchase price
    const priceRow = await prisma.inboundRecord.findFirst({
      where: { product: { product_model: item.product_model } },
      orderBy: [{ inbound_date: 'desc' }, { id: 'desc' }],
      select: { unit_price: true },
    });

    if (priceRow && priceRow.unit_price) {
      unitCost = priceRow.unit_price;
      const infoCost = decimalCalc.multiply(item.quantity, priceRow.unit_price);
      totalValue = decimalCalc.toDbNumber(infoCost, 2);
    }

    results.push({
      product_model: item.product_model,
      quantity: item.quantity,
      unit_cost: unitCost,
      total_value: totalValue,
    });
  }

  return results;
}
