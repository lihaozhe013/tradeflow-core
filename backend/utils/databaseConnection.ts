import type { PoolConfig } from 'pg';
import type { AppConfig } from '@/types/config';

export type DatabaseConfig = NonNullable<AppConfig['database']>;

export interface ValidatedDatabaseConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  dbName: string;
  maxConnections: number;
  bootstrap: {
    createDatabase: boolean;
    maintenanceDatabase: string;
    lockTimeoutMs: number;
    statementTimeoutMs: number;
  };
}

const DEFAULT_MAX_CONNECTIONS = 5;
const MAX_CONNECTIONS = 100;
const MAX_POSTGRES_IDENTIFIER_BYTES = 63;

function validateIdentifier(value: string, label: string): string {
  if (
    !value ||
    value.includes('\0') ||
    Buffer.byteLength(value, 'utf8') > MAX_POSTGRES_IDENTIFIER_BYTES
  ) {
    throw new Error(`${label} must be a non-empty PostgreSQL identifier of at most 63 bytes.`);
  }
  return value;
}

function validateTimeout(value: number | undefined, fallback: number, label: string): number {
  const timeout = value ?? fallback;
  if (!Number.isInteger(timeout) || timeout < 1 || timeout > 600000) {
    throw new Error(`${label} must be an integer between 1 and 600000 milliseconds.`);
  }
  return timeout;
}

export function validateDatabaseConfig(
  database: DatabaseConfig | undefined
): ValidatedDatabaseConfig {
  if (!database) {
    throw new Error('Database configuration is missing.');
  }
  if (database.type && database.type !== 'postgresql') {
    throw new Error(
      `Unsupported database type: ${database.type}. This server requires PostgreSQL.`
    );
  }

  const host = database.host?.trim();
  const user = database.user?.trim();
  const port = Number(database.port);
  const maxConnections = database.maxConnections
    ? Number(database.maxConnections)
    : DEFAULT_MAX_CONNECTIONS;

  if (!host || !user || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('Database host, user, and a valid TCP port are required.');
  }
  if (!Number.isInteger(maxConnections) || maxConnections < 1 || maxConnections > MAX_CONNECTIONS) {
    throw new Error(`Database maxConnections must be between 1 and ${MAX_CONNECTIONS}.`);
  }

  const bootstrap = database.bootstrap;
  const maintenanceDatabase = validateIdentifier(
    bootstrap?.maintenanceDatabase ?? 'postgres',
    'database.bootstrap.maintenanceDatabase'
  );

  return {
    host,
    port,
    user,
    password: database.password ?? '',
    dbName: validateIdentifier(database.dbName ?? '', 'database.dbName'),
    maxConnections,
    bootstrap: {
      createDatabase: bootstrap?.createDatabase ?? true,
      maintenanceDatabase,
      lockTimeoutMs: validateTimeout(
        bootstrap?.lockTimeoutMs,
        30000,
        'database.bootstrap.lockTimeoutMs'
      ),
      statementTimeoutMs: validateTimeout(
        bootstrap?.statementTimeoutMs,
        60000,
        'database.bootstrap.statementTimeoutMs'
      )
    }
  };
}

export function createPoolConfig(
  database: ValidatedDatabaseConfig,
  dbName = database.dbName,
  max = database.maxConnections
): PoolConfig {
  return {
    host: database.host,
    port: database.port,
    user: database.user,
    password: database.password,
    database: dbName,
    max,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000
  };
}
