import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { prisma } from '@/prismaClient';
import type { Prisma, SystemSetting } from '@/prisma/client';
import { config } from '@/utils/paths';
import { assertTestDatabaseConfig } from '@/test/testDatabaseSafety';
import { createPoolConfig, validateDatabaseConfig } from '@/utils/databaseConnection';
import { DEFAULT_SETTINGS } from '@/settings/defaults';
import { convertLegacy, generateImportSql } from '@/settings/legacy';
import { sections } from '@/settings/schema';

let snapshot: SystemSetting[];
beforeEach(async () => {
  snapshot = await prisma.systemSetting.findMany();
});
afterEach(async () => {
  await prisma.systemSetting.deleteMany();
  await prisma.systemSetting.createMany({
    data: snapshot.map((row) => ({ ...row, value: row.value as Prisma.InputJsonValue }))
  });
});
function legacyFixture() {
  const payments = DEFAULT_SETTINGS['payment-methods'];
  return convertLegacy(
    {
      currency_unit_symbol: 'EUR',
      paymentMethods: {
        list: payments.items.map((item) => item.label),
        default: payments.items.find((item) => item.code === payments.defaultCode)!.label,
        config: Object.fromEntries(
          payments.items.map(({ key, code, label }) => [key, { code, label }])
        )
      },
      productCategories: DEFAULT_SETTINGS['product-categories']
    },
    {
      ...DEFAULT_SETTINGS.about,
      company: {
        ...DEFAULT_SETTINGS.about.company,
        name: "O'Brien \\ $import_settings$\nCompany \u4e2d\u6587"
      }
    },
    DEFAULT_SETTINGS['export-templates']
  );
}
async function executeSql(sql: string) {
  assertTestDatabaseConfig();
  const database = validateDatabaseConfig(config.database ?? {});
  const pool = new Pool(createPoolConfig(database, database.dbName, 1));
  try {
    await pool.query(sql.replace(/^\\set ON_ERROR_STOP on\n/, ''));
  } finally {
    await pool.end();
  }
}
describe('Legacy settings import SQL', () => {
  it('imports all sections, preserves values and is idempotent', async () => {
    const values = legacyFixture();
    await prisma.systemSetting.deleteMany();
    const sql = generateImportSql(values);
    expect(sql).not.toContain("O'Brien");
    await executeSql(sql);
    const first = await prisma.systemSetting.findMany({ orderBy: { section: 'asc' } });
    for (const section of sections)
      expect(first.find((row) => row.section === section)?.value).toEqual(values[section]);
    await executeSql(sql);
    expect(await prisma.systemSetting.findMany({ orderBy: { section: 'asc' } })).toEqual(first);
  });
  it('rolls back the whole transaction on conflicting settings and only replaces explicitly', async () => {
    const values = legacyFixture();
    await prisma.systemSetting.deleteMany({ where: { section: 'general' } });
    const before = await prisma.systemSetting.findMany({ orderBy: { section: 'asc' } });
    await expect(executeSql(generateImportSql(values))).rejects.toThrow('Existing settings differ');
    expect(await prisma.systemSetting.findMany({ orderBy: { section: 'asc' } })).toEqual(before);
    await executeSql(generateImportSql(values, true));
    const row = await prisma.systemSetting.findUniqueOrThrow({ where: { section: 'general' } });
    expect(row.value).toEqual(values.general);
    expect(row.version).toBe(1);
    const about = await prisma.systemSetting.findUniqueOrThrow({ where: { section: 'about' } });
    expect(about.version).toBe(before.find((row) => row.section === 'about')!.version + 1);
  });
  it('rejects ambiguous payment mappings rather than discarding entries', () => {
    expect(() =>
      convertLegacy(
        {
          currency_unit_symbol: '$',
          paymentMethods: { list: ['Cash'], default: 'Cash', config: {} },
          productCategories: DEFAULT_SETTINGS['product-categories']
        },
        DEFAULT_SETTINGS.about,
        DEFAULT_SETTINGS['export-templates']
      )
    ).toThrow();
  });
});
