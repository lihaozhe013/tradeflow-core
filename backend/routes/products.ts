import { Hono } from 'hono';
import { prisma } from '@/prismaClient';
import { pagination_limit } from '@/utils/paths';
import { searchProducts } from '@/services/readService';
import type { AppEnv } from '@/types/hono';

const app = new Hono<AppEnv>();

interface ProductBinding {
  code: string;
  product_model: string;
}

/**
 * GET /api/products
 */
app.get('/', async (c) => {
  const category = c.req.query('category');
  const product_model = c.req.query('product_model');
  const code = c.req.query('code');
  const page = c.req.query('page');
  const limit = c.req.query('limit');

  const usePagination = page !== undefined || limit !== undefined;
  let pageNum = parseInt(page ?? '1', 10);
  if (!Number.isFinite(pageNum) || pageNum < 1) pageNum = 1;
  const limitNum = Number(limit) || pagination_limit;
  const result = await searchProducts(prisma, {
    category,
    productModel: product_model,
    code,
    ...(usePagination ? { page: pageNum, limit: limitNum } : {})
  });

  if (!usePagination) {
    return c.json({ data: result.data });
  }

  return c.json({
    data: result.data,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total: 'total' in result ? result.total : 0,
      pages: 'pages' in result ? result.pages : 0
    }
  });
});

app.get('/categories', async (c) => {
  const rows = await prisma.product.findMany({
    select: { category: true },
    distinct: ['category'],
    where: { category: { not: null } },
    orderBy: { category: 'asc' }
  });
  return c.json({ data: rows.map((row) => row.category).filter(Boolean) });
});

/**
 * POST /api/products
 */
app.post('/', async (c) => {
  let body: any;
  try {
    body = await c.req.json();
  } catch {
    body = {};
  }
  const { code, category, product_model, remark } = body;

  await prisma.product.create({
    data: {
      code,
      category,
      product_model,
      remark
    }
  });
  return c.json({ code, message: 'Product info created!' });
});

/**
 * PUT /api/products/:code
 */
app.put('/:code', async (c) => {
  const code = c.req.param('code');
  let body: any;
  try {
    body = await c.req.json();
  } catch {
    body = {};
  }
  const { category, product_model, remark } = body;

  await prisma.product.update({
    where: { code },
    data: {
      category,
      product_model,
      remark
    }
  });

  return c.json({ message: 'Product info updated!' });
});

/**
 * DELETE /api/products/:code
 */
app.delete('/:code', async (c) => {
  const code = c.req.param('code');

  await prisma.product.delete({
    where: { code }
  });

  return c.json({ message: 'Product info deleted!' });
});

/**
 * POST /api/products/bindings
 */
app.post('/bindings', async (c) => {
  let rawBody: any;
  try {
    rawBody = await c.req.json();
  } catch {
    rawBody = [];
  }
  const bindings: ProductBinding[] = Array.isArray(rawBody) ? rawBody : [rawBody];

  if (!bindings.length) {
    return c.json({ error: 'No data binded' }, 400);
  }

  const codes = new Set<string>();
  const models = new Set<string>();

  for (const b of bindings) {
    if (!b.code || !b.product_model) {
      return c.json({ error: 'The code and model cannot be left blank' }, 400);
    }
    if (codes.has(b.code) || models.has(b.product_model)) {
      return c.json({ error: 'Duplicated data' }, 400);
    }
    codes.add(b.code);
    models.add(b.product_model);
  }

  const bCodes = Array.from(codes);
  const bModels = Array.from(models);

  const conflicts = await prisma.product.findMany({
    where: {
      OR: [{ code: { in: bCodes } }, { product_model: { in: bModels } }]
    },
    select: {
      code: true,
      product_model: true
    }
  });

  if (conflicts.length > 0) {
    return c.json({ error: 'Conflict data', conflicts }, 400);
  }

  await prisma.$transaction(
    bindings.map((b) =>
      prisma.product.create({
        data: {
          code: b.code,
          product_model: b.product_model
        }
      })
    )
  );

  return c.json({ message: 'Binded' });
});

export default app;
