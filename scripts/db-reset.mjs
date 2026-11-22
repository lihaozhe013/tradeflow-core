import { spawnSync } from 'node:child_process';
import { constants, copyFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const configuredDir = process.env['TRADEFLOW_CONFIG_DIR'];
const configDir = configuredDir
  ? path.resolve(rootDir, configuredDir)
  : path.join(rootDir, 'config');
const configPath = path.join(configDir, 'config.yaml');
const exampleConfigPath = path.join(rootDir, 'config-example', 'config', 'config.yaml');

function ensureDevelopmentConfig() {
  if (existsSync(configPath)) {
    return;
  }

  if (configuredDir) {
    throw new Error(
      `Configuration is missing at ${configPath}. Create config.yaml in TRADEFLOW_CONFIG_DIR ` +
        'or unset it to use the repository development config.'
    );
  }

  mkdirSync(configDir, { recursive: true });

  let created = false;
  try {
    copyFileSync(exampleConfigPath, configPath, constants.COPYFILE_EXCL);
    created = true;
  } catch (error) {
    if (!existsSync(configPath)) {
      throw new Error(`Failed to create ${configPath} from ${exampleConfigPath}.`, {
        cause: error
      });
    }
  }

  if (created) {
    console.info(
      `[db:reset] Created ${configPath} from the example. ` +
        'Adjust the PostgreSQL credentials if they differ on this machine.'
    );
  }
}

try {
  ensureDevelopmentConfig();
} catch (error) {
  console.error(`[db:reset] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}

const result = spawnSync('bun', ['run', '--cwd', path.join(rootDir, 'backend'), 'db:reset'], {
  cwd: rootDir,
  env: { ...process.env, TRADEFLOW_CONFIG_DIR: configDir },
  stdio: 'inherit'
});

if (result.error) {
  console.error(`[db:reset] Failed to start Bun: ${result.error.message}`);
  process.exit(1);
}

process.exit(result.status ?? 1);
