import { Hono } from 'hono';
import { prisma } from '@/prismaClient';
import { pagination_limit } from '@/utils/paths';
import { searchPartners } from '@/services/readService';
import type { AppEnv } from '@/types/hono';

const app = new Hono<AppEnv>();

interface PartnerBinding {
  code: string;
  short_name: string;
  full_name: string;
}

/**
 * GET /api/partners
 */
app.get('/', async (c) => {
  const type = c.req.query('type');
  const short_name = c.req.query('short_name');
  const full_name = c.req.query('full_name');
  const code = c.req.query('code');
  const page = c.req.query('page');
  const limit = c.req.query('limit');

  const usePagination = page !== undefined || limit !== undefined;
  let pageNum = parseInt(page ?? '1', 10);
  if (!Number.isFinite(pageNum) || pageNum < 1) pageNum = 1;
  const limitNum = Number(limit) || pagination_limit;
  const result = await searchPartners(prisma, {
    type: type !== undefined ? parseInt(type, 10) : undefined,
    shortName: short_name,
    fullName: full_name,
    code: code,
    ...(usePagination ? { page: pageNum, limit: limitNum } : {})
  });

  if (!usePagination) {
    return c.json({ data: result.data });
  }

  return c.json({
    data: result.data,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total: 'total' in result ? result.total : 0,
      pages: 'pages' in result ? result.pages : 0
    }
  });
});

/**
 * POST /api/partners
 */
app.post('/', async (c) => {
  let body: any;
  try {
    body = await c.req.json();
  } catch {
    body = {};
  }
  const { code, short_name, full_name, address, contact_person, contact_phone, type } = body;

  await prisma.partner.create({
    data: {
      code,
      short_name,
      full_name,
      address,
      contact_person,
      contact_phone,
      type
    }
  });
  return c.json({ short_name, message: 'Customer/Supplier created!' });
});

/**
 * PUT /api/partners/:short_name
 */
app.put('/:short_name', async (c) => {
  const short_name = c.req.param('short_name');
  let body: any;
  try {
    body = await c.req.json();
  } catch {
    body = {};
  }
  const { code, full_name, address, contact_person, contact_phone, type } = body;

  await prisma.partner.update({
    where: { short_name },
    data: {
      code,
      full_name,
      address,
      contact_person,
      contact_phone,
      type
    }
  });

  return c.json({ message: 'Customer/Supplier updated!' });
});

/**
 * DELETE /api/partners/:short_name
 */
app.delete('/:short_name', async (c) => {
  const short_name = c.req.param('short_name');
  await prisma.partner.delete({
    where: { short_name }
  });
  return c.json({ message: 'Customer/Supplier deleted!' });
});

/**
 * POST /api/partners/bindings
 */
app.post('/bindings', async (c) => {
  let rawBody: any;
  try {
    rawBody = await c.req.json();
  } catch {
    rawBody = [];
  }
  const bindings: PartnerBinding[] = Array.isArray(rawBody) ? rawBody : [rawBody];

  if (!bindings.length) {
    return c.json({ error: 'No binding data' }, 400);
  }

  const codes = new Set<string>();
  const shorts = new Set<string>();
  const fulls = new Set<string>();

  for (const b of bindings) {
    if (!b.code || !b.short_name || !b.full_name) {
      return c.json({ error: 'None of the three can be empty' }, 400);
    }
    if (codes.has(b.code) || shorts.has(b.short_name) || fulls.has(b.full_name)) {
      return c.json({ error: 'Duplicated batch data' }, 400);
    }
    codes.add(b.code);
    shorts.add(b.short_name);
    fulls.add(b.full_name);
  }

  const bCodes = Array.from(codes);
  const bShorts = Array.from(shorts);
  const bFulls = Array.from(fulls);

  const conflicts = await prisma.partner.findMany({
    where: {
      OR: [{ code: { in: bCodes } }, { short_name: { in: bShorts } }, { full_name: { in: bFulls } }]
    },
    select: {
      code: true,
      short_name: true,
      full_name: true
    }
  });

  if (conflicts.length > 0) {
    return c.json({ error: 'Conflicts with existing data', conflicts }, 400);
  }

  await prisma.$transaction(
    bindings.map((b) =>
      prisma.partner.create({
        data: {
          code: b.code,
          short_name: b.short_name,
          full_name: b.full_name,
          type: 0
        }
      })
    )
  );

  return c.json({ message: 'Binded' });
});

export default app;
