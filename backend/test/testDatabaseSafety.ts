import path from 'node:path';
import { config, getConfigDir } from '@/utils/paths';

export const E2E_DATABASE_NAME = 'tradeflow_e2e';

export function assertTestDatabaseConfig(): void {
  const configuredDir = process.env['TRADEFLOW_CONFIG_DIR'];
  if (!configuredDir) {
    throw new Error(
      '[test] TRADEFLOW_CONFIG_DIR is required. Point it to the isolated test config directory.'
    );
  }

  if (path.resolve(configuredDir) !== getConfigDir()) {
    throw new Error('[test] The configured test directory could not be resolved safely.');
  }

  const databaseName = config.database?.dbName;
  if (databaseName !== E2E_DATABASE_NAME) {
    throw new Error(
      `[test] Refusing to reset a database named ${String(databaseName ?? '(missing)')}. ` +
        `The test database must be named ${E2E_DATABASE_NAME}.`
    );
  }
}
