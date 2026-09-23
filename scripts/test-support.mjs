import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function getTestEnvironment() {
  const configuredDir = process.env['TRADEFLOW_CONFIG_DIR'];
  const configDir = path.resolve(configuredDir ?? path.join(rootDir, 'backend', 'test-config'));
  const configPath = path.join(configDir, 'config.yaml');

  if (!existsSync(configPath)) {
    throw new Error(
      `Test configuration is missing at ${configPath}. Copy ` +
        'config-example/config/config.e2e.yaml to backend/test-config/config.yaml and set local PostgreSQL credentials.'
    );
  }

  return {
    ...process.env,
    NODE_ENV: 'test',
    TRADEFLOW_CONFIG_DIR: configDir
  };
}

export function runPnpm(args, env, cwd = rootDir) {
  const isWindows = process.platform === 'win32';
  const result = spawnSync(isWindows ? 'pnpm.cmd' : 'pnpm', args, {
    cwd,
    env,
    stdio: 'inherit',
    shell: isWindows
  });

  if (result.error) {
    console.error(`[test] Failed to start pnpm: ${result.error.message}`);
    return 1;
  }

  return result.status ?? 1;
}
