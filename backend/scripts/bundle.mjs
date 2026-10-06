import { build } from 'esbuild';
import path from 'node:path';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Bundle backend/server.ts into a single ESM file at backend/dist/server.js
 * Notes:
 * - Externalize ALL npm packages (everything from node_modules) so only our project code is bundled
 * - Keep native modules external (argon2, sqlite3) — redundant but explicit
 * - Preserve ESM format since backend uses "type":"module"
 */
async function main() {
  const projectRoot = path.resolve(__dirname, '..');
  const entry = path.resolve(projectRoot, 'server.ts');
  const outfile = path.resolve(projectRoot, 'dist/server.js');
  const schemaPath = path.resolve(projectRoot, 'prisma/schema.prisma');
  const manifestPath = path.resolve(projectRoot, 'prisma/bootstrap/generated/schema-manifest.json');
  if (!fs.existsSync(manifestPath)) {
    throw new Error('Database schema manifest is missing. Run `bun run prisma:generate` first.');
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const schemaHash = createHash('sha256').update(fs.readFileSync(schemaPath)).digest('hex');
  if (manifest.schemaHash !== schemaHash) {
    throw new Error('Database schema manifest is stale. Run `bun run prisma:generate` first.');
  }

  await build({
    entryPoints: [entry],
    outfile,
    bundle: true,
    platform: 'node',
    target: ['esnext'],
    format: 'esm',
    sourcemap: false,
    minify: true,
    external: ['argon2', 'prisma'],
    banner: {
      js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);"
    },
    plugins: [
      {
        name: 'alias-atslash',
        setup(build) {
          build.onResolve({ filter: /^@\// }, (args) => {
            const sub = args.path.replace(/^@\//, '');
            if (sub === 'prisma/client') {
              return { path: './prisma/client/generated/client.ts', external: true };
            }
            const base = path.resolve(projectRoot, sub);

            const candidates = [];
            const hasExt = !!path.extname(base);
            if (hasExt) {
              candidates.push(base);
              // Special-case .js in TS sources
              if (base.endsWith('.js')) candidates.push(base.replace(/\.js$/, '.ts'));
            } else {
              for (const ext of ['.ts', '.tsx', '.js', '.mjs', '.cjs', '.json']) {
                candidates.push(base + ext);
              }
              for (const ext of ['.ts', '.tsx', '.js', '.mjs']) {
                candidates.push(path.join(base, 'index' + ext));
              }
            }
            for (const p of candidates) {
              if (fs.existsSync(p)) return { path: p };
            }
            return { path: base };
          });
        }
      }
    ],
    define: {
      'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'production')
    }
  });
  console.info('esbuild: backend bundled ->', path.relative(process.cwd(), outfile));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
