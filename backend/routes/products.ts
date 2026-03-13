import express, { type Router, type Request, type Response } from 'express';
import { prisma } from '@/prismaClient';
import { Prisma } from '@prisma/client';

const router: Router = express.Router();

interface ProductBinding {
  code: string;
  product_model: string;
}

/**
 * GET /api/products
 */
router.get('/', async (req: Request, res: Response): Promise<void> => {
  const { category, product_model, code } = req.query;

  const where: Prisma.ProductWhereInput = {};

  if (category) {
    where.category = { contains: category as string };
  }
  if (product_model) {
    where.product_model = { contains: product_model as string };
  }
  if (code) {
    where.code = { contains: code as string };
  }

  const rows = await prisma.product.findMany({
    where,
    orderBy: { code: 'asc' },
  });
  res.json({ data: rows });
});

/**
 * POST /api/products
 */
router.post('/', async (req: Request, res: Response): Promise<void> => {
  const { code, category, product_model, remark } = req.body;

  await prisma.product.create({
    data: {
      code,
      category,
      product_model,
      remark,
    },
  });
  res.json({ code, message: 'Product info created!' });
});

/**
 * PUT /api/products/:code
 */
router.put('/:code', async (req: Request, res: Response): Promise<void> => {
  const code = req.params['code'] as string;
  const { category, product_model, remark } = req.body;

  await prisma.product.update({
    where: { code },
    data: {
      category,
      product_model,
      remark,
    },
  });

  res.json({ message: 'Product info updated!' });
});

/**
 * DELETE /api/products/:code
 */
router.delete('/:code', async (req: Request, res: Response): Promise<void> => {
  const code = req.params['code'] as string;

  await prisma.product.delete({
    where: { code },
  });

  res.json({ message: 'Product info deleted!' });
});

/**
 * POST /api/products/bindings
 */
router.post('/bindings', async (req: Request, res: Response): Promise<void> => {
  // Parsing and simple validation
  const rawBody = req.body;
  const bindings: ProductBinding[] = Array.isArray(rawBody) ? rawBody : [rawBody];

  if (!bindings.length) {
    res.status(400).json({ error: 'No data binded' });
    return;
  }

  const codes = new Set<string>();
  const models = new Set<string>();

  for (const b of bindings) {
    if (!b.code || !b.product_model) {
      res.status(400).json({ error: 'The code and model cannot be left blank' });
      return;
    }
    if (codes.has(b.code) || models.has(b.product_model)) {
      res.status(400).json({ error: 'Duplicated data' });
      return;
    }
    codes.add(b.code);
    models.add(b.product_model);
  }

  const bCodes = Array.from(codes);
  const bModels = Array.from(models);

  const conflicts = await prisma.product.findMany({
    where: {
      OR: [{ code: { in: bCodes } }, { product_model: { in: bModels } }],
    },
    select: {
      code: true,
      product_model: true,
    },
  });

  if (conflicts.length > 0) {
    res.status(400).json({ error: 'Conflict data', conflicts });
    return;
  }

  // Batch Insert
  await prisma.$transaction(
    bindings.map((b) =>
      prisma.product.create({
        data: {
          code: b.code,
          product_model: b.product_model,
        },
      }),
    ),
  );

  res.json({ message: 'Binded' });
});

export default router;
