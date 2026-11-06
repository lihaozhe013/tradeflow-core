import { Hono } from 'hono';
import { z } from 'zod';
import { prisma } from '@/prismaClient';
import type { Prisma } from '@/prisma/client';
import { authorize } from '@/utils/auth';
import { parseSetting, sections, exportCatalog } from '@/settings/schema';
import { readRuntimeSettings } from '@/settings/service';
import type { AppEnv } from '@/types/hono';

const app = new Hono<AppEnv>();

app.get('/runtime', async (c) => {
  c.header('Cache-Control', 'no-store');
  return c.json(await readRuntimeSettings());
});

app.use('*', authorize(['superuser']));

app.get('/', async (c) => {
  c.header('Cache-Control', 'no-store');
  return c.json({
    data: await prisma.systemSetting.findMany({ orderBy: { section: 'asc' } }),
    catalog: exportCatalog
  });
});

app.put('/:section', async (c) => {
  const sectionParam = c.req.param('section');
  const sectionResult = z.enum(sections).safeParse(sectionParam);
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ message: 'Invalid settings request.' }, 400);
  }

  const bodyResult = z
    .strictObject({ value: z.unknown(), version: z.number().int().positive() })
    .safeParse(body);
  if (!sectionResult.success || !bodyResult.success) {
    return c.json({ message: 'Invalid settings request.' }, 400);
  }
  const section = sectionResult.data;
  let value: unknown;
  try {
    value = parseSetting(section, bodyResult.data.value);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ message: 'Invalid settings.', issues: error.issues }, 400);
    }
    throw error;
  }
  if (section === 'about') {
    value = { ...(value as Record<string, unknown>), lastUpdated: new Date().toISOString() };
  }
  const user = c.get('user')!;
  const result = await prisma.$transaction(async (db) => {
    const old = await db.systemSetting.findUniqueOrThrow({ where: { section } });
    const updated = await db.systemSetting.updateMany({
      where: { section, version: bodyResult.data.version },
      data: {
        value: value as Prisma.InputJsonValue,
        version: { increment: 1 },
        updatedAt: new Date(),
        updatedBy: user.username
      }
    });
    if (updated.count !== 1) return null;
    const before = old.value as Record<string, unknown>;
    const fields = Object.keys(value as Record<string, unknown>).filter(
      (key) =>
        JSON.stringify(before[key]) !== JSON.stringify((value as Record<string, unknown>)[key])
    );
    await db.systemLog.create({
      data: {
        username: user.username,
        action: 'UPDATE',
        resource: `/api/settings/${section}`,
        params: JSON.stringify({ section, fields, version: bodyResult.data.version + 1 })
      }
    });
    return db.systemSetting.findUniqueOrThrow({ where: { section } });
  });
  if (!result) {
    return c.json({ message: 'Settings changed. Reload the current version before saving.' }, 409);
  }
  return c.json({ data: result });
});

export default app;
