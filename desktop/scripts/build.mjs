import { spawnSync } from 'node:child_process';
const prepared = spawnSync(process.execPath, ['scripts/prepare-sidecar.mjs'], { stdio: 'inherit' });
if (prepared.status !== 0) process.exit(prepared.status || 1);
const args = process.argv.slice(2).filter((argument, index) => index !== 0 || argument !== '--');
const result = spawnSync('bun', ['run', 'tauri', 'build', ...args], { stdio: 'inherit' });
process.exit(result.status || 0);
