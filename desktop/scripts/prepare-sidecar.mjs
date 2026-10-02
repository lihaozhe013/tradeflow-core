import { spawnSync } from 'node:child_process';
import { mkdirSync, copyFileSync } from 'node:fs';
import { resolve } from 'node:path';
const rust = spawnSync('rustc', ['-vV'], { encoding: 'utf8' });
if (rust.status !== 0) throw new Error('Rust is required to build the companion executable.');
const host = rust.stdout.match(/^host: (.+)$/m)?.[1];
if (!host) throw new Error('Cannot determine the Rust target.');
const target = process.env.TRADEFLOW_DESKTOP_TARGET || host;
const build = spawnSync(
  'cargo',
  ['build', '--locked', '--release', '-p', 'tradeflow-connect', '--target', target],
  { stdio: 'inherit' }
);
if (build.status !== 0) process.exit(build.status || 1);
const ext = target.includes('windows') ? '.exe' : '';
mkdirSync('src-tauri/binaries', { recursive: true });
copyFileSync(
  resolve('target', target, 'release', `tradeflow-connect${ext}`),
  resolve('src-tauri/binaries', `tradeflow-connect-${target}${ext}`)
);
