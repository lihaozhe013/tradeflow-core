import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/prismaClient';
import { authAgent, getApp } from '@/test/helpers/request';

async function deleteSnapshot(): Promise<void> {
  await prisma.overviewSnapshot.deleteMany();
}

let knownProductModel = '';

beforeAll(async () => {
  getApp();
  const product = await prisma.product.findFirst({ select: { product_model: true } });
  if (!product?.product_model) throw new Error('No seeded product model');
  knownProductModel = product.product_model;
});

afterAll(async () => {
  await deleteSnapshot();
});

describe('GET/POST /api/overview/stats', () => {
  it('returns 503 when the snapshot does not exist', async () => {
    await deleteSnapshot();
    const agent = await authAgent('editor');
    const res = await agent.get('/api/overview/stats');
    expect(res.status).toBe(503);
  });

  it('refreshes stats and writes the snapshot', async () => {
    const agent = await authAgent('editor');
    const res = await agent.post('/api/overview/stats');

    expect(res.status).toBe(200);
    expect(res.body.overview).toBeDefined();
    expect(typeof res.body.overview.total_inbound).toBe('number');
    expect(res.body.overview.total_inbound).toBeGreaterThan(0);
    expect(typeof res.body.overview.total_outbound).toBe('number');
    expect(typeof res.body.overview.total_sales_amount).toBe('number');
    expect(typeof res.body.overview.total_purchase_amount).toBe('number');
    expect(Array.isArray(res.body.out_of_inventory_products)).toBe(true);
    expect(Array.isArray(res.body.top_sales_products)).toBe(true);
    expect(res.body.top_sales_products.length).toBeGreaterThan(0);
    expect(await prisma.overviewSnapshot.count()).toBe(1);
    expect(res.body.last_updated).toBeDefined();
  });

  it('reads stats from the database afterwards', async () => {
    const agent = await authAgent('editor');
    const res = await agent.get('/api/overview/stats');
    expect(res.status).toBe(200);
    expect(res.body.overview).toBeDefined();
  });
});

describe('GET /api/overview/top-sales-products', () => {
  it('returns top sales products after refresh', async () => {
    const agent = await authAgent('editor');
    const res = await agent.get('/api/overview/top-sales-products');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    const first = res.body.data[0] as { product_model: string; total_sales: number };
    expect(typeof first.product_model).toBe('string');
    expect(typeof first.total_sales).toBe('number');
  });

  it('returns 503 when snapshot is missing', async () => {
    await deleteSnapshot();
    const agent = await authAgent('editor');
    const res = await agent.get('/api/overview/top-sales-products');
    expect(res.status).toBe(503);
  });
});

describe('GET /api/overview/monthly-inventory-change/:productModel', () => {
  it('returns monthly change data for a known product', async () => {
    await deleteSnapshot();
    const editor = await authAgent('editor');
    await editor.post('/api/overview/stats');

    const agent = await authAgent('editor');
    const res = await agent.get(`/api/overview/monthly-inventory-change/${knownProductModel}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.product_model).toBe(knownProductModel);
    expect(res.body.data.current_inventory).toBeDefined();
  });

  it('returns 503 when snapshot is missing', async () => {
    await deleteSnapshot();
    const agent = await authAgent('editor');
    const res = await agent.get(`/api/overview/monthly-inventory-change/${knownProductModel}`);
    expect(res.status).toBe(503);
  });
});
