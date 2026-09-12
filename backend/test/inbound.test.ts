import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/prismaClient';
import { authAgent, publicAgent } from '@/test/helpers/request';
import { uniqueSuffix } from '@/test/helpers/assertXlsx';

let supplierCode = '';
let freshProductCode = '';
let freshProductModel = '';
let createdInboundId = -1;

beforeAll(async () => {
  const supplier = await prisma.partner.findFirst({
    where: { type: 0 },
    select: { code: true }
  });
  if (!supplier) throw new Error('No seeded supplier');
  supplierCode = supplier.code;

  const tag = uniqueSuffix().slice(-6);
  freshProductCode = `PRD-INV-${tag}`;
  freshProductModel = `MOD-INV-${tag}`;
  await prisma.product.create({
    data: { code: freshProductCode, product_model: freshProductModel }
  });
});

afterAll(async () => {
  if (createdInboundId >= 0) {
    await prisma.inboundRecord.delete({ where: { id: createdInboundId } }).catch(() => undefined);
  }
  await prisma.inventory
    .delete({ where: { product_model: freshProductModel } })
    .catch(() => undefined);
  await prisma.inventoryLedger
    .deleteMany({ where: { product_model: freshProductModel } })
    .catch(() => undefined);
  await prisma.product.delete({ where: { code: freshProductCode } }).catch(() => undefined);
});

describe('GET /api/inbound', () => {
  it('returns paginated inbound records including product_model', async () => {
    const agent = await authAgent('reader');
    const res = await agent.get('/api/inbound?page=1');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.pagination.total).toBeGreaterThan(0);
    expect(res.body.data[0]).toHaveProperty('product_model');
    expect(res.body.data[0]).toHaveProperty('supplier_code');
    expect(res.body.data[0]).toHaveProperty('total_price');
  });

  it('filters by supplier_short_name and product_model', async () => {
    const agent = await authAgent('reader');
    const bySupplier = await agent.get(
      '/api/inbound?supplier_short_name=Supplier 1&page=1&limit=20'
    );
    expect(bySupplier.status).toBe(200);
    for (const row of bySupplier.body.data as { partner: { short_name: string } }[]) {
      expect(row.partner.short_name).toContain('Supplier 1');
    }

    const byModel = await agent.get('/api/inbound?product_model=MOD-&page=1&limit=20');
    expect(byModel.status).toBe(200);
    for (const row of byModel.body.data as { product_model: string | null }[]) {
      if (row.product_model) expect(row.product_model).toContain('MOD-');
    }
  });

  it('filters by date range', async () => {
    const agent = await authAgent('reader');
    const res = await agent.get(
      '/api/inbound?start_date=2025-01-01&end_date=2025-12-31&page=1&limit=20'
    );
    expect(res.status).toBe(200);
    for (const row of res.body.data as { inbound_date: string | null }[]) {
      if (row.inbound_date) {
        expect(row.inbound_date >= '2025-01-01').toBe(true);
        expect(row.inbound_date <= '2025-12-31').toBe(true);
      }
    }
  });

  it('supports sorting by inbound_date asc', async () => {
    const agent = await authAgent('reader');
    const res = await agent.get(
      '/api/inbound?sort_field=inbound_date&sort_order=asc&page=1&limit=20'
    );
    expect(res.status).toBe(200);
    const dates = (res.body.data as { inbound_date: string | null }[])
      .map((r) => r.inbound_date ?? '')
      .filter((d) => d.length > 0);
    expect([...dates].sort()).toEqual(dates);
  });
});

describe('Inbound lifecycle and inventory linkage', () => {
  it('creates an inbound record and increases inventory', async () => {
    const agent = await authAgent('editor');
    const res = await agent.post('/api/inbound').send({
      supplier_code: supplierCode,
      product_code: freshProductCode,
      quantity: 5,
      unit_price: 10,
      inbound_date: '2026-09-01',
      invoice_number: `INV-TEST-${uniqueSuffix().slice(-6)}`,
      remark: 'inventory linkage test'
    });

    expect(res.status).toBe(200);
    createdInboundId = res.body.id as number;

    const inv = await prisma.inventory.findUnique({
      where: { product_model: freshProductModel }
    });
    expect(inv?.quantity).toBe(5);
  });

  it('creates no inventory entry for a reader (403 write)', async () => {
    const agent = await authAgent('reader');
    const res = await agent.post('/api/inbound').send({
      supplier_code: supplierCode,
      product_code: freshProductCode,
      quantity: 1,
      unit_price: 1,
      inbound_date: '2026-09-01'
    });
    expect(res.status).toBe(403);
  });

  it('rejects requests without authentication', async () => {
    const res = await publicAgent().post('/api/inbound').send({
      supplier_code: supplierCode,
      product_code: freshProductCode,
      quantity: 1,
      unit_price: 1,
      inbound_date: '2026-09-01'
    });
    expect(res.status).toBe(401);
  });

  it('updates an inbound record and rebalances inventory', async () => {
    const agent = await authAgent('editor');
    const res = await agent.put(`/api/inbound/${createdInboundId}`).send({
      supplier_code: supplierCode,
      product_code: freshProductCode,
      quantity: 8,
      unit_price: 12,
      inbound_date: '2026-09-02'
    });

    expect(res.status).toBe(200);
    const inv = await prisma.inventory.findUnique({
      where: { product_model: freshProductModel }
    });
    expect(inv?.quantity).toBe(8);
  });

  it('deletes an inbound record and rolls back inventory', async () => {
    const agent = await authAgent('editor');
    const res = await agent.delete(`/api/inbound/${createdInboundId}`);

    expect(res.status).toBe(200);
    const inv = await prisma.inventory.findUnique({
      where: { product_model: freshProductModel }
    });
    expect(inv?.quantity ?? 0).toBe(0);
  });
});

describe('POST /api/inbound/batch', () => {
  it('validates ids array', async () => {
    const agent = await authAgent('editor');
    const missing = await agent.post('/api/inbound/batch').send({ updates: { remark: 'x' } });
    expect(missing.status).toBe(400);

    const empty = await agent
      .post('/api/inbound/batch')
      .send({ ids: [], updates: { remark: 'x' } });
    expect(empty.status).toBe(400);
  });

  it('validates updates object', async () => {
    const agent = await authAgent('editor');
    const res = await agent.post('/api/inbound/batch').send({ ids: [1], updates: 'nope' });
    expect(res.status).toBe(400);
  });

  it('rejects payloads with no valid fields', async () => {
    const agent = await authAgent('editor');
    const res = await agent
      .post('/api/inbound/batch')
      .send({ ids: [1], updates: { supplier_code: '' } });
    expect(res.status).toBe(400);
  });

  it('updates multiple records and reports notFound for missing ids', async () => {
    const two = await prisma.inboundRecord.findMany({
      take: 2,
      select: { id: true }
    });
    expect(two.length).toBe(2);

    const agent = await authAgent('editor');
    const res = await agent.post('/api/inbound/batch').send({
      ids: [two[0]!.id, two[1]!.id, 999999],
      updates: { remark: 'batch updated' }
    });

    expect(res.status).toBe(200);
    expect(res.body.updated).toBe(2);
    expect(res.body.notFound).toEqual([999999]);
  });
});
