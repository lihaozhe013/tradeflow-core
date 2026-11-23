import { Hono } from 'hono';
import { prisma } from '@/prismaClient';
import type { AppEnv } from '@/types/hono';

const app = new Hono<AppEnv>();

/**
 * GET /api/audit/logs
 * Query audit logs.
 * - superuser: can view all logs, supports username filter
 * - editor/reader: can only view own logs
 */
app.get('/logs', async (c) => {
  const page = c.req.query('page');
  const pageSize = c.req.query('pageSize');
  const startDate = c.req.query('startDate');
  const endDate = c.req.query('endDate');
  const username = c.req.query('username');
  const resource = c.req.query('resource');
  const params = c.req.query('params');

  const pageNum = Math.max(1, Number(page) || 1);
  const limit = Math.min(100, Math.max(1, Number(pageSize) || 20));
  const skip = (pageNum - 1) * limit;

  const where: Record<string, unknown> = {};

  const currentUser = c.get('user');
  const isSuperuser = currentUser?.role === 'superuser';

  if (isSuperuser && typeof username === 'string' && username.trim()) {
    where['username'] = username.trim();
  } else if (!isSuperuser && currentUser?.username) {
    where['username'] = currentUser.username;
  }

  if (typeof startDate === 'string' || typeof endDate === 'string') {
    const createdAtFilter: Record<string, Date> = {};
    if (typeof startDate === 'string') {
      createdAtFilter['gte'] = new Date(startDate);
    }
    if (typeof endDate === 'string') {
      createdAtFilter['lte'] = new Date(endDate);
    }
    where['created_at'] = createdAtFilter;
  }

  if (typeof resource === 'string' && resource.trim()) {
    where['resource'] = { contains: resource.trim(), mode: 'insensitive' };
  }
  if (typeof params === 'string' && params.trim()) {
    where['params'] = { contains: params.trim(), mode: 'insensitive' };
  }

  const [items, total] = await Promise.all([
    prisma.systemLog.findMany({
      where,
      orderBy: { created_at: 'desc' },
      skip,
      take: limit
    }),
    prisma.systemLog.count({ where })
  ]);

  return c.json({
    success: true,
    data: {
      items,
      total,
      page: pageNum,
      pageSize: limit
    }
  });
});

export default app;
