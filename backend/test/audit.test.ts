import { describe, it, expect } from 'vitest';
import { prisma } from '@/prismaClient';
import { authAgent } from '@/test/helpers/request';
import { uniqueSuffix } from '@/test/helpers/assertXlsx';

const CRAFT_PARAMS = `audit-token-${uniqueSuffix()}`;

describe('GET /api/audit/logs', () => {
  it('lists logs for a superuser including all users', async () => {
    const agent = await authAgent('superuser');
    const res = await agent.get('/api/audit/logs?page=1&pageSize=20');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data.items)).toBe(true);
    expect(res.body.data.total).toBeGreaterThan(0);
    expect(res.body.data.page).toBe(1);
    expect(res.body.data.pageSize).toBe(20);
  });

  it('filters logs by username as a superuser', async () => {
    const agent = await authAgent('superuser');
    const res = await agent.get('/api/audit/logs?username=test_superuser');

    expect(res.status).toBe(200);
    for (const item of res.body.data.items as { username: string }[]) {
      expect(item.username).toBe('test_superuser');
    }
  });

  it('only shows own logs to an editor', async () => {
    const agent = await authAgent('editor');
    const res = await agent.get('/api/audit/logs?page=1&pageSize=50');

    expect(res.status).toBe(200);
    for (const item of res.body.data.items as { username: string }[]) {
      expect(item.username).toBe('test_editor');
    }
  });

  it('returns crafted logs when filtered by resource and params', async () => {
    const created = await prisma.systemLog.create({
      data: {
        username: 'test_editor',
        action: 'create',
        resource: 'inbound',
        params: CRAFT_PARAMS,
        user_agent: 'vitest'
      }
    });

    const agent = await authAgent('superuser');
    const res = await agent.get('/api/audit/logs?resource=inbound&params=audit-token-');

    expect(res.status).toBe(200);
    const found = (res.body.data.items as { id: number }[]).some((i) => i.id === created.id);
    expect(found).toBe(true);

    await prisma.systemLog.delete({ where: { id: created.id } });
  });

  it('applies pagination', async () => {
    const agent = await authAgent('superuser');
    const res = await agent.get('/api/audit/logs?page=1&pageSize=5');

    expect(res.status).toBe(200);
    expect(res.body.data.items.length).toBeLessThanOrEqual(5);
    expect(res.body.data.pageSize).toBe(5);
  });
});
