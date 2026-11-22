import type { AppConfig } from '@/types/config';

/**
 * Applies database settings from environment variables on top of config.yaml.
 * These overrides let one checkout run against different local PostgreSQL setups.
 */
export function applyDatabaseEnvironmentOverrides(
  appConfig: AppConfig,
  env: NodeJS.ProcessEnv = process.env
): AppConfig {
  const host = env['TRADEFLOW_DB_HOST'];
  const port = env['TRADEFLOW_DB_PORT'];
  const user = env['TRADEFLOW_DB_USER'];
  const password = env['TRADEFLOW_DB_PASSWORD'];
  const dbName = env['TRADEFLOW_DB_NAME'];

  if (
    host === undefined &&
    port === undefined &&
    user === undefined &&
    password === undefined &&
    dbName === undefined
  ) {
    return appConfig;
  }

  const database = { ...appConfig.database };

  if (host !== undefined) database.host = host;
  if (port !== undefined) {
    const parsedPort = Number(port);
    if (!Number.isInteger(parsedPort) || parsedPort < 1 || parsedPort > 65535) {
      throw new Error('TRADEFLOW_DB_PORT must be an integer between 1 and 65535.');
    }
    database.port = parsedPort;
  }
  if (user !== undefined) database.user = user;
  if (password !== undefined) database.password = password;
  if (dbName !== undefined) database.dbName = dbName;

  return { ...appConfig, database };
}
