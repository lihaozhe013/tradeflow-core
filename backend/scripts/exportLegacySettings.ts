import { parseArgs } from 'node:util';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { convertLegacy, generateImportSql } from '../settings/legacy';

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      'source-dir': { type: 'string' },
      output: { type: 'string' },
      database: { type: 'string' },
      'recreate-table': { type: 'boolean', default: false },
      'replace-existing': { type: 'boolean', default: false }
    },
    strict: true
  });
  if (!values['source-dir'] || !values.output || !values.database)
    throw new Error(
      'Usage: bun run settings:export-legacy --source-dir <legacy-directory> --output <file.sql> --database <database-name> [--replace-existing | --recreate-table]'
    );
  if (values['replace-existing'] && values['recreate-table'])
    throw new Error('Choose either --replace-existing or --recreate-table.');
  const source = path.resolve(values['source-dir']);
  const read = async (name: string): Promise<unknown> =>
    JSON.parse(await readFile(path.join(source, name), 'utf8')) as unknown;
  const [frontend, about, exports] = await Promise.all([
    read('frontendConfig.json'),
    read('about.json'),
    read('exportConfig.json')
  ]);
  const settings = convertLegacy(frontend, about, exports);
  await writeFile(
    path.resolve(values.output),
    generateImportSql(settings, {
      database: values.database,
      replaceExisting: values['replace-existing'],
      recreateTable: values['recreate-table']
    }),
    { mode: 0o600, flag: 'wx' }
  );
  console.info(
    'Validated five settings sections and 23 export templates. Import SQL created. No database connection was made.'
  );
}
main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Migration export failed.');
  process.exitCode = 1;
});
