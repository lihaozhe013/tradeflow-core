import { Pool, escapeIdentifier } from 'pg';
import type { PoolConfig, QueryResult, QueryResultRow } from 'pg';
import schemaManifestJson from '@/prisma/bootstrap/generated/schema-manifest.json';
import type { DatabaseConfig, ValidatedDatabaseConfig } from '@/utils/databaseConnection';
import { createPoolConfig, validateDatabaseConfig } from '@/utils/databaseConnection';
import { logger } from '@/utils/logger';

interface ColumnManifest {
  name: string;
  definitionSql: string;
  type: string;
  nullable: boolean;
  defaultSql: string | null;
  serial: boolean;
}

interface TableManifest {
  name: string;
  createSql: string;
  columns: ColumnManifest[];
  constraints: Array<{ name: string; type: 'primary key'; columns: string[] }>;
}

interface IndexManifest {
  name: string;
  table: string;
  unique: boolean;
  columns: string[];
}

interface ForeignKeyManifest {
  name: string;
  table: string;
  columns: string[];
  referencedTable: string;
  referencedColumns: string[];
  onDelete: string;
  onUpdate: string;
}

export interface SchemaManifest {
  schemaHash: string;
  tables: TableManifest[];
  indexes: IndexManifest[];
  foreignKeys: ForeignKeyManifest[];
}

export interface PoolClientLike {
  query<Row extends QueryResultRow = QueryResultRow>(
    queryText: string,
    values?: unknown[]
  ): Promise<QueryResult<Row>>;
  release(): void;
}

export interface PoolLike {
  query<Row extends QueryResultRow = QueryResultRow>(
    queryText: string,
    values?: unknown[]
  ): Promise<QueryResult<Row>>;
  connect(): Promise<PoolClientLike>;
  end(): Promise<void>;
}

export interface BootstrapDependencies {
  poolFactory?: (config: PoolConfig) => PoolLike;
  manifest?: SchemaManifest;
}

interface ExistingColumn extends QueryResultRow {
  table_name: string;
  column_name: string;
  data_type: string;
  nullable: boolean;
  default_sql: string | null;
  sequence_name: string | null;
}

interface ExistingConstraint extends QueryResultRow {
  table_name: string;
  constraint_name: string;
  constraint_type: string;
  columns: string[];
  referenced_table: string | null;
  referenced_columns: string[] | null;
  on_delete: string | null;
  on_update: string | null;
}

interface ExistingIndex extends QueryResultRow {
  table_name: string;
  index_name: string;
  unique: boolean;
  columns: string[];
  method: string;
  predicate: string | null;
  valid: boolean;
  default_opclass: boolean;
  default_order: boolean;
}

interface DatabaseSnapshot {
  tables: string[];
  columns: ExistingColumn[];
  constraints: ExistingConstraint[];
  indexes: ExistingIndex[];
}

export interface DatabaseBootstrapSummary {
  tablesCreated: number;
  columnsAdded: number;
  constraintsAdded: number;
  indexesAdded: number;
  warnings: string[];
  durationMs: number;
}

export class DatabaseBootstrapError extends Error {
  constructor(
    message: string,
    readonly errorCode: string,
    readonly recommendation: string
  ) {
    super(message);
    this.name = 'DatabaseBootstrapError';
  }
}

export function getSchemaManifest(): SchemaManifest {
  return schemaManifestJson as SchemaManifest;
}

function pgErrorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : undefined;
}

function failureFor(error: unknown, action: string): DatabaseBootstrapError {
  const code = pgErrorCode(error);
  if (code === '42501') {
    return new DatabaseBootstrapError(
      `${action} failed because the configured PostgreSQL role lacks permission.`,
      code,
      'Grant the required CREATE DATABASE or schema privileges, or perform the database creation manually.'
    );
  }
  if (code === '23505' || code === '23502' || code === '23503' || code === '23514') {
    return new DatabaseBootstrapError(
      `${action} failed because existing data violates a required key or constraint (${code}).`,
      code,
      'Review and reconcile the affected records, then restart the backend.'
    );
  }
  if (code === '55P03' || code === '57014') {
    return new DatabaseBootstrapError(
      `${action} timed out while waiting for a database lock or statement (${code}).`,
      code,
      'Wait for concurrent database work to finish or increase the bootstrap timeout.'
    );
  }
  return new DatabaseBootstrapError(
    `${action} failed${code ? ` (PostgreSQL error ${code})` : ''}.`,
    code ?? 'DATABASE_ERROR',
    'Check PostgreSQL availability, permissions, and schema state.'
  );
}

function normalizeType(type: string): string {
  const normalized = type
    .toLowerCase()
    .replace(/\s*\(\s*/g, '(')
    .replace(/\s*\)/g, ')')
    .replace(/\s*\[/g, '[');
  return normalized
    .replace(/ without time zone$/, '')
    .replace(/^character varying/, 'varchar')
    .replace(/^int4$/, 'integer')
    .replace(/^int2$/, 'smallint')
    .replace(/^int8$/, 'bigint')
    .replace(/^float8$/, 'double precision')
    .replace(/^float4$/, 'real')
    .replace(/^bool$/, 'boolean')
    .replace(/^serial$/, 'integer')
    .replace(/^bigserial$/, 'bigint')
    .replace(/^smallserial$/, 'smallint')
    .replace(/^timestamp without time zone$/, 'timestamp');
}

function normalizeDefault(value: string | null): string | null {
  if (value === null) return null;
  let normalized = value.trim().toLowerCase().replace(/\s+/g, ' ');
  while (normalized.startsWith('(') && normalized.endsWith(')')) {
    normalized = normalized.slice(1, -1).trim();
  }
  return normalized;
}

function sameColumns(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((column, index) => column === right[index]);
}

function addWarning(warnings: string[], message: string): void {
  if (!warnings.includes(message)) warnings.push(message);
}

async function readSnapshot(client: PoolClientLike): Promise<DatabaseSnapshot> {
  const tableResult = await client.query<{ table_name: string }>(
    `SELECT c.relname AS table_name
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')`
  );
  const columnResult = await client.query<ExistingColumn>(
    `SELECT c.relname AS table_name,
              a.attname AS column_name,
              format_type(a.atttypid, a.atttypmod) AS data_type,
              NOT a.attnotnull AS nullable,
              pg_get_expr(d.adbin, d.adrelid) AS default_sql,
              pg_get_serial_sequence(format('%I.%I', n.nspname, c.relname), a.attname) AS sequence_name
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
       JOIN pg_attribute a ON a.attrelid = c.oid
       LEFT JOIN pg_attrdef d ON d.adrelid = c.oid AND d.adnum = a.attnum
       WHERE n.nspname = 'public'
         AND c.relkind IN ('r', 'p')
         AND a.attnum > 0
         AND NOT a.attisdropped`
  );
  const constraintResult = await client.query<ExistingConstraint>(
    `SELECT c.relname AS table_name,
              con.conname AS constraint_name,
              con.contype AS constraint_type,
              ARRAY(
                SELECT a.attname::text
                FROM unnest(con.conkey) WITH ORDINALITY AS key_column(attnum, ordinal)
                JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = key_column.attnum
                ORDER BY key_column.ordinal
              ) AS columns,
              referenced.relname AS referenced_table,
              CASE WHEN con.confkey IS NULL THEN NULL ELSE ARRAY(
                SELECT a.attname::text
                FROM unnest(con.confkey) WITH ORDINALITY AS key_column(attnum, ordinal)
                JOIN pg_attribute a ON a.attrelid = referenced.oid AND a.attnum = key_column.attnum
                ORDER BY key_column.ordinal
              ) END AS referenced_columns,
              CASE con.confdeltype
                WHEN 'c' THEN 'cascade' WHEN 'r' THEN 'restrict' WHEN 'a' THEN 'no action'
                WHEN 'n' THEN 'set null' WHEN 'd' THEN 'set default' ELSE NULL
              END AS on_delete,
              CASE con.confupdtype
                WHEN 'c' THEN 'cascade' WHEN 'r' THEN 'restrict' WHEN 'a' THEN 'no action'
                WHEN 'n' THEN 'set null' WHEN 'd' THEN 'set default' ELSE NULL
              END AS on_update
       FROM pg_constraint con
       JOIN pg_class c ON c.oid = con.conrelid
       JOIN pg_namespace n ON n.oid = c.relnamespace
       LEFT JOIN pg_class referenced ON referenced.oid = con.confrelid
       WHERE n.nspname = 'public' AND con.contype IN ('p', 'u', 'f')`
  );
  const indexResult = await client.query<ExistingIndex>(
    `SELECT table_class.relname AS table_name,
              index_class.relname AS index_name,
              index_data.indisunique AS unique,
              ARRAY(
                SELECT a.attname::text
                FROM unnest(index_data.indkey::smallint[]) WITH ORDINALITY AS key_column(attnum, ordinal)
                JOIN pg_attribute a ON a.attrelid = table_class.oid AND a.attnum = key_column.attnum
                WHERE key_column.ordinal <= index_data.indnkeyatts
                ORDER BY key_column.ordinal
              ) AS columns,
              access_method.amname AS method,
              pg_get_expr(index_data.indpred, index_data.indrelid) AS predicate,
              index_data.indisvalid AS valid,
              NOT EXISTS (
                SELECT 1
                FROM unnest(index_data.indclass::oid[]) WITH ORDINALITY AS opclass(opclass_oid, ordinal)
                JOIN pg_opclass op ON op.oid = opclass.opclass_oid
                WHERE op.opcdefault IS NOT TRUE
              ) AS default_opclass,
              NOT EXISTS (
                SELECT 1
                FROM unnest(index_data.indoption::smallint[]) WITH ORDINALITY AS option(option_bits, ordinal)
                WHERE option.option_bits <> 0 AND option.ordinal <= index_data.indnkeyatts
              ) AS default_order
       FROM pg_index index_data
       JOIN pg_class table_class ON table_class.oid = index_data.indrelid
       JOIN pg_namespace table_namespace ON table_namespace.oid = table_class.relnamespace
       JOIN pg_class index_class ON index_class.oid = index_data.indexrelid
       JOIN pg_am access_method ON access_method.oid = index_class.relam
       WHERE table_namespace.nspname = 'public' AND NOT index_data.indisprimary`
  );

  return {
    tables: tableResult.rows.map((row) => row.table_name),
    columns: columnResult.rows,
    constraints: constraintResult.rows,
    indexes: indexResult.rows
  };
}

function equivalentIndex(index: ExistingIndex, expected: IndexManifest): boolean {
  return (
    index.valid &&
    sameColumns(index.columns, expected.columns) &&
    index.method === 'btree' &&
    index.predicate === null &&
    index.default_opclass &&
    index.default_order &&
    (index.unique === expected.unique || (!expected.unique && index.unique))
  );
}

function quoteNames(names: string[]): string {
  return names.map((name) => escapeIdentifier(name)).join(', ');
}

async function tableHasRows(client: PoolClientLike, tableName: string): Promise<boolean> {
  const result = await client.query<{ present: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM ${escapeIdentifier(tableName)} LIMIT 1) AS present`
  );
  return result.rows[0]?.present ?? false;
}

async function applyManifest(
  client: PoolClientLike,
  manifest: SchemaManifest
): Promise<Omit<DatabaseBootstrapSummary, 'durationMs'>> {
  const before = await readSnapshot(client);
  const tableNames = new Set(before.tables);
  const createdTables = new Set<string>();
  const warnings: string[] = [];
  let tablesCreated = 0;
  let columnsAdded = 0;
  let constraintsAdded = 0;
  let indexesAdded = 0;

  for (const table of manifest.tables) {
    if (!tableNames.has(table.name)) {
      await executeDdl(client, table.createSql, `Creating table ${table.name}`);
      createdTables.add(table.name);
      tablesCreated++;
      continue;
    }

    const existingColumns = before.columns.filter((column) => column.table_name === table.name);
    const tableIsPopulated =
      existingColumns.length > 0 ? await tableHasRows(client, table.name) : false;

    for (const column of table.columns) {
      const existing = existingColumns.find((candidate) => candidate.column_name === column.name);
      if (!existing) {
        if (!column.nullable && !column.defaultSql && !column.serial && tableIsPopulated) {
          throw new DatabaseBootstrapError(
            `Cannot add required column ${table.name}.${column.name} because the table already contains rows.`,
            'REQUIRED_COLUMN_NEEDS_BACKFILL',
            'Provide a safe database default or backfill this column before restarting the backend.'
          );
        }
        await executeDdl(
          client,
          `ALTER TABLE ${escapeIdentifier(table.name)} ADD COLUMN ${column.definitionSql}`,
          `Adding column ${table.name}.${column.name}`
        );
        columnsAdded++;
        continue;
      }

      const differences: string[] = [];
      if (normalizeType(existing.data_type) !== normalizeType(column.type))
        differences.push('type');
      if (existing.nullable !== column.nullable) differences.push('nullability');
      if (
        !column.serial &&
        normalizeDefault(existing.default_sql) !== normalizeDefault(column.defaultSql)
      ) {
        differences.push('default');
      }
      if (column.serial !== Boolean(existing.sequence_name)) differences.push('serial sequence');
      if (differences.length > 0) {
        addWarning(
          warnings,
          `${table.name}.${column.name} has a different ${differences.join(', ')}; the existing definition was kept.`
        );
      }
    }
  }

  for (const table of manifest.tables) {
    if (createdTables.has(table.name)) continue;
    const currentPrimaryKeys = before.constraints.filter(
      (constraint) => constraint.table_name === table.name && constraint.constraint_type === 'p'
    );
    for (const expected of table.constraints) {
      if (currentPrimaryKeys.some((actual) => sameColumns(actual.columns, expected.columns)))
        continue;
      const nameConflict = before.constraints.some(
        (constraint) =>
          constraint.table_name === table.name && constraint.constraint_name === expected.name
      );
      if (currentPrimaryKeys.length > 0 || nameConflict) {
        addWarning(
          warnings,
          `${table.name} has a conflicting primary key; the existing key was kept.`
        );
        continue;
      }
      await executeDdl(
        client,
        `ALTER TABLE ${escapeIdentifier(table.name)} ADD CONSTRAINT ${escapeIdentifier(expected.name)} PRIMARY KEY (${quoteNames(expected.columns)})`,
        `Adding primary key ${table.name}.${expected.name}`
      );
      constraintsAdded++;
    }
  }

  for (const expected of manifest.indexes) {
    const tableName = getIndexTable(expected);
    const existing = before.indexes.filter((index) => index.table_name === tableName);
    if (existing.some((index) => equivalentIndex(index, expected))) continue;
    const nameConflict = existing.some((index) => index.index_name === expected.name);
    if (nameConflict) {
      addWarning(
        warnings,
        `${tableName} has a conflicting index named ${expected.name}; it was kept.`
      );
      continue;
    }
    await executeDdl(
      client,
      `CREATE ${expected.unique ? 'UNIQUE ' : ''}INDEX ${escapeIdentifier(expected.name)} ON ${escapeIdentifier(tableName)} (${quoteNames(expected.columns)})`,
      `Adding index ${tableName}.${expected.name}`
    );
    indexesAdded++;
  }

  for (const expected of manifest.foreignKeys) {
    const sameLocalColumns = before.constraints.filter(
      (constraint) =>
        constraint.table_name === getForeignKeyTable(expected) &&
        constraint.constraint_type === 'f' &&
        sameColumns(constraint.columns, expected.columns)
    );
    if (
      sameLocalColumns.some(
        (actual) =>
          actual.referenced_table === expected.referencedTable &&
          sameColumns(actual.referenced_columns ?? [], expected.referencedColumns) &&
          actual.on_delete === expected.onDelete &&
          actual.on_update === expected.onUpdate
      )
    ) {
      continue;
    }

    const tableName = getForeignKeyTable(expected);
    const nameConflict = before.constraints.some(
      (constraint) =>
        constraint.table_name === tableName && constraint.constraint_name === expected.name
    );
    if (sameLocalColumns.length > 0 || nameConflict) {
      addWarning(
        warnings,
        `${tableName}.${expected.columns.join(', ')} has a conflicting foreign key; it was kept.`
      );
      continue;
    }

    const action = (value: string): string => {
      const allowed = new Set(['cascade', 'restrict', 'no action', 'set null', 'set default']);
      if (!allowed.has(value))
        throw new Error('The generated schema contains an unsupported foreign key action.');
      return value.toUpperCase();
    };
    await executeDdl(
      client,
      `ALTER TABLE ${escapeIdentifier(tableName)} ADD CONSTRAINT ${escapeIdentifier(expected.name)} ` +
        `FOREIGN KEY (${quoteNames(expected.columns)}) REFERENCES ${escapeIdentifier(expected.referencedTable)} ` +
        `(${quoteNames(expected.referencedColumns)}) ON DELETE ${action(expected.onDelete)} ON UPDATE ${action(expected.onUpdate)}`,
      `Adding foreign key ${tableName}.${expected.name}`
    );
    constraintsAdded++;
  }

  return { tablesCreated, columnsAdded, constraintsAdded, indexesAdded, warnings };
}

function getIndexTable(index: IndexManifest): string {
  return index.table;
}

function getForeignKeyTable(foreignKey: ForeignKeyManifest): string {
  return foreignKey.table;
}

async function executeDdl(client: PoolClientLike, sql: string, action: string): Promise<void> {
  try {
    await client.query(sql);
  } catch (error) {
    throw failureFor(error, action);
  }
}

async function createMissingDatabase(
  database: ValidatedDatabaseConfig,
  poolFactory: (config: PoolConfig) => PoolLike
): Promise<void> {
  const pool = poolFactory(createPoolConfig(database, database.bootstrap.maintenanceDatabase, 1));
  let client: PoolClientLike | undefined;
  const lockName = `tradeflow-core:create-database:${database.dbName}`;
  try {
    client = await pool.connect();
    await client.query("SELECT set_config('lock_timeout', $1, false)", [
      `${database.bootstrap.lockTimeoutMs}ms`
    ]);
    await client.query("SELECT set_config('statement_timeout', $1, false)", [
      `${database.bootstrap.statementTimeoutMs}ms`
    ]);
    await client.query('SELECT pg_advisory_lock(hashtext($1))', [lockName]);
    const exists = await client.query<{ exists: boolean }>(
      'SELECT EXISTS (SELECT 1 FROM pg_database WHERE datname = $1) AS exists',
      [database.dbName]
    );
    if (exists.rows[0]?.exists) return;

    try {
      await client.query(`CREATE DATABASE ${escapeIdentifier(database.dbName)}`);
    } catch (error) {
      const code = pgErrorCode(error);
      if (code !== '42P04' && code !== '23505') throw error;
      const raced = await client.query<{ exists: boolean }>(
        'SELECT EXISTS (SELECT 1 FROM pg_database WHERE datname = $1) AS exists',
        [database.dbName]
      );
      if (!raced.rows[0]?.exists) throw error;
    }
    logger.info('Created configured PostgreSQL database.', { database: database.dbName });
  } catch (error) {
    throw failureFor(error, `Creating database ${database.dbName}`);
  } finally {
    if (client) {
      try {
        await client.query('SELECT pg_advisory_unlock(hashtext($1))', [lockName]);
      } catch {
        // Closing the connection also releases a session advisory lock.
      }
      client.release();
    }
    await pool.end();
  }
}

export async function initializeDatabase(
  databaseConfig: DatabaseConfig | undefined,
  dependencies: BootstrapDependencies = {}
): Promise<DatabaseBootstrapSummary> {
  const startedAt = Date.now();
  let database: ValidatedDatabaseConfig;
  try {
    database = validateDatabaseConfig(databaseConfig);
  } catch (error) {
    throw new DatabaseBootstrapError(
      error instanceof Error ? error.message : 'Database configuration is invalid.',
      'INVALID_DATABASE_CONFIG',
      'Set a PostgreSQL host, port, user, and database name in config/config.yaml.'
    );
  }
  const manifest = dependencies.manifest ?? getSchemaManifest();
  const poolFactory =
    dependencies.poolFactory ??
    ((poolConfig: PoolConfig) => new Pool(poolConfig) as unknown as PoolLike);
  const pool = poolFactory(createPoolConfig(database, database.dbName, 1));
  let targetExists = true;

  try {
    await pool.query('SELECT 1');
  } catch (error) {
    if (pgErrorCode(error) !== '3D000') {
      await pool.end();
      throw failureFor(error, `Connecting to database ${database.dbName}`);
    }
    targetExists = false;
  }

  if (!targetExists) {
    await pool.end();
    if (!database.bootstrap.createDatabase) {
      throw new DatabaseBootstrapError(
        `Configured PostgreSQL database ${database.dbName} does not exist.`,
        'DATABASE_MISSING',
        'Create the database manually or set database.bootstrap.createDatabase to true.'
      );
    }
    await createMissingDatabase(database, poolFactory);
  }

  const targetPool = targetExists
    ? pool
    : poolFactory(createPoolConfig(database, database.dbName, 1));
  let client: PoolClientLike | undefined;
  try {
    client = await targetPool.connect();
    await client.query('BEGIN');
    await client.query("SELECT set_config('search_path', 'public', true)");
    await client.query("SELECT set_config('lock_timeout', $1, true)", [
      `${database.bootstrap.lockTimeoutMs}ms`
    ]);
    await client.query("SELECT set_config('statement_timeout', $1, true)", [
      `${database.bootstrap.statementTimeoutMs}ms`
    ]);
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
      'tradeflow-core:schema-bootstrap:public'
    ]);
    const result = await applyManifest(client, manifest);
    await client.query('COMMIT');

    const summary: DatabaseBootstrapSummary = {
      ...result,
      durationMs: Date.now() - startedAt
    };
    for (const warning of summary.warnings)
      logger.warn('Database schema differs from Prisma schema.', { warning });
    logger.info('Database bootstrap completed.', summary);
    return summary;
  } catch (error) {
    try {
      await client?.query('ROLLBACK');
    } catch {
      // Preserve the original, redacted bootstrap failure.
    }
    if (error instanceof DatabaseBootstrapError) throw error;
    throw failureFor(error, 'Applying missing Prisma database objects');
  } finally {
    client?.release();
    await targetPool.end();
  }
}
