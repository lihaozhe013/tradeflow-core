import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '@/prismaClient';
import type { Prisma } from '@/prisma/client';
import { authorize } from '@/utils/auth';
import { parseSetting, sections, exportCatalog } from '@/settings/schema';
import { readRuntimeSettings } from '@/settings/service';

const router = Router();
router.get('/runtime', async (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json(await readRuntimeSettings());
});
router.use(authorize(['superuser']));
router.get('/', async (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({
    data: await prisma.systemSetting.findMany({ orderBy: { section: 'asc' } }),
    catalog: exportCatalog
  });
});
router.put('/:section', async (req, res) => {
  const sectionResult = z.enum(sections).safeParse(req.params['section']);
  const bodyResult = z
    .strictObject({ value: z.unknown(), version: z.number().int().positive() })
    .safeParse(req.body);
  if (!sectionResult.success || !bodyResult.success) {
    res.status(400).json({ message: 'Invalid settings request.' });
    return;
  }
  const section = sectionResult.data;
  let value;
  try {
    value = parseSetting(section, bodyResult.data.value);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ message: 'Invalid settings.', issues: error.issues });
      return;
    }
    throw error;
  }
  if (section === 'about') value = { ...value, lastUpdated: new Date().toISOString() };
  const result = await prisma.$transaction(async (db) => {
    const old = await db.systemSetting.findUniqueOrThrow({ where: { section } });
    const updated = await db.systemSetting.updateMany({
      where: { section, version: bodyResult.data.version },
      data: {
        value: value as Prisma.InputJsonValue,
        version: { increment: 1 },
        updatedAt: new Date(),
        updatedBy: req.user!.username
      }
    });
    if (updated.count !== 1) return null;
    const before = old.value as Record<string, unknown>;
    const fields = Object.keys(value).filter(
      (key) =>
        JSON.stringify(before[key]) !== JSON.stringify((value as Record<string, unknown>)[key])
    );
    await db.systemLog.create({
      data: {
        username: req.user!.username,
        action: 'UPDATE',
        resource: `/api/settings/${section}`,
        params: JSON.stringify({ section, fields, version: bodyResult.data.version + 1 })
      }
    });
    return db.systemSetting.findUniqueOrThrow({ where: { section } });
  });
  if (!result) {
    res
      .status(409)
      .json({ message: 'Settings changed. Reload the current version before saving.' });
    return;
  }
  res.json({ data: result });
});
export default router;
