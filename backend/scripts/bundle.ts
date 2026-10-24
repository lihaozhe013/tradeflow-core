/// <reference types="bun" />
/**
 * Bundle the backend into a single ESM file with Bun.build.
 *
 * Output contract (consumed by scripts/build/builder.py):
 * - dist/server.js: one minified ESM entry file.
 * - npm packages are bundled; native modules (argon2) and the `prisma` CLI stay
 *   external.
 * - The generated Prisma client stays external as a relative .ts import. The
 *   release layout copies prisma/ next to the bundle and production runs on
 *   Bun, which executes TypeScript directly, so generated code is not
 *   duplicated into the bundle.
 * - `@/` tsconfig path aliases are resolved by Bun natively; only the Prisma
 *   client re-export needs the custom external mapping below.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dir, '..');
const outfile = path.resolve(projectRoot, 'dist/server.js');
const schemaPath = path.resolve(projectRoot, 'prisma/schema.prisma');
const manifestPath = path.resolve(projectRoot, 'prisma/bootstrap/generated/schema-manifest.json');

function verifySchemaManifest(): void {
  if (!fs.existsSync(manifestPath)) {
    throw new Error('Database schema manifest is missing. Run `bun run prisma:generate` first.');
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as { schemaHash?: string };
  const schemaHash = createHash('sha256').update(fs.readFileSync(schemaPath)).digest('hex');
  if (manifest.schemaHash !== schemaHash) {
    throw new Error('Database schema manifest is stale. Run `bun run prisma:generate` first.');
  }
}

async function main(): Promise<void> {
  verifySchemaManifest();

  const result = await Bun.build({
    entrypoints: [path.resolve(projectRoot, 'server.ts')],
    outdir: path.dirname(outfile),
    target: 'bun',
    format: 'esm',
    minify: true,
    sourcemap: 'none',
    splitting: false,
    external: ['argon2', 'prisma'],
    define: {
      'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'production')
    },
    plugins: [
      {
        name: 'external-prisma-client',
        setup(build) {
          build.onResolve({ filter: /^@\/prisma\/client$/ }, () => ({
            // Relative to the emitted bundle; the release layout places the
            // prisma/ folder next to dist/server.js.
            path: './prisma/client/generated/client.ts',
            external: true
          }));
        }
      }
    ]
  });

  if (!result.success) {
    for (const message of result.logs) {
      console.error(message);
    }
    throw new Error('Bun.build failed; see the diagnostics above.');
  }
  console.info('bun build: backend bundled ->', path.relative(process.cwd(), outfile));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
