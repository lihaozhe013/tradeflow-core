import { describe, it, expect, afterAll } from 'vitest';
import { prisma } from '@/prismaClient';
import { authAgent } from '@/test/helpers/request';
import { uniqueSuffix } from '@/test/helpers/assertXlsx';

const CREATED_SHORT_NAMES: string[] = [];

function suffix(): string {
  return uniqueSuffix();
}

afterAll(async () => {
  for (const shortName of CREATED_SHORT_NAMES) {
    await prisma.partner.delete({ where: { short_name: shortName } }).catch(() => undefined);
  }
});

describe('GET /api/partners', () => {
  it('returns all partners ordered by short_name when pagination is not used', async () => {
    const agent = await authAgent('reader');
    const res = await agent.get('/api/partners');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);
    const names = (res.body.data as { short_name: string }[]).map((p) => p.short_name);
    expect([...names].sort()).toEqual(names);
  });

  it('returns paginated results', async () => {
    const agent = await authAgent('reader');
    const res = await agent.get('/api/partners?page=2&limit=10');

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeLessThanOrEqual(10);
    expect(res.body.pagination).toMatchObject({ page: 2, limit: 10 });
    expect(res.body.pagination.total).toBeGreaterThan(0);
    expect(res.body.pagination.pages).toBeGreaterThanOrEqual(1);
  });

  it('filters by code, short_name and type', async () => {
    const agent = await authAgent('reader');

    const byCode = await agent.get('/api/partners?code=SUP0&page=1&limit=50');
    expect(byCode.status).toBe(200);
    for (const row of byCode.body.data as { code: string }[]) {
      expect(row.code).toContain('SUP0');
    }

    const byName = await agent.get('/api/partners?short_name=Supplier 7&page=1&limit=50');
    expect(byName.status).toBe(200);
    for (const row of byName.body.data as { short_name: string }[]) {
      expect(row.short_name).toContain('Supplier 7');
    }

    const suppliers = await agent.get('/api/partners?type=0&page=1&limit=50');
    expect(suppliers.status).toBe(200);
    for (const row of suppliers.body.data as { type: number }[]) {
      expect(row.type).toBe(0);
    }
  });

  it('clamps invalid page numbers to 1', async () => {
    const agent = await authAgent('reader');
    const res = await agent.get('/api/partners?page=0&limit=10');
    expect(res.status).toBe(200);
    expect(res.body.pagination.page).toBe(1);

    const res2 = await agent.get('/api/partners?page=abc&limit=10');
    expect(res2.status).toBe(200);
    expect(res2.body.pagination.page).toBe(1);
  });
});

describe('POST /api/partners', () => {
  it('creates a partner', async () => {
    const shortName = `New Partner ${suffix().slice(-6)}`;
    CREATED_SHORT_NAMES.push(shortName);

    const agent = await authAgent('editor');
    const res = await agent.post('/api/partners').send({
      code: `NP${suffix().slice(0, 8)}`,
      short_name: shortName,
      full_name: 'A New Partner Ltd',
      type: 1
    });

    expect(res.status).toBe(200);
    expect(res.body.short_name).toBe(shortName);

    const created = await prisma.partner.findUnique({ where: { short_name: shortName } });
    expect(created).not.toBeNull();
    expect(created?.type).toBe(1);
  });

  it('rejects a read-only user', async () => {
    const agent = await authAgent('reader');
    const res = await agent.post('/api/partners').send({
      code: `X${suffix()}`,
      short_name: `X ${suffix()}`
    });
    expect(res.status).toBe(403);
  });
});

describe('PUT /api/partners/:short_name', () => {
  it('updates a partner', async () => {
    const shortName = `UpdateTarget ${suffix().slice(-6)}`;
    CREATED_SHORT_NAMES.push(shortName);
    await prisma.partner.create({
      data: { code: `UP${suffix().slice(0, 8)}`, short_name: shortName, type: 1 }
    });

    const agent = await authAgent('editor');
    const res = await agent.put(`/api/partners/${shortName}`).send({
      full_name: 'Updated Full Name',
      contact_person: 'New Person'
    });

    expect(res.status).toBe(200);
    const updated = await prisma.partner.findUnique({ where: { short_name: shortName } });
    expect(updated?.full_name).toBe('Updated Full Name');
  });
});

describe('DELETE /api/partners/:short_name', () => {
  it('deletes a partner', async () => {
    const shortName = `DeleteTarget ${suffix().slice(-6)}`;
    await prisma.partner.create({
      data: { code: `DP${suffix().slice(0, 8)}`, short_name: shortName, type: 1 }
    });

    const agent = await authAgent('editor');
    const res = await agent.delete(`/api/partners/${shortName}`);
    expect(res.status).toBe(200);

    const remaining = await prisma.partner.findUnique({ where: { short_name: shortName } });
    expect(remaining).toBeNull();
  });
});

describe('POST /api/partners/bindings', () => {
  it('creates multiple partners in one batch', async () => {
    const tag = suffix().slice(-6);
    const short1 = `Bind A${tag}`;
    const short2 = `Bind B${tag}`;
    CREATED_SHORT_NAMES.push(short1, short2);

    const agent = await authAgent('editor');
    const res = await agent.post('/api/partners/bindings').send([
      { code: `BA${tag}`, short_name: short1, full_name: 'Binding One' },
      { code: `BB${tag}`, short_name: short2, full_name: 'Binding Two' }
    ]);

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Binded');
  });

  it('returns 400 when the batch is empty', async () => {
    const agent = await authAgent('editor');
    const res = await agent.post('/api/partners/bindings').send([]);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('No binding data');
  });

  it('returns 400 when fields are missing', async () => {
    const agent = await authAgent('editor');
    const res = await agent.post('/api/partners/bindings').send([{ code: 'X1', short_name: 'X1' }]);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('None of the three can be empty');
  });

  it('returns 400 on duplicated batch data', async () => {
    const agent = await authAgent('editor');
    const res = await agent.post('/api/partners/bindings').send([
      { code: 'D1', short_name: 'Dup', full_name: 'Dup Co' },
      { code: 'D1', short_name: 'Dup2', full_name: 'Dup Co 2' }
    ]);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Duplicated batch data');
  });

  it('returns 400 when conflicting with existing data', async () => {
    const agent = await authAgent('editor');
    const res = await agent
      .post('/api/partners/bindings')
      .send([{ code: 'CONF123', short_name: 'Supplier 1', full_name: 'Conflict Ltd' }]);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Conflicts with existing data');
  });
});
