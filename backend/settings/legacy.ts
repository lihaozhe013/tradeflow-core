import { z } from 'zod';
import { parseSetting, sections, type SettingValues } from './schema';

export function convertLegacy(frontend: unknown, about: unknown, exports: unknown): SettingValues {
  const input = z
    .object({
      currency_unit_symbol: z.string(),
      paymentMethods: z.object({
        list: z.array(z.string()),
        default: z.string(),
        config: z.record(z.string(), z.object({ code: z.string(), label: z.string() }))
      }),
      productCategories: z.unknown()
    })
    .parse(frontend);
  const methods = input.paymentMethods;
  const items = methods.list.map((label) => {
    const matches = Object.entries(methods.config).filter(([, item]) => item.label === label);
    if (matches.length !== 1)
      throw new Error('Each legacy payment label must match exactly one configuration entry.');
    const [key, item] = matches[0]!;
    return { key, ...item };
  });
  if (items.length !== Object.keys(methods.config).length)
    throw new Error('Legacy payment configuration contains unlisted entries.');
  return {
    general: parseSetting('general', { currency_unit_symbol: input.currency_unit_symbol }),
    'payment-methods': parseSetting('payment-methods', {
      items,
      defaultCode: items.find((item) => item.label === methods.default)?.code
    }),
    'product-categories': parseSetting('product-categories', input.productCategories),
    about: parseSetting('about', about),
    'export-templates': parseSetting('export-templates', exports)
  };
}
export const settingsTableSql = `CREATE TABLE IF NOT EXISTS public.system_settings (
  section TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by TEXT
);`;
function sqlString(value: string): string {
  // Hex encoding keeps arbitrary user text outside SQL and psql command syntax.
  return `convert_from(decode('${Buffer.from(value, 'utf8').toString('hex')}', 'hex'), 'UTF8')`;
}
export function generateImportSql(values: SettingValues, replaceExisting = false): string {
  return `\\set ON_ERROR_STOP on
BEGIN;
SELECT pg_advisory_xact_lock(hashtext('tradeflow-core:schema-bootstrap:public'));
${settingsTableSql}
LOCK TABLE public.system_settings IN EXCLUSIVE MODE;
${sections
  .map((section) => {
    const payload = `${sqlString(JSON.stringify(parseSetting(section, values[section])))}::jsonb`;
    return `DO $import_settings$
DECLARE incoming JSONB := ${payload};
BEGIN
  IF EXISTS (SELECT 1 FROM public.system_settings WHERE section = '${section}' AND value IS DISTINCT FROM incoming) THEN
    ${replaceExisting ? `UPDATE public.system_settings SET value = incoming, version = version + 1, updated_at = CURRENT_TIMESTAMP, updated_by = 'legacy-import' WHERE section = '${section}';` : `RAISE EXCEPTION 'Existing settings differ for ${section}; generate SQL with --replace-existing to replace them.';`}
  ELSE
    INSERT INTO public.system_settings(section, value, updated_by) VALUES ('${section}', incoming, 'legacy-import') ON CONFLICT (section) DO NOTHING;
  END IF;
END
$import_settings$;`;
  })
  .join('\n')}
COMMIT;
SELECT section, version, updated_at, updated_by FROM public.system_settings ORDER BY section;
`;
}
