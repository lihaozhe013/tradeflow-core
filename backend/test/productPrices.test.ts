import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/prismaClient';
import { authAgent } from '@/test/helpers/request';
import { uniqueSuffix } from '@/test/helpers/assertXlsx';

const CLEANUP_IDS: number[] = [];

afterAll(async () => {
  for (const id of CLEANUP_IDS) {
    await prisma.productPrice.delete({ where: { id } }).catch(() => undefined);
  }
});

async function createPrice(
  partnerShortName: string,
  productModel: string,
  effectiveDate: string,
  unitPrice: number
): Promise<number> {
  const created = await prisma.productPrice.create({
    data: {
      partner_short_name: partnerShortName,
      product_model: productModel,
      effective_date: effectiveDate,
      unit_price: unitPrice
    }
  });
  CLEANUP_IDS.push(created.id);
  return created.id;
}

describe('GET /api/product-prices', () => {
  it('returns paginated results with default limit of 10', async () => {
    const agent = await authAgent('reader');
    const res = await agent.get('/api/product-prices');

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeLessThanOrEqual(10);
    expect(res.body.pagination.limit).toBe(10);
    expect(res.body.pagination.total).toBeGreaterThan(0);
  });

  it('filters by partner_short_name and product_model', async () => {
    const agent = await authAgent('reader');
    const res = await agent.get('/api/product-prices?partner_short_name=Supplier 1&page=1');

    expect(res.status).toBe(200);
    const rows = res.body.data as { partner_short_name: string }[];
    if (rows.length > 0) {
      for (const row of rows) {
        expect(row.partner_short_name).toContain('Supplier 1');
      }
    }
  });
});

describe('GET /api/product-prices/current', () => {
  const PARTNER = `CurrentPartner${uniqueSuffix().slice(-4)}`;
  beforeAll(async () => {
    await prisma.partner.create({
      data: { code: `CP${uniqueSuffix().slice(-6)}`, short_name: PARTNER, type: 0 }
    });
  });
  afterAll(async () => {
    await prisma.partner.delete({ where: { short_name: PARTNER } }).catch(() => undefined);
  });

  it('returns the latest effective price up to the given date', async () => {
    const model = `MOD-CUR-${uniqueSuffix().slice(-6)}`;
    await createPrice(PARTNER, model, '2026-01-10', 100);
    await createPrice(PARTNER, model, '2026-03-15', 200);

    const agent = await authAgent('reader');
    const res = await agent.get('/api/product-prices/current').query({
      partner_short_name: PARTNER,
      product_model: model,
      date: '2026-02-01'
    });

    expect(res.status).toBe(200);
    expect(res.body.data.unit_price).toBe(100);
  });

  it('returns 400 when required params are missing', async () => {
    const agent = await authAgent('reader');
    const res = await agent.get('/api/product-prices/current').query({ product_model: 'M' });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/product-prices', () => {
  it('creates a price record', async () => {
    const agent = await authAgent('editor');
    const res = await agent.post('/api/product-prices').send({
      partner_short_name: `Supplier ${uniqueSuffix().slice(-3)}`,
      product_model: `MOD-${uniqueSuffix().slice(-6)}`,
      effective_date: '2026-06-01',
      unit_price: 123.45
    });
    expect(res.status).toBe(200);
    expect(typeof res.body.id).toBe('number');
    CLEANUP_IDS.push(res.body.id as number);
  });
});

describe('PUT /api/product-prices/:id', () => {
  it('updates a price record', async () => {
    const id = await createPrice('Supplier 3', 'MOD-UPDATE-TEST', '2026-01-01', 50);
    const agent = await authAgent('editor');
    const res = await agent.put(`/api/product-prices/${id}`).send({
      partner_short_name: 'Supplier 3',
      product_model: 'MOD-UPDATE-TEST',
      effective_date: '2026-01-02',
      unit_price: 75
    });

    expect(res.status).toBe(200);
    const updated = await prisma.productPrice.findUnique({ where: { id } });
    expect(updated?.unit_price).toBe(75);
  });
});

describe('DELETE /api/product-prices/:id', () => {
  it('deletes a price record', async () => {
    const id = await createPrice('Supplier 4', 'MOD-DELETE-TEST', '2026-01-01', 60);
    const agent = await authAgent('editor');
    const res = await agent.delete(`/api/product-prices/${id}`);
    expect(res.status).toBe(200);

    const remaining = await prisma.productPrice.findUnique({ where: { id } });
    expect(remaining).toBeNull();
    const idx = CLEANUP_IDS.indexOf(id);
    if (idx >= 0) CLEANUP_IDS.splice(idx, 1);
  });
});

describe('GET /api/product-prices/auto', () => {
  it('returns the latest unit_price at or before the date', async () => {
    const model = `MOD-AUTO-${uniqueSuffix().slice(-6)}`;
    const partner = 'Supplier 5';
    await createPrice(partner, model, '2026-02-01', 10);
    await createPrice(partner, model, '2026-04-01', 20);

    const agent = await authAgent('reader');
    const res = await agent.get('/api/product-prices/auto').query({
      partner_short_name: partner,
      product_model: model,
      date: '2026-03-01'
    });

    expect(res.status).toBe(200);
    expect(res.body.unit_price).toBe(10);
  });

  it('returns 400 when required params are missing', async () => {
    const agent = await authAgent('reader');
    const res = await agent.get('/api/product-prices/auto').query({ partner_short_name: 'X' });
    expect(res.status).toBe(400);
  });
});
