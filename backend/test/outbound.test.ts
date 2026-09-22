import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/prismaClient';
import { authAgent, publicAgent } from '@/test/helpers/request';
import { uniqueSuffix } from '@/test/helpers/assertXlsx';

let customerCode = '';
let freshProductCode = '';
let freshProductModel = '';
let createdOutboundId = -1;
let keywordTag = '';
let keywordProductCode = '';
let keywordProductModel = '';
let keywordFixtureId = -1;

beforeAll(async () => {
  const customer = await prisma.partner.findFirst({
    where: { type: 1 },
    select: { code: true }
  });
  if (!customer) throw new Error('No seeded customer');
  customerCode = customer.code;

  const tag = uniqueSuffix().slice(-6);
  freshProductCode = `PRD-OUT-${tag}`;
  freshProductModel = `MOD-OUT-${tag}`;
  await prisma.product.create({
    data: { code: freshProductCode, product_model: freshProductModel }
  });

  keywordTag = `KW${uniqueSuffix().slice(-6)}`;
  keywordProductCode = `PRD-KW-${keywordTag}`;
  keywordProductModel = `MOD-KW-${keywordTag}`;
  await prisma.product.create({
    data: { code: keywordProductCode, product_model: keywordProductModel }
  });
  const keywordFixture = await prisma.outboundRecord.create({
    data: {
      customer_code: customerCode,
      product_code: keywordProductCode,
      quantity: 1,
      unit_price: 1,
      total_price: 1,
      outbound_date: '2026-09-10',
      order_number: `${keywordTag}-ORD`,
      invoice_number: `${keywordTag}-INV`,
      receipt_number: `${keywordTag}-RCPT`
    }
  });
  keywordFixtureId = keywordFixture.id;
});

afterAll(async () => {
  if (createdOutboundId >= 0) {
    await prisma.outboundRecord.delete({ where: { id: createdOutboundId } }).catch(() => undefined);
  }
  if (keywordFixtureId >= 0) {
    await prisma.outboundRecord.delete({ where: { id: keywordFixtureId } }).catch(() => undefined);
  }
  await prisma.inventory
    .delete({ where: { product_model: freshProductModel } })
    .catch(() => undefined);
  await prisma.inventoryLedger
    .deleteMany({ where: { product_model: freshProductModel } })
    .catch(() => undefined);
  await prisma.product.delete({ where: { code: freshProductCode } }).catch(() => undefined);
  await prisma.inventory
    .delete({ where: { product_model: keywordProductModel } })
    .catch(() => undefined);
  await prisma.inventoryLedger
    .deleteMany({ where: { product_model: keywordProductModel } })
    .catch(() => undefined);
  await prisma.product.delete({ where: { code: keywordProductCode } }).catch(() => undefined);
});

describe('GET /api/outbound', () => {
  it('returns paginated outbound records including product_model', async () => {
    const agent = await authAgent('reader');
    const res = await agent.get('/api/outbound?page=1');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.pagination.total).toBeGreaterThan(0);
    expect(res.body.data[0]).toHaveProperty('product_model');
    expect(res.body.data[0]).toHaveProperty('customer_code');
  });

  it('filters by customer_short_name and date range', async () => {
    const agent = await authAgent('reader');
    const byCustomer = await agent.get(
      '/api/outbound?customer_short_name=Customer 2&page=1&limit=20'
    );
    expect(byCustomer.status).toBe(200);
    for (const row of byCustomer.body.data as { partner: { short_name: string } }[]) {
      expect(row.partner.short_name).toContain('Customer 2');
    }

    const byDate = await agent.get(
      '/api/outbound?start_date=2025-01-01&end_date=2025-06-30&page=1&limit=20'
    );
    expect(byDate.status).toBe(200);
    for (const row of byDate.body.data as { outbound_date: string | null }[]) {
      if (row.outbound_date) {
        expect(row.outbound_date >= '2025-01-01').toBe(true);
        expect(row.outbound_date <= '2025-06-30').toBe(true);
      }
    }
  });

  it('supports sorting by total_price desc', async () => {
    const agent = await authAgent('reader');
    const res = await agent.get(
      '/api/outbound?sort_field=total_price&sort_order=desc&page=1&limit=20'
    );
    expect(res.status).toBe(200);
    const prices = (res.body.data as { total_price: number | null }[]).map(
      (r) => r.total_price ?? 0
    );
    const sorted = [...prices].sort((a, b) => b - a);
    expect(prices).toEqual(sorted);
  });

  it('matches keyword across order, invoice, and receipt numbers case-insensitively', async () => {
    const agent = await authAgent('reader');
    const res = await agent.get(
      `/api/outbound?keyword=${keywordTag.toLowerCase()}&page=1&limit=20`
    );
    expect(res.status).toBe(200);
    const rows = res.body.data as { id: number }[];
    expect(rows.some((row) => row.id === keywordFixtureId)).toBe(true);
  });

  it('matches keyword inside invoice_number and order_number separately', async () => {
    const agent = await authAgent('reader');
    const byInvoice = await agent.get(`/api/outbound?keyword=${keywordTag}-INV&page=1&limit=20`);
    expect(byInvoice.status).toBe(200);
    expect((byInvoice.body.data as { id: number }[]).map((row) => row.id)).toEqual([
      keywordFixtureId
    ]);

    const byOrder = await agent.get(`/api/outbound?keyword=${keywordTag}-ORD&page=1&limit=20`);
    expect(byOrder.status).toBe(200);
    expect((byOrder.body.data as { id: number }[]).map((row) => row.id)).toEqual([
      keywordFixtureId
    ]);

    const byReceipt = await agent.get(`/api/outbound?keyword=${keywordTag}-RCPT&page=1&limit=20`);
    expect(byReceipt.status).toBe(200);
    expect((byReceipt.body.data as { id: number }[]).map((row) => row.id)).toEqual([
      keywordFixtureId
    ]);
  });

  it('ignores whitespace-only keyword', async () => {
    const agent = await authAgent('reader');
    const res = await agent.get('/api/outbound?keyword=%20%20&page=1');
    expect(res.status).toBe(200);
    expect(res.body.pagination.total).toBeGreaterThan(0);
  });

  it('filters by exact number fields with AND semantics', async () => {
    const agent = await authAgent('reader');
    const matching = await agent.get(
      `/api/outbound?order_number=${keywordTag}-ORD&page=1&limit=20`
    );
    expect(matching.status).toBe(200);
    expect((matching.body.data as { id: number }[]).map((row) => row.id)).toEqual([
      keywordFixtureId
    ]);

    const conflicting = await agent.get(
      `/api/outbound?order_number=${keywordTag}-ORD&invoice_number=${keywordTag}-NOMATCH&page=1&limit=20`
    );
    expect(conflicting.status).toBe(200);
    expect(conflicting.body.data).toHaveLength(0);
  });

  it('combines keyword with date range', async () => {
    const agent = await authAgent('reader');
    const inRange = await agent.get(
      `/api/outbound?keyword=${keywordTag}&start_date=2026-01-01&end_date=2026-12-31&page=1&limit=20`
    );
    expect(inRange.status).toBe(200);
    expect((inRange.body.data as { id: number }[]).map((row) => row.id)).toEqual([
      keywordFixtureId
    ]);

    const outOfRange = await agent.get(
      `/api/outbound?keyword=${keywordTag}&start_date=2020-01-01&end_date=2020-12-31&page=1&limit=20`
    );
    expect(outOfRange.status).toBe(200);
    expect(outOfRange.body.data).toHaveLength(0);
  });
});

describe('Outbound lifecycle and inventory linkage', () => {
  it('creates an outbound record and decreases inventory', async () => {
    const agent = await authAgent('editor');
    const res = await agent.post('/api/outbound').send({
      customer_code: customerCode,
      product_code: freshProductCode,
      quantity: 5,
      unit_price: 10,
      outbound_date: '2026-09-01',
      invoice_number: `INV-OUT-${uniqueSuffix().slice(-6)}`
    });

    expect(res.status).toBe(200);
    createdOutboundId = res.body.id as number;

    const inv = await prisma.inventory.findUnique({
      where: { product_model: freshProductModel }
    });
    expect(inv?.quantity).toBe(-5);
  });

  it('rejects reader write operations', async () => {
    const agent = await authAgent('reader');
    const res = await agent.post('/api/outbound').send({
      customer_code: customerCode,
      product_code: freshProductCode,
      quantity: 1,
      unit_price: 1,
      outbound_date: '2026-09-01'
    });
    expect(res.status).toBe(403);
  });

  it('requires authentication', async () => {
    const res = await publicAgent().post('/api/outbound').send({
      customer_code: customerCode,
      product_code: freshProductCode,
      quantity: 1,
      unit_price: 1,
      outbound_date: '2026-09-01'
    });
    expect(res.status).toBe(401);
  });

  it('updates an outbound record and rebalances inventory', async () => {
    const agent = await authAgent('editor');
    const res = await agent.put(`/api/outbound/${createdOutboundId}`).send({
      customer_code: customerCode,
      product_code: freshProductCode,
      quantity: 2,
      unit_price: 10,
      outbound_date: '2026-09-02'
    });

    expect(res.status).toBe(200);
    const inv = await prisma.inventory.findUnique({
      where: { product_model: freshProductModel }
    });
    expect(inv?.quantity).toBe(-2);
  });

  it('deletes an outbound record and rolls back inventory', async () => {
    const agent = await authAgent('editor');
    const res = await agent.delete(`/api/outbound/${createdOutboundId}`);

    expect(res.status).toBe(200);
    const inv = await prisma.inventory.findUnique({
      where: { product_model: freshProductModel }
    });
    expect(inv?.quantity ?? 0).toBe(0);
  });
});

describe('POST /api/outbound/batch', () => {
  it('validates ids and updates payloads', async () => {
    const agent = await authAgent('editor');
    const missing = await agent.post('/api/outbound/batch').send({ updates: { remark: 'x' } });
    expect(missing.status).toBe(400);

    const badType = await agent.post('/api/outbound/batch').send({ ids: [1], updates: 'x' });
    expect(badType.status).toBe(400);

    const noFields = await agent
      .post('/api/outbound/batch')
      .send({ ids: [1], updates: { customer_code: '' } });
    expect(noFields.status).toBe(400);
  });

  it('updates multiple records and reports notFound ids', async () => {
    const two = await prisma.outboundRecord.findMany({ take: 2, select: { id: true } });
    expect(two.length).toBe(2);

    const agent = await authAgent('editor');
    const res = await agent.post('/api/outbound/batch').send({
      ids: [two[0]!.id, two[1]!.id, 999999],
      updates: { remark: 'batch updated' }
    });

    expect(res.status).toBe(200);
    expect(res.body.updated).toBe(2);
    expect(res.body.notFound).toEqual([999999]);
  });
});
