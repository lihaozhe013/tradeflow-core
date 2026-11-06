import { Hono } from 'hono';
import { prisma } from '@/prismaClient';
import type { Prisma } from '@/prisma/client';
import type { AppEnv } from '@/types/hono';

const app = new Hono<AppEnv>();

app.get('/', async (c) => {
  const partner_short_name = c.req.query('partner_short_name');
  const product_model = c.req.query('product_model');
  const effective_date = c.req.query('effective_date');
  const page = Number(c.req.query('page') || 1);
  const limit = 10;
  const skip = (page - 1) * limit;

  const where: Prisma.ProductPriceWhereInput = {};

  if (partner_short_name) {
    where.partner_short_name = { contains: partner_short_name };
  }
  if (product_model) {
    where.product_model = { contains: product_model };
  }
  if (effective_date) {
    where.effective_date = effective_date;
  }

  const [rows, total] = await prisma.$transaction([
    prisma.productPrice.findMany({
      where,
      orderBy: [
        { effective_date: 'desc' },
        { partner_short_name: 'asc' },
        { product_model: 'asc' }
      ],
      skip,
      take: limit
    }),
    prisma.productPrice.count({ where })
  ]);

  return c.json({
    data: rows,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit)
    }
  });
});

/**
 * GET /api/product-prices/current
 */
app.get('/current', async (c) => {
  const partner_short_name = c.req.query('partner_short_name');
  const product_model = c.req.query('product_model');
  const date = c.req.query('date');

  if (!partner_short_name || !product_model) {
    return c.json({ error: 'Missing required argument: partner_short_name & product_model' }, 400);
  }

  const targetDate = date || new Date().toISOString().split('T')[0];

  const row = await prisma.productPrice.findFirst({
    where: {
      partner_short_name,
      product_model,
      effective_date: { lte: targetDate }
    },
    orderBy: { effective_date: 'desc' }
  });

  if (!row) {
    return c.json({ error: 'No valid price found' }, 404);
  }

  return c.json({ data: row });
});

/**
 * POST /api/product-prices
 */
app.post('/', async (c) => {
  let body: any;
  try {
    body = await c.req.json();
  } catch {
    body = {};
  }
  const { partner_short_name, product_model, effective_date, unit_price } = body;

  const result = await prisma.productPrice.create({
    data: {
      partner_short_name,
      product_model,
      effective_date,
      unit_price
    }
  });
  return c.json({ id: result.id, message: 'Product price created!' });
});

/**
 * PUT /api/product-prices/:id
 */
app.put('/:id', async (c) => {
  const id = Number(c.req.param('id'));
  let body: any;
  try {
    body = await c.req.json();
  } catch {
    body = {};
  }
  const { partner_short_name, product_model, effective_date, unit_price } = body;

  await prisma.productPrice.update({
    where: { id },
    data: {
      partner_short_name,
      product_model,
      effective_date,
      unit_price
    }
  });
  return c.json({ message: 'Product price updated!' });
});

/**
 * DELETE /api/product-prices/:id
 */
app.delete('/:id', async (c) => {
  const id = Number(c.req.param('id'));
  await prisma.productPrice.delete({
    where: { id }
  });
  return c.json({ message: 'Product price delete!' });
});

/**
 * GET /api/product-prices/auto
 * Automatically get product prices
 */
app.get('/auto', async (c) => {
  const partner_short_name = c.req.query('partner_short_name');
  const product_model = c.req.query('product_model');
  const date = c.req.query('date');

  if (!partner_short_name || !product_model || !date) {
    return c.json(
      { error: 'Missing required argument: partner_short_name, product_model, date' },
      400
    );
  }

  const row = await prisma.productPrice.findFirst({
    where: {
      partner_short_name,
      product_model,
      effective_date: { lte: date }
    },
    orderBy: { effective_date: 'desc' },
    select: { unit_price: true }
  });

  if (!row) {
    return c.json({ error: 'No valid price found' }, 404);
  }

  return c.json({ unit_price: row.unit_price });
});

export default app;
