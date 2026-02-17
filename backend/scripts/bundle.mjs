import { build } from 'esbuild';
import path from 'node:path';
import fs from 'node:fs';
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

  await build({
    entryPoints: [entry],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'esm',
    sourcemap: false,
    minify: true,
    packages: 'external',
    plugins: [
      {
        name: 'alias-atslash',
        setup(build) {
          build.onResolve({ filter: /^@\// }, (args) => {
            let sub = args.path.replace(/^@\//, '');
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
        },
      },
    ],
    define: {
      'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'production'),
    },
  });
  console.log('esbuild: backend bundled ->', path.relative(process.cwd(), outfile));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
