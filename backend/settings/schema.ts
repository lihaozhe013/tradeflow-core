import { z } from 'zod';
import { DEFAULT_SETTINGS } from './defaults';

export const sections = [
  'general',
  'payment-methods',
  'product-categories',
  'about',
  'export-templates'
] as const;
export type SettingSection = (typeof sections)[number];
const text = (max = 100) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine((v) => !v.includes('\0'), 'Null characters are not allowed.');
const optionalText = (max = 500) =>
  z
    .string()
    .max(max)
    .refine((v) => !v.includes('\0'), 'Null characters are not allowed.');
const unique = (values: string[]) => new Set(values).size === values.length;
const paymentSchema = z
  .strictObject({
    items: z
      .array(
        z.strictObject({
          key: text(64).regex(/^[a-z][a-z0-9_]*$/),
          code: text(64).regex(/^[A-Z][A-Z0-9_]*$/),
          label: text()
        })
      )
      .min(1)
      .max(100),
    defaultCode: text(64)
  })
  .refine(
    (v) =>
      ['key', 'code', 'label'].every((key) =>
        unique(v.items.map((item) => item[key as keyof typeof item]))
      ),
    'Payment identifiers and labels must be unique.'
  )
  .refine((v) => v.items.some((item) => item.code === v.defaultCode), {
    message: 'Select a current default payment method.',
    path: ['defaultCode']
  });
const categorySchema = z
  .strictObject({ list: z.array(text()).min(1).max(200), default: text() })
  .refine((v) => unique(v.list), 'Categories must be unique.')
  .refine((v) => v.list.includes(v.default), {
    message: 'Select a current default category.',
    path: ['default']
  });
const date = z.iso.date();
const aboutSchema = z.strictObject({
  title: text(200),
  company: z.strictObject({
    name: optionalText(200),
    description: optionalText(10000),
    slogan: optionalText()
  }),
  contact: z.strictObject({
    address: optionalText(1000),
    email: z.union([z.literal(''), z.email().max(254)]),
    phone: optionalText(100)
  }),
  system: z.strictObject({
    version: text(100),
    releaseDate: date,
    techStack: text(200),
    team: optionalText(200)
  }),
  lastUpdated: z.iso.datetime().optional()
});
export type ExportTemplateKey = keyof (typeof DEFAULT_SETTINGS)['export-templates'];
export const templateKeys = Object.keys(
  DEFAULT_SETTINGS['export-templates']
) as ExportTemplateKey[];
export interface ExportTemplate {
  sheetName: string;
  columns: { key: string; label: string; visible?: boolean }[];
  labels?: Record<string, string>;
}
export type ExportTemplates = Record<ExportTemplateKey, ExportTemplate>;
export const exportCatalog = Object.fromEntries(
  templateKeys.map((key) => {
    const template = DEFAULT_SETTINGS['export-templates'][key];
    const columns: string[] = template.columns.map((c) => c.key);
    if (['outbound', 'inbound_statement', 'outbound_statement'].includes(key))
      columns.push('receipt_number');
    return [key, { columns, labels: 'labels' in template ? Object.keys(template.labels) : [] }];
  })
) as Record<ExportTemplateKey, { columns: string[]; labels: string[] }>;
const templateSchema = z
  .strictObject({
    sheetName: text(31).refine(
      (v) => !/[[\]*?:/\\]/.test(v) && !v.startsWith("'") && !v.endsWith("'"),
      'Use a valid Excel sheet name.'
    ),
    columns: z
      .array(z.strictObject({ key: text(), label: text(200), visible: z.boolean().optional() }))
      .min(1)
      .max(100),
    labels: z.record(z.string(), text(1000)).optional()
  })
  .refine((v) => unique(v.columns.map((c) => c.key)), 'Column keys must be unique.')
  .refine((v) => v.columns.some((c) => c.visible !== false), {
    message: 'At least one column must be visible.',
    path: ['columns']
  });
const exportSchema = z
  .record(z.enum(templateKeys as [ExportTemplateKey, ...ExportTemplateKey[]]), templateSchema)
  .superRefine((templates, ctx) => {
    for (const key of templateKeys) {
      const template = templates[key];
      const catalog = exportCatalog[key];
      if (template.columns.some((c) => !catalog.columns.includes(c.key)))
        ctx.addIssue({
          code: 'custom',
          path: [key, 'columns'],
          message: 'Unsupported export column.'
        });
      if (
        Object.keys(template.labels ?? {}).some((label) => !catalog.labels.includes(label)) ||
        catalog.labels.some((label) => !template.labels?.[label])
      )
        ctx.addIssue({
          code: 'custom',
          path: [key, 'labels'],
          message: 'Supply all supported template labels.'
        });
    }
  });
export const settingSchemas = {
  general: z.strictObject({ currency_unit_symbol: text(10) }),
  'payment-methods': paymentSchema,
  'product-categories': categorySchema,
  about: aboutSchema,
  'export-templates': exportSchema
};
export type SettingValues = { [K in SettingSection]: z.infer<(typeof settingSchemas)[K]> };
export function parseSetting<K extends SettingSection>(
  section: K,
  value: unknown
): SettingValues[K] {
  return settingSchemas[section].parse(value) as SettingValues[K];
}
