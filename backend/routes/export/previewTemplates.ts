import type { ExportTemplate } from '@/settings/schema';

/** Template columns stay first; optional preview-only fields remain available but hidden. */
export function previewColumns(
  templates: ExportTemplate[],
  available: string[],
  aliases: Record<string, string> = {}
) {
  const columns: { key: string; label: string; visible: boolean; width: number }[] = [];
  const used = new Set<string>();
  for (const template of templates) {
    for (const column of template.columns) {
      const key = aliases[column.key] ?? column.key;
      if (used.has(key)) continue;
      used.add(key);
      columns.push({ key, label: column.label, visible: column.visible !== false, width: 18 });
    }
  }
  for (const key of available) {
    if (!used.has(key)) columns.push({ key, label: key, visible: false, width: 18 });
  }
  return columns;
}
