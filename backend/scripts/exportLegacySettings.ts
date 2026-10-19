import { parseArgs } from 'node:util';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { convertLegacy, generateImportSql } from '../settings/legacy';

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      'source-dir': { type: 'string' },
      output: { type: 'string' },
      'replace-existing': { type: 'boolean', default: false }
    },
    strict: true
  });
  if (!values['source-dir'] || !values.output)
    throw new Error(
      'Usage: bun run settings:export-legacy --source-dir <legacy-directory> --output <file.sql> [--replace-existing]'
    );
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
    generateImportSql(settings, values['replace-existing']),
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
