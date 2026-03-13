import express, { type Router, type Request, type Response } from 'express';
import { prisma } from '@/prismaClient';
import { inventoryService } from '@/utils/inventoryService';
import { Prisma } from '@prisma/client';
import decimalCalc from '@/utils/decimalCalculator';
import { pagination_limit } from '@/utils/paths';

const router: Router = express.Router();

/**
 * GET /api/inventory
 */
router.get('/', async (req: Request, res: Response): Promise<void> => {
  const { product_model, page = 1, limit = pagination_limit } = req.query;
  const pageNum = Number(page) || 1;
  const limitNum = Number(limit) || pagination_limit;
  const skip = (pageNum - 1) * limitNum;

  // Filter
  const where: Prisma.InventoryWhereInput = {};
  if (product_model) {
    where.product_model = { contains: String(product_model) };
  }

  // Query DB
  const [rows, total] = await prisma.$transaction([
    prisma.inventory.findMany({
      where,
      orderBy: { product_model: 'asc' },
      skip,
      take: limitNum,
    }),
    prisma.inventory.count({ where }),
  ]);

  const results = rows.map((row) => {
    return {
      product_model: row.product_model,
      current_inventory: row.quantity,
    };
  });

  res.json({
    data: results,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      pages: Math.ceil(total / limitNum),
    },
  });
});

/**
 * GET /api/inventory/total-cost-estimate
 */
router.get('/total-cost-estimate', async (_req: Request, res: Response): Promise<void> => {
  const items = await prisma.inventory.findMany({
    where: { quantity: { gt: 0 } },
  });

  let totalCost = decimalCalc.decimal(0);

  // This loop might be slow if thousands of products, but typically fine for SMB
  for (const item of items) {
    // Get latest purchase price
    const priceRow = await prisma.inboundRecord.findFirst({
      where: { product_model: item.product_model },
      orderBy: [{ inbound_date: 'desc' }, { id: 'desc' }],
      select: { unit_price: true },
    });

    if (priceRow && priceRow.unit_price) {
      const infoCost = decimalCalc.multiply(item.quantity, priceRow.unit_price);
      totalCost = decimalCalc.add(totalCost, infoCost);
    }
  }

  res.json({
    total_cost_estimate: decimalCalc.toDbNumber(totalCost, 2),
    last_updated: new Date().toISOString(),
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
    products_count: result.products_count,
  });
});

export default router;
