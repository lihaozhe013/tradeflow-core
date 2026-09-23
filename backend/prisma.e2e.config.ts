import fs from 'node:fs';
import path from 'node:path';
import * as yaml from 'js-yaml';
import { defineConfig } from 'prisma/config';

interface E2eDatabaseConfig {
  host?: string;
  port?: number;
  user?: string;
  password?: string;
  dbName?: string;
}

interface E2eAppConfig {
  database?: E2eDatabaseConfig;
}

const configDir = process.env['TRADEFLOW_CONFIG_DIR'];
if (!configDir) {
  throw new Error('TRADEFLOW_CONFIG_DIR is required for the E2E Prisma configuration.');
}

const configPath = path.resolve(configDir, 'config.yaml');
const appConfig = yaml.load(fs.readFileSync(configPath, 'utf8')) as E2eAppConfig;
const database = appConfig.database;

if (database?.dbName !== 'tradeflow_e2e' || !database.host || !database.port || !database.user) {
  throw new Error('The E2E database config is incomplete or does not target tradeflow_e2e.');
}

const host =
  database.host.includes(':') && !database.host.startsWith('[')
    ? `[${database.host}]`
    : database.host;
const user = encodeURIComponent(database.user);
const password = encodeURIComponent(database.password ?? '');
const datasourceUrl = `postgresql://${user}:${password}@${host}:${database.port}/tradeflow_e2e?schema=public`;

export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: { url: datasourceUrl }
});
