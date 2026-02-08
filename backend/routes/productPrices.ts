import express, { type Router, type Request, type Response } from 'express';
import { prisma } from '@/prismaClient.js';
import { Prisma } from '@prisma/client';

const router: Router = express.Router();

router.get('/', async (req: Request, res: Response): Promise<void> => {
  const { partner_short_name, product_model, effective_date } = req.query;
  const page = Number(req.query['page'] || 1);
  const limit = 10;
  const skip = (page - 1) * limit;

  const where: Prisma.ProductPriceWhereInput = {};

  if (partner_short_name) {
    where.partner_short_name = { contains: partner_short_name as string };
  }
  if (product_model) {
    where.product_model = { contains: product_model as string };
  }
  if (effective_date) {
    where.effective_date = effective_date as string;
  }

  try {
    const [rows, total] = await prisma.$transaction([
      prisma.productPrice.findMany({
        where,
        orderBy: [
            { effective_date: 'desc' }, 
            { partner_short_name: 'asc' }, 
            { product_model: 'asc' } // Ensure deterministic ordering
        ],
        skip,
        take: limit
      }),
      prisma.productPrice.count({ where })
    ]);

    // Rows are already in snake_case

    res.json({
      data: rows,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/product-prices/current
 */
router.get('/current', async (req: Request, res: Response): Promise<void> => {
  const { partner_short_name, product_model, date } = req.query;
  
  if (!partner_short_name || !product_model) {
    res.status(400).json({ error: 'Missing required argument: partner_short_name & product_model' });
    return;
  }
  
  const targetDate = (date as string) || new Date().toISOString().split('T')[0];
  
  try {
    const row = await prisma.productPrice.findFirst({
      where: {
        partner_short_name: partner_short_name as string,
        product_model: product_model as string,
        effective_date: { lte: targetDate }
      },
      orderBy: { effective_date: 'desc' }
    });
    
    if (!row) {
      res.status(404).json({ error: 'No valid price found' });
      return;
    }
    
    // Rows are already in snake_case
    
    res.json({ data: row });
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/product-prices
 */
router.post('/', async (req: Request, res: Response): Promise<void> => {
  const { partner_short_name, product_model, effective_date, unit_price } = req.body;
  
  try {
    const result = await prisma.productPrice.create({
      data: {
        partner_short_name,
        product_model,
        effective_date,
        unit_price
      }
    });
    
    res.json({ id: result.id, message: 'Product price created!' });
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /api/product-prices/:id
 */
router.put('/:id', async (req: Request, res: Response): Promise<void> => {
  const id = Number(req.params['id']);
  const { partner_short_name, product_model, effective_date, unit_price } = req.body;
  
  try {
    await prisma.productPrice.update({
      where: { id },
      data: {
        partner_short_name,
        product_model,
        effective_date,
        unit_price
      }
    });
    
    res.json({ message: 'Product price updated!' });
  } catch (err) {
    const error = err as Error;
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        res.status(404).json({ error: 'Product price dne' });
        return;
    }
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/product-prices/:id
 */
router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  const id = Number(req.params['id']);
  
  try {
    await prisma.productPrice.delete({
       where: { id }
    });
    
    res.json({ message: 'Product price delete!' });
  } catch (err) {
    const error = err as Error;
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        res.status(404).json({ error: 'Product price dne' });
        return;
    }
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/product-prices/auto
 * Automatically get product prices
 */
router.get('/auto', async (req: Request, res: Response): Promise<void> => {
  const { partner_short_name, product_model, date } = req.query;
  
  if (!partner_short_name || !product_model || !date) {
    res.status(400).json({ error: 'Missing required argument: partner_short_name, product_model, date' });
    return;
  }
  
  try {
    const row = await prisma.productPrice.findFirst({
        where: {
            partner_short_name: partner_short_name as string,
            product_model: product_model as string,
            effective_date: { lte: date as string }
        },
        orderBy: { effective_date: 'desc' },
        select: { unit_price: true }
    });
    
    if (!row) {
      res.status(404).json({ error: 'No valid price found' });
      return;
    }
    // Note: row.unit_price is snake_case in SQL result and Prisma Client
    
    res.json({ unit_price: row.unit_price });
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ error: error.message });
  }
});

export default router;
