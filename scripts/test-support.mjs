import { spawnSync } from 'node:child_process';
import { constants, copyFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const defaultTestConfigDir = path.join(rootDir, 'backend', 'test-config');
const exampleTestConfigPath = path.join(rootDir, 'config-example', 'config', 'config.e2e.yaml');

function ensureDefaultTestConfig(configPath) {
  if (existsSync(configPath)) return;

  mkdirSync(path.dirname(configPath), { recursive: true });

  try {
    copyFileSync(exampleTestConfigPath, configPath, constants.COPYFILE_EXCL);
  } catch (error) {
    if (!existsSync(configPath)) {
      throw new Error(
        `Failed to create test configuration at ${configPath} from ${exampleTestConfigPath}.`,
        { cause: error }
      );
    }
  }

  console.info(
    `[test] Created ${configPath} from the example. ` +
      'Update database credentials and rerun the tests.'
  );
}

export function getTestEnvironment() {
  const configuredDir = process.env['TRADEFLOW_CONFIG_DIR'];
  const configDir = path.resolve(configuredDir ?? defaultTestConfigDir);
  const configPath = path.join(configDir, 'config.yaml');

  if (!existsSync(configPath) && !configuredDir) ensureDefaultTestConfig(configPath);

  if (!existsSync(configPath)) {
    throw new Error(
      `Test configuration is missing at ${configPath}. Create it from ` +
        'config-example/config/config.e2e.yaml and set local PostgreSQL credentials.'
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
