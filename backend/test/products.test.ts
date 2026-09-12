import { describe, it, expect, afterAll } from 'vitest';
import { prisma } from '@/prismaClient';
import { authAgent } from '@/test/helpers/request';
import { uniqueSuffix } from '@/test/helpers/assertXlsx';

const CREATED_CODES: string[] = [];

function uniqueCode(): string {
  const code = `TP${uniqueSuffix().slice(-8)}`;
  CREATED_CODES.push(code);
  return code;
}

afterAll(async () => {
  for (const code of CREATED_CODES) {
    await prisma.product.delete({ where: { code } }).catch(() => undefined);
  }
});

describe('GET /api/products', () => {
  it('returns all products ordered by code without pagination', async () => {
    const agent = await authAgent('reader');
    const res = await agent.get('/api/products');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);
    const codes = (res.body.data as { code: string }[]).map((p) => p.code);
    expect([...codes].sort()).toEqual(codes);
  });

  it('returns paginated results', async () => {
    const agent = await authAgent('reader');
    const res = await agent.get('/api/products?page=3&limit=15');

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeLessThanOrEqual(15);
    expect(res.body.pagination).toMatchObject({ page: 3, limit: 15 });
  });

  it('filters by category, product_model and code', async () => {
    const agent = await authAgent('reader');

    const byCategory = await agent.get('/api/products?category=Fasteners&page=1&limit=30');
    expect(byCategory.status).toBe(200);
    for (const row of byCategory.body.data as { category: string | null }[]) {
      expect(row.category).toContain('Fasteners');
    }
  });
});

describe('POST /api/products', () => {
  it('creates a product', async () => {
    const code = uniqueCode();
    const model = `MOD-TEST-${uniqueSuffix().slice(-6)}`;

    const agent = await authAgent('editor');
    const res = await agent.post('/api/products').send({
      code,
      category: 'Test Category',
      product_model: model,
      remark: 'created by test'
    });

    expect(res.status).toBe(200);
    const created = await prisma.product.findUnique({ where: { code } });
    expect(created?.product_model).toBe(model);
  });

  it('lets a reader search but not create', async () => {
    const agent = await authAgent('reader');
    const res = await agent.post('/api/products').send({ code: uniqueCode() });
    expect(res.status).toBe(403);
  });
});

describe('PUT /api/products/:code', () => {
  it('updates a product', async () => {
    const code = uniqueCode();
    await prisma.product.create({
      data: { code, product_model: `ORIG-${code}` }
    });

    const agent = await authAgent('editor');
    const res = await agent.put(`/api/products/${code}`).send({
      category: 'Updated Category',
      remark: 'updated by test'
    });

    expect(res.status).toBe(200);
    const updated = await prisma.product.findUnique({ where: { code } });
    expect(updated?.category).toBe('Updated Category');
  });
});

describe('DELETE /api/products/:code', () => {
  it('deletes a product', async () => {
    const code = uniqueCode();
    await prisma.product.create({ data: { code, product_model: `DEL-${code}` } });

    const agent = await authAgent('editor');
    const res = await agent.delete(`/api/products/${code}`);
    expect(res.status).toBe(200);

    const remaining = await prisma.product.findUnique({ where: { code } });
    expect(remaining).toBeNull();
  });
});

describe('POST /api/products/bindings', () => {
  it('creates multiple products in one batch', async () => {
    const tag = uniqueSuffix().slice(-6);
    const c1 = uniqueCode();
    const c2 = uniqueCode();

    const agent = await authAgent('editor');
    const res = await agent.post('/api/products/bindings').send([
      { code: c1, product_model: `BIND-MOD-${tag}-1` },
      { code: c2, product_model: `BIND-MOD-${tag}-2` }
    ]);

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Binded');
  });

  it('returns 400 when the batch is empty', async () => {
    const agent = await authAgent('editor');
    const res = await agent.post('/api/products/bindings').send([]);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('No data binded');
  });

  it('returns 400 when fields are missing', async () => {
    const agent = await authAgent('editor');
    const res = await agent.post('/api/products/bindings').send([{ code: 'ONLY' }]);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('The code and model cannot be left blank');
  });

  it('returns 400 on duplicated code inside the batch', async () => {
    const agent = await authAgent('editor');
    const res = await agent.post('/api/products/bindings').send([
      { code: 'DUP1', product_model: 'M1' },
      { code: 'DUP1', product_model: 'M2' }
    ]);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Duplicated data');
  });
});
