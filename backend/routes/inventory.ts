import express, { type Router, type Request, type Response } from 'express';
import { prisma } from '@/prismaClient';
import { inventoryService } from '@/utils/inventoryService';
import decimalCalc from '@/utils/decimalCalculator';
import { pagination_limit } from '@/utils/paths';
import { listInventory } from '@/services/readService';

const router: Router = express.Router();

/**
 * GET /api/inventory
 */
router.get('/', async (req: Request, res: Response): Promise<void> => {
  const { product_model, page = 1, limit = pagination_limit } = req.query;
  const pageNum = Number(page) || 1;
  const limitNum = Number(limit) || pagination_limit;
  const result = await listInventory(prisma, {
    productModel: product_model ? String(product_model) : undefined,
    page: pageNum,
    limit: limitNum
  });

  res.json({
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
router.get('/total-cost-estimate', async (_req: Request, res: Response): Promise<void> => {
  const items = await prisma.inventory.findMany({
    where: { quantity: { gt: 0 } }
  });

  let totalCost = decimalCalc.decimal(0);

  // This loop might be slow if thousands of products, but typically fine for SMB
  for (const item of items) {
    // Get latest purchase price
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

  res.json({
    total_cost_estimate: decimalCalc.toDbNumber(totalCost, 2),
    last_updated: new Date().toISOString()
  });
});

/**
 * POST /api/inventory/refresh
 */
router.post('/refresh', async (_req: Request, res: Response): Promise<void> => {
  const result = await inventoryService.recalculateAll();
  res.json({
    success: true,
    message: 'Inventory recalculation completed!',
    last_updated: new Date().toISOString(),
    products_count: result.products_count
  });
});

export default router;
