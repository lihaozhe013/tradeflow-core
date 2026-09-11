import express, { type Router, type Request, type Response } from 'express';
import { prisma } from '@/prismaClient';

const router: Router = express.Router();

/**
 * GET /api/audit/logs
 * Query audit logs.
 * - superuser: can view all logs, supports username filter
 * - editor/reader: can only view own logs
 */
router.get('/logs', async (req: Request, res: Response): Promise<void> => {
  const { page, pageSize, startDate, endDate, username, resource, params } = req.query;

  const pageNum = Math.max(1, Number(page) || 1);
  const limit = Math.min(100, Math.max(1, Number(pageSize) || 20));
  const skip = (pageNum - 1) * limit;

  const where: Record<string, unknown> = {};

  const currentUser = req.user;
  const isSuperuser = currentUser?.role === 'superuser';

  if (isSuperuser && typeof username === 'string' && username.trim()) {
    where['username'] = username.trim();
  } else if (currentUser?.username) {
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

  res.json({
    success: true,
    data: {
      items,
      total,
      page: pageNum,
      pageSize: limit
    }
  });
});

export default router;
