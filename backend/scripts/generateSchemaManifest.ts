import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parse, toSql } from 'pgsql-ast-parser';
import type {
  AlterTableStatement,
  CreateIndexStatement,
  CreateTableStatement,
  Statement,
  TableConstraint
} from 'pgsql-ast-parser';

interface ColumnManifest {
  name: string;
  definitionSql: string;
  type: string;
  nullable: boolean;
  defaultSql: string | null;
  serial: boolean;
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

interface TableManifest {
  name: string;
  createSql: string;
  columns: ColumnManifest[];
  constraints: Array<{ name: string; type: 'primary key'; columns: string[] }>;
}

interface SchemaManifest {
  schemaHash: string;
  tables: TableManifest[];
  indexes: IndexManifest[];
  foreignKeys: ForeignKeyManifest[];
}

const backendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const schemaPath = path.join(backendDir, 'prisma/schema.prisma');
const outputDir = path.join(backendDir, 'prisma/bootstrap/generated');
const outputPath = path.join(outputDir, 'schema-manifest.json');

function assertPublicSchema(schema: string | undefined, objectName: string): void {
  if (schema && schema !== 'public') {
    throw new Error(
      `Prisma schema generation emitted unsupported schema ${schema} for ${objectName}.`
    );
  }
}

function objectName(name: { name: string; schema?: string }): string {
  assertPublicSchema(name.schema, name.name);
  return name.name;
}

function collectIndex(statement: CreateIndexStatement, indexes: IndexManifest[]): void {
  const columns = statement.expressions.map((expression) => {
    if (
      expression.expression.type !== 'ref' ||
      expression.opclass ||
      expression.collate ||
      expression.order ||
      expression.nulls
    ) {
      throw new Error(`Unsupported Prisma index expression on ${statement.table.name}.`);
    }
    return expression.expression.name;
  });
  if (statement.where || statement.using || statement.with?.length) {
    throw new Error(`Unsupported Prisma index options on ${statement.table.name}.`);
  }
  indexes.push({
    name: statement.indexName?.name ?? '',
    table: objectName(statement.table),
    unique: statement.unique === true,
    columns
  });
}

function addForeignKey(
  tableName: string,
  constraint: Extract<TableConstraint, { type: 'foreign key' }>,
  foreignKeys: ForeignKeyManifest[]
): void {
  assertPublicSchema(constraint.foreignTable.schema, constraint.foreignTable.name);
  if (!constraint.constraintName?.name) {
    throw new Error(`Prisma generated an unnamed foreign key on ${tableName}.`);
  }
  foreignKeys.push({
    name: constraint.constraintName.name,
    table: tableName,
    columns: constraint.localColumns.map((column) => column.name),
    referencedTable: constraint.foreignTable.name,
    referencedColumns: constraint.foreignColumns.map((column) => column.name),
    onDelete: constraint.onDelete ?? 'no action',
    onUpdate: constraint.onUpdate ?? 'no action'
  });
}

function collectTable(
  statement: CreateTableStatement,
  tables: TableManifest[],
  foreignKeys: ForeignKeyManifest[]
): void {
  const name = objectName(statement.name);
  const columns: ColumnManifest[] = [];
  const primaryAndUnique: Array<{ name: string; type: 'primary key'; columns: string[] }> = [];

  for (const column of statement.columns) {
    if (column.kind !== 'column') {
      throw new Error(`Unsupported Prisma table definition on ${name}.`);
    }
    const defaultConstraint = column.constraints?.find(
      (constraint) => constraint.type === 'default'
    );
    const isNullable = !column.constraints?.some((constraint) => constraint.type === 'not null');
    columns.push({
      name: column.name.name,
      definitionSql: toSql.createColumn(column),
      type: toSql.dataType(column.dataType),
      nullable: isNullable,
      defaultSql:
        defaultConstraint && defaultConstraint.type === 'default'
          ? toSql.expr(defaultConstraint.default)
          : null,
      serial: column.dataType.kind === undefined && /^\w*serial$/i.test(column.dataType.name)
    });
    for (const constraint of column.constraints ?? []) {
      if (constraint.type === 'reference') {
        throw new Error(`Unsupported inline foreign key emitted for ${name}.${column.name.name}.`);
      }
      if (constraint.type === 'primary key') {
        primaryAndUnique.push({
          name: constraint.constraintName?.name ?? `${name}_pkey`,
          type: 'primary key',
          columns: [column.name.name]
        });
      }
      if (constraint.type === 'unique') {
        throw new Error(
          `Prisma emitted an inline unique constraint on ${name}.${column.name.name}.`
        );
      }
    }
  }

  for (const constraint of statement.constraints ?? []) {
    if (constraint.type === 'foreign key') {
      addForeignKey(name, constraint, foreignKeys);
    } else if (constraint.type === 'primary key') {
      primaryAndUnique.push({
        name: constraint.constraintName?.name ?? `${name}_pkey`,
        type: 'primary key',
        columns: constraint.columns.map((column) => column.name)
      });
    } else if (constraint.type === 'unique') {
      throw new Error(`Prisma emitted an inline unique constraint on ${name}.`);
    } else {
      throw new Error(`Prisma emitted an unsupported table constraint on ${name}.`);
    }
  }

  tables.push({
    name,
    createSql: toSql.statement(statement),
    columns,
    constraints: primaryAndUnique
  });
}

function collectAlterTable(
  statement: AlterTableStatement,
  foreignKeys: ForeignKeyManifest[]
): void {
  const tableName = objectName(statement.table);
  for (const change of statement.changes) {
    if (change.type !== 'add constraint' || change.constraint.type !== 'foreign key') {
      throw new Error(`Unsupported Prisma ALTER TABLE operation on ${tableName}.`);
    }
    addForeignKey(tableName, change.constraint, foreignKeys);
  }
}

function main(): void {
  const result = spawnSync(
    'bun',
    [
      'run',
      'prisma',
      'migrate',
      'diff',
      '--from-empty',
      '--to-schema',
      'prisma/schema.prisma',
      '--config',
      'prisma.bootstrap.config.ts',
      '--script'
    ],
    { cwd: backendDir, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }
  );
  if (result.error || result.status !== 0) {
    const detail = result.stderr?.trim() || result.error?.message || 'Prisma schema diff failed.';
    throw new Error(detail);
  }

  const ddlStart = result.stdout.indexOf('-- CreateSchema');
  if (ddlStart < 0) {
    throw new Error('Prisma schema diff did not contain the expected DDL.');
  }
  const statements: Statement[] = parse(result.stdout.slice(ddlStart));
  const tables: TableManifest[] = [];
  const indexes: IndexManifest[] = [];
  const foreignKeys: ForeignKeyManifest[] = [];

  for (const statement of statements) {
    switch (statement.type) {
      case 'create schema':
        if (statement.name.name !== 'public') {
          throw new Error(
            `Prisma schema generation emitted unsupported schema ${statement.name.name}.`
          );
        }
        break;
      case 'create table':
        collectTable(statement, tables, foreignKeys);
        break;
      case 'create index':
        collectIndex(statement, indexes);
        break;
      case 'alter table':
        collectAlterTable(statement, foreignKeys);
        break;
      default:
        throw new Error(`Prisma generated unsupported SQL statement: ${statement.type}.`);
    }
  }

  if (tables.length === 0) {
    throw new Error('Prisma schema diff did not contain any tables.');
  }

  const schema = readFileSync(schemaPath);
  const manifest: SchemaManifest = {
    schemaHash: createHash('sha256').update(schema).digest('hex'),
    tables,
    indexes,
    foreignKeys
  };
  mkdirSync(outputDir, { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.info(`Generated database schema manifest for ${tables.length} tables.`);
}

main();
