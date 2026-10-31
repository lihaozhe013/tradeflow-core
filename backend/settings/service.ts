import type { Prisma } from '@/prisma/client';
import { prisma } from '@/prismaClient';
import { DEFAULT_SETTINGS } from './defaults';
import { parseSetting, sections, type SettingSection, type ExportTemplates } from './schema';

export async function initializeSettings(): Promise<void> {
  await prisma.systemSetting.createMany({
    data: sections.map((section) => ({
      section,
      value: parseSetting(section, DEFAULT_SETTINGS[section]) as Prisma.InputJsonValue
    })),
    skipDuplicates: true
  });
  const exportSetting = await prisma.systemSetting.findUnique({
    where: { section: 'export-templates' }
  });
  if (exportSetting) {
    const value = exportSetting.value as Record<string, unknown>;
    const invoice = value?.['invoice'] as
      { columns: { key: string; label: string; visible?: boolean }[] } | undefined;
    if (invoice?.columns && !invoice.columns.some((c) => c.key === 'category')) {
      const modelIndex = invoice.columns.findIndex((c) => c.key === 'product_model');
      const insertIndex = modelIndex >= 0 ? modelIndex : 0;
      invoice.columns.splice(insertIndex, 0, { key: 'category', label: 'Category' });
      await prisma.systemSetting.update({
        where: { section: 'export-templates' },
        data: { value: value as Prisma.InputJsonValue }
      });
    }
  }
}
export async function readSetting<K extends SettingSection>(
  section: K,
  db: Pick<Prisma.TransactionClient, 'systemSetting'> = prisma
) {
  const row = await db.systemSetting.findUniqueOrThrow({ where: { section } });
  return parseSetting(section, row.value);
}
export async function readRuntimeSettings(
  db: Pick<Prisma.TransactionClient, 'systemSetting'> = prisma
) {
  const rows = await db.systemSetting.findMany({
    where: { section: { in: ['general', 'payment-methods', 'product-categories'] } }
  });
  const values = Object.fromEntries(rows.map((row) => [row.section, row.value]));
  const general = parseSetting('general', values['general']);
  const payments = parseSetting('payment-methods', values['payment-methods']);
  const categories = parseSetting('product-categories', values['product-categories']);
  return {
    ...general,
    paymentMethods: {
      list: payments.items.map((item) => item.label),
      default: payments.items.find((item) => item.code === payments.defaultCode)!.label
    },
    productCategories: categories
  };
}
export async function readExportTemplates(): Promise<ExportTemplates> {
  return readSetting('export-templates');
}
