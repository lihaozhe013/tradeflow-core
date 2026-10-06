import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PoolConfig, QueryResult } from 'pg';
import {
  initializeDatabase,
  type PoolClientLike,
  type PoolLike,
  type SchemaManifest
} from '@/utils/databaseBootstrap';
import type { DatabaseConfig } from '@/utils/databaseConnection';
import { config } from '@/utils/paths';
import { assertTestDatabaseConfig } from '@/test/testDatabaseSafety';

interface FakeState {
  databaseExists: boolean;
  tableNames: string[];
  columns: Array<Record<string, unknown>>;
  constraints: Array<Record<string, unknown>>;
  indexes: Array<Record<string, unknown>>;
  rowExists: boolean;
  queries: string[];
  configs: PoolConfig[];
  failCreateCode?: string;
  failTargetConnectionCode?: string;
  failQueryPrefix?: string;
  failQueryCode?: string;
}

function queryResult<Row extends Record<string, unknown>>(rows: Row[] = []): QueryResult<Row> {
  return {
    command: '',
    rowCount: rows.length,
    oid: 0,
    fields: [],
    rows
  };
}

function fakePoolFactory(state: FakeState) {
  return (poolConfig: PoolConfig): PoolLike => {
    state.configs.push(poolConfig);
    const isMaintenancePool = poolConfig.database === 'postgres';

    const query = async (text: string): Promise<QueryResult<Record<string, unknown>>> => {
      state.queries.push(text);
      if (!isMaintenancePool && text === 'SELECT 1' && state.failTargetConnectionCode) {
        throw Object.assign(new Error('connection failed'), {
          code: state.failTargetConnectionCode
        });
      }
      if (!isMaintenancePool && text === 'SELECT 1' && !state.databaseExists) {
        throw Object.assign(new Error('database does not exist'), { code: '3D000' });
      }
      if (isMaintenancePool && text.startsWith('SELECT EXISTS')) {
        return queryResult([{ exists: state.databaseExists }]);
      }
      if (isMaintenancePool && text.startsWith('CREATE DATABASE')) {
        if (state.failCreateCode) {
          throw Object.assign(new Error('database creation failed'), {
            code: state.failCreateCode
          });
        }
        state.databaseExists = true;
      }
      return queryResult();
    };

    const client: PoolClientLike = {
      query: async <Row extends Record<string, unknown> = Record<string, unknown>>(
        text: string
      ): Promise<QueryResult<Row>> => {
        state.queries.push(text);
        if (state.failQueryPrefix && text.startsWith(state.failQueryPrefix)) {
          throw Object.assign(new Error('database operation failed'), {
            code: state.failQueryCode ?? 'DATABASE_ERROR'
          });
        }
        if (text.startsWith('SELECT EXISTS') && text.includes('pg_database')) {
          return queryResult([{ exists: state.databaseExists }]) as unknown as QueryResult<Row>;
        }
        if (text.startsWith('SELECT EXISTS (SELECT 1 FROM')) {
          return queryResult([{ present: state.rowExists }]) as unknown as QueryResult<Row>;
        }
        if (text.includes('con.conname')) return queryResult(state.constraints) as QueryResult<Row>;
        if (text.includes('index_class.relname'))
          return queryResult(state.indexes) as QueryResult<Row>;
        if (text.includes('a.attname')) return queryResult(state.columns) as QueryResult<Row>;
        if (text.startsWith('SELECT c.relname AS table_name')) {
          return queryResult(
            state.tableNames.map((table_name) => ({ table_name }))
          ) as unknown as QueryResult<Row>;
        }
        if (text.startsWith('CREATE DATABASE') && state.failCreateCode) {
          throw Object.assign(new Error('database creation failed'), {
            code: state.failCreateCode
          });
        }
        if (text.startsWith('CREATE DATABASE')) state.databaseExists = true;
        if (text.includes('CREATE TABLE "secret_table"') && state.failCreateCode) {
          throw Object.assign(new Error('duplicate key value SECRET_DATABASE_VALUE'), {
            code: state.failCreateCode
          });
        }
        return queryResult() as QueryResult<Row>;
      },
      release: vi.fn()
    };

    return {
      query: async <Row extends Record<string, unknown> = Record<string, unknown>>(
        text: string
      ): Promise<QueryResult<Row>> => (await query(text)) as QueryResult<Row>,
      connect: async () => client,
      end: vi.fn(async () => undefined)
    } as PoolLike;
  };
}

function createState(overrides: Partial<FakeState> = {}): FakeState {
  return {
    databaseExists: true,
    tableNames: [],
    columns: [],
    constraints: [],
    indexes: [],
    rowExists: false,
    queries: [],
    configs: [],
    ...overrides
  };
}

function databaseConfig(dbName = 'tradeflow_e2e'): DatabaseConfig {
  return {
    type: 'postgresql',
    host: '127.0.0.1',
    port: 5432,
    user: 'postgres',
    password: 'test-password',
    dbName
  };
}

function manifest(
  tableName: string,
  columns: SchemaManifest['tables'][number]['columns']
): SchemaManifest {
  return {
    schemaHash: 'test-schema-hash',
    tables: [
      {
        name: tableName,
        createSql: `CREATE TABLE "${tableName}" ("id" INTEGER NOT NULL)`,
        columns,
        constraints: []
      }
    ],
    indexes: [],
    foreignKeys: []
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('initializeDatabase', () => {
  it('is idempotent against the Prisma-prepared tradeflow_e2e database', async () => {
    assertTestDatabaseConfig();
    const results = await Promise.all([
      initializeDatabase(config.database),
      initializeDatabase(config.database)
    ]);

    expect(results).toHaveLength(2);
    for (const result of results) {
      expect(result.tablesCreated).toBe(0);
      expect(result.columnsAdded).toBe(0);
      expect(result.constraintsAdded).toBe(0);
      expect(result.indexesAdded).toBe(0);
      expect(result.warnings).toEqual([]);
    }
  });

  it('creates a missing database safely and creates the generated schema once', async () => {
    const state = createState({ databaseExists: false });
    const result = await initializeDatabase(databaseConfig('trade"flow'), {
      poolFactory: fakePoolFactory(state)
    });

    expect(state.queries).toContain('CREATE DATABASE "trade""flow"');
    expect(state.configs.every((pool) => pool.password === 'test-password')).toBe(true);
    expect(result.tablesCreated).toBe(13);
    expect(result.indexesAdded).toBe(7);
    expect(result.constraintsAdded).toBe(6);
    expect(state.queries).toContain('SELECT pg_advisory_lock(hashtext($1))');
    expect(state.queries).toContain('SELECT pg_advisory_xact_lock(hashtext($1))');
    expect(state.queries.at(-1)).toBe('COMMIT');
  });

  it('reports missing database privileges without exposing credentials', async () => {
    const state = createState({ databaseExists: false, failCreateCode: '42501' });

    await expect(
      initializeDatabase(databaseConfig(), { poolFactory: fakePoolFactory(state) })
    ).rejects.toMatchObject({
      errorCode: '42501',
      recommendation: expect.stringContaining('privileges'),
      message: expect.not.stringContaining('test-password')
    });
    expect(state.queries.some((query) => query.startsWith('CREATE TABLE'))).toBe(false);
  });

  it('stops on target database connection failures before applying DDL', async () => {
    const state = createState({ failTargetConnectionCode: '08006' });

    await expect(
      initializeDatabase(databaseConfig(), { poolFactory: fakePoolFactory(state) })
    ).rejects.toMatchObject({
      errorCode: '08006',
      message: expect.not.stringContaining('test-password')
    });
    expect(state.queries.some((query) => query.startsWith('CREATE TABLE'))).toBe(false);
    expect(state.queries).not.toContain('SELECT pg_advisory_xact_lock(hashtext($1))');
  });

  it('can require manual database creation by configuration', async () => {
    const state = createState({ databaseExists: false });

    await expect(
      initializeDatabase(
        { ...databaseConfig(), bootstrap: { createDatabase: false } },
        { poolFactory: fakePoolFactory(state) }
      )
    ).rejects.toMatchObject({ errorCode: 'DATABASE_MISSING' });
    expect(state.queries).not.toContain('SELECT pg_advisory_lock(hashtext($1))');
  });

  it('adds nullable and defaulted fields to populated tables', async () => {
    const state = createState({
      tableNames: ['legacy_records'],
      columns: [
        {
          table_name: 'legacy_records',
          column_name: 'id',
          data_type: 'integer',
          nullable: false,
          default_sql: null,
          sequence_name: null
        }
      ],
      rowExists: true
    });
    const schema = manifest('legacy_records', [
      {
        name: 'id',
        definitionSql: '"id" integer not null',
        type: 'integer',
        nullable: false,
        defaultSql: null,
        serial: false
      },
      {
        name: 'remark',
        definitionSql: '"remark" text',
        type: 'text',
        nullable: true,
        defaultSql: null,
        serial: false
      },
      {
        name: 'created_at',
        definitionSql: '"created_at" timestamp not null default current_timestamp',
        type: 'timestamp',
        nullable: false,
        defaultSql: 'current_timestamp',
        serial: false
      }
    ]);

    const result = await initializeDatabase(databaseConfig(), {
      poolFactory: fakePoolFactory(state),
      manifest: schema
    });

    expect(result.columnsAdded).toBe(2);
    expect(state.queries).toContain('ALTER TABLE "legacy_records" ADD COLUMN "remark" text');
    expect(state.queries).toContain(
      'ALTER TABLE "legacy_records" ADD COLUMN "created_at" timestamp not null default current_timestamp'
    );
  });

  it('adds a required field to an empty table and preserves extra objects', async () => {
    const state = createState({
      tableNames: ['legacy_records', 'extra_table'],
      columns: [
        {
          table_name: 'legacy_records',
          column_name: 'id',
          data_type: 'integer',
          nullable: false,
          default_sql: null,
          sequence_name: null
        },
        {
          table_name: 'legacy_records',
          column_name: 'legacy_note',
          data_type: 'text',
          nullable: true,
          default_sql: null,
          sequence_name: null
        }
      ],
      rowExists: false
    });
    const schema = manifest('legacy_records', [
      {
        name: 'id',
        definitionSql: '"id" integer not null',
        type: 'integer',
        nullable: false,
        defaultSql: null,
        serial: false
      },
      {
        name: 'required_code',
        definitionSql: '"required_code" text not null',
        type: 'text',
        nullable: false,
        defaultSql: null,
        serial: false
      }
    ]);

    const result = await initializeDatabase(databaseConfig(), {
      poolFactory: fakePoolFactory(state),
      manifest: schema
    });

    expect(result.columnsAdded).toBe(1);
    expect(state.queries).toContain(
      'ALTER TABLE "legacy_records" ADD COLUMN "required_code" text not null'
    );
    expect(state.queries.some((query) => query.startsWith('DROP '))).toBe(false);
  });

  it('recognizes equivalent keys and indexes under legacy names', async () => {
    const state = createState({
      tableNames: ['legacy_records', 'extra_table'],
      columns: ['id', 'owner_id', 'code', 'legacy_note'].map((column_name) => ({
        table_name: 'legacy_records',
        column_name,
        data_type: column_name === 'id' ? 'integer' : 'text',
        nullable: column_name !== 'id',
        default_sql: null,
        sequence_name: null
      })),
      constraints: [
        {
          table_name: 'legacy_records',
          constraint_name: 'legacy_pk_name',
          constraint_type: 'p',
          columns: ['id'],
          referenced_table: null,
          referenced_columns: null,
          on_delete: null,
          on_update: null
        },
        {
          table_name: 'legacy_records',
          constraint_name: 'legacy_owner_fk_name',
          constraint_type: 'f',
          columns: ['owner_id'],
          referenced_table: 'owners',
          referenced_columns: ['id'],
          on_delete: 'no action',
          on_update: 'no action'
        }
      ],
      indexes: [
        {
          table_name: 'legacy_records',
          index_name: 'legacy_code_unique',
          unique: true,
          columns: ['code'],
          method: 'btree',
          predicate: null,
          valid: true,
          default_opclass: true,
          default_order: true
        }
      ]
    });
    const schema = manifest('legacy_records', [
      {
        name: 'id',
        definitionSql: '"id" integer not null',
        type: 'integer',
        nullable: false,
        defaultSql: null,
        serial: false
      },
      {
        name: 'owner_id',
        definitionSql: '"owner_id" text',
        type: 'text',
        nullable: true,
        defaultSql: null,
        serial: false
      },
      {
        name: 'code',
        definitionSql: '"code" text',
        type: 'text',
        nullable: true,
        defaultSql: null,
        serial: false
      }
    ]);
    schema.tables[0]!.constraints = [
      { name: 'generated_pk_name', type: 'primary key', columns: ['id'] }
    ];
    schema.indexes = [
      { name: 'generated_code_unique', table: 'legacy_records', unique: true, columns: ['code'] }
    ];
    schema.foreignKeys = [
      {
        name: 'generated_owner_fk',
        table: 'legacy_records',
        columns: ['owner_id'],
        referencedTable: 'owners',
        referencedColumns: ['id'],
        onDelete: 'no action',
        onUpdate: 'no action'
      }
    ];

    const result = await initializeDatabase(databaseConfig(), {
      poolFactory: fakePoolFactory(state),
      manifest: schema
    });

    expect(result).toMatchObject({
      tablesCreated: 0,
      columnsAdded: 0,
      constraintsAdded: 0,
      indexesAdded: 0,
      warnings: []
    });
    expect(state.queries.some((query) => /^(ALTER TABLE|CREATE INDEX)/.test(query))).toBe(false);
  });

  it('rolls back when the schema lock times out', async () => {
    const state = createState({
      failQueryPrefix: 'SELECT pg_advisory_xact_lock',
      failQueryCode: '55P03'
    });

    await expect(
      initializeDatabase(databaseConfig(), {
        poolFactory: fakePoolFactory(state),
        manifest: manifest('records', [])
      })
    ).rejects.toMatchObject({ errorCode: '55P03' });
    expect(state.queries).toContain('ROLLBACK');
    expect(state.queries).not.toContain('COMMIT');
  });

  it('rolls back and reports orphaned rows when adding a foreign key', async () => {
    const state = createState({
      tableNames: ['legacy_records'],
      columns: [
        {
          table_name: 'legacy_records',
          column_name: 'id',
          data_type: 'integer',
          nullable: false,
          default_sql: null,
          sequence_name: null
        },
        {
          table_name: 'legacy_records',
          column_name: 'owner_id',
          data_type: 'integer',
          nullable: false,
          default_sql: null,
          sequence_name: null
        }
      ],
      rowExists: true,
      failQueryPrefix: 'ALTER TABLE "legacy_records" ADD CONSTRAINT "records_owner_fk"',
      failQueryCode: '23503'
    });
    const schema = manifest('legacy_records', [
      {
        name: 'id',
        definitionSql: '"id" integer not null',
        type: 'integer',
        nullable: false,
        defaultSql: null,
        serial: false
      },
      {
        name: 'owner_id',
        definitionSql: '"owner_id" integer not null',
        type: 'integer',
        nullable: false,
        defaultSql: null,
        serial: false
      }
    ]);
    schema.foreignKeys = [
      {
        name: 'records_owner_fk',
        table: 'legacy_records',
        columns: ['owner_id'],
        referencedTable: 'owners',
        referencedColumns: ['id'],
        onDelete: 'no action',
        onUpdate: 'no action'
      }
    ];

    await expect(
      initializeDatabase(databaseConfig(), {
        poolFactory: fakePoolFactory(state),
        manifest: schema
      })
    ).rejects.toMatchObject({ errorCode: '23503' });
    expect(state.queries).toContain('ROLLBACK');
    expect(state.queries).not.toContain('COMMIT');
  });

  it('refuses to invent a required value for rows already in a table and rolls back', async () => {
    const state = createState({
      tableNames: ['legacy_records'],
      columns: [
        {
          table_name: 'legacy_records',
          column_name: 'id',
          data_type: 'integer',
          nullable: false,
          default_sql: null,
          sequence_name: null
        }
      ],
      rowExists: true
    });
    const schema = manifest('legacy_records', [
      {
        name: 'id',
        definitionSql: '"id" integer not null',
        type: 'integer',
        nullable: false,
        defaultSql: null,
        serial: false
      },
      {
        name: 'required_code',
        definitionSql: '"required_code" text not null',
        type: 'text',
        nullable: false,
        defaultSql: null,
        serial: false
      }
    ]);

    await expect(
      initializeDatabase(databaseConfig(), {
        poolFactory: fakePoolFactory(state),
        manifest: schema
      })
    ).rejects.toMatchObject({ errorCode: 'REQUIRED_COLUMN_NEEDS_BACKFILL' });
    expect(state.queries).toContain('ROLLBACK');
  });

  it('redacts row values when an additive database operation fails', async () => {
    const state = createState({ failCreateCode: '23505' });
    const schema = manifest('secret_table', [
      {
        name: 'id',
        definitionSql: '"id" integer not null',
        type: 'integer',
        nullable: false,
        defaultSql: null,
        serial: false
      }
    ]);

    await expect(
      initializeDatabase(databaseConfig(), {
        poolFactory: fakePoolFactory(state),
        manifest: schema
      })
    ).rejects.toMatchObject({
      errorCode: '23505',
      message: expect.not.stringContaining('SECRET_DATABASE_VALUE')
    });
    expect(state.queries).toContain('ROLLBACK');
  });
});
