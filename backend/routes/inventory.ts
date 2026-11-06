import { Hono } from 'hono';
import { prisma } from '@/prismaClient';
import { inventoryService } from '@/utils/inventoryService';
import decimalCalc from '@/utils/decimalCalculator';
import { pagination_limit } from '@/utils/paths';
import { listInventory } from '@/services/readService';
import type { AppEnv } from '@/types/hono';

const app = new Hono<AppEnv>();

/**
 * GET /api/inventory
 */
app.get('/', async (c) => {
  const product_model = c.req.query('product_model');
  const page = c.req.query('page') ?? '1';
  const limit = c.req.query('limit') ?? String(pagination_limit);
  const pageNum = Number(page) || 1;
  const limitNum = Number(limit) || pagination_limit;

  const result = await listInventory(prisma, {
    productModel: product_model ? String(product_model) : undefined,
    page: pageNum,
    limit: limitNum
  });

  return c.json({
    data: result.data,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total: result.total,
      pages: result.pages
    }
  });
});

/**
 * GET /api/inventory/total-cost-estimate
 */
app.get('/total-cost-estimate', async (c) => {
  const items = await prisma.inventory.findMany({
    where: { quantity: { gt: 0 } }
  });

  let totalCost = decimalCalc.decimal(0);

  for (const item of items) {
    const priceRow = await prisma.inboundRecord.findFirst({
      where: { product: { product_model: item.product_model } },
      orderBy: [{ inbound_date: 'desc' }, { id: 'desc' }],
      select: { unit_price: true }
    });

    if (priceRow && priceRow.unit_price) {
      const infoCost = decimalCalc.multiply(item.quantity, priceRow.unit_price);
      totalCost = decimalCalc.add(totalCost, infoCost);
    }
  }

  return c.json({
    total_cost_estimate: decimalCalc.toDbNumber(totalCost, 2),
    last_updated: new Date().toISOString()
  });
});

/**
 * POST /api/inventory/refresh
 */
app.post('/refresh', async (c) => {
  const result = await inventoryService.recalculateAll();
  return c.json({
    success: true,
    message: 'Inventory recalculation completed!',
    last_updated: new Date().toISOString(),
    products_count: result.products_count
  });
});

export default app;
