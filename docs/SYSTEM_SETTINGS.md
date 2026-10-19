# Database system settings

Business settings are stored in `public.system_settings`. The backend initializes missing sections
only, after schema bootstrap and before listening for requests. Restarting or rebuilding does not
replace existing settings. Backend defaults are generic initialization data, not deployment inputs.

Superusers manage five sections at `/#/settings`: currency display, payment methods, product
categories, About content, and 23 spreadsheet templates. About itself is also superuser-only.
Authenticated business users receive only currency, option lists, and defaults through
`GET /api/settings/runtime`. Authentication-disabled mode retains its editor identity and cannot
access the settings editor or About.

The settings API uses versioned writes. A stale update returns HTTP 409 and leaves its draft intact.
Reloading a conflicting section explicitly discards only that section's draft. Successful changes
and metadata-only audit entries commit together. Audit entries never copy setting values.

Currency symbols affect displays only. Existing numeric amounts are not converted. Removed or
renamed dictionary labels remain on historical records and are available when those records are
edited. Category filtering includes historical database values. Business records retain their
existing text representation; no historical data rewrite or dictionary foreign keys are added.

Each export reads one complete template snapshot. Column keys and label keys are limited to the
backend catalog. Columns can be reordered, hidden, removed, and restored from that catalog; at least
one column must remain visible. Formatting and calculations remain application code.

## Build inputs

Both `build-config/` and its tracked example contain only:

- `frontendConfig.json`: build-time frontend authentication preferences and server URL.
- `logo.svg`: build-time branding.

Database connection, backend authentication, and server configuration remain in runtime YAML.
Currency is no longer read from YAML. Runtime business settings are not bundled into the browser.

## Import an existing deployment

Keep an untouched copy of the old build-config directory containing all three JSON files before
removing it from deployment build inputs. Generate SQL locally using Bun; no database connection or
database credential is needed for generation:

```sh
bun run settings:export-legacy --source-dir /absolute/path/to/legacy-build-config --output /absolute/path/to/import-system-settings.sql --database DATABASE_NAME
```

Generation validates every section and preserves configured labels, Unicode, template column order,
omitted or hidden columns, and supported `receipt_number` columns. It refuses to overwrite an
existing output file. The output contains deployment configuration and should remain outside version
control.

Import before starting the new version. In a psql session connected to the intended database:

```sql
\connect DATABASE_NAME
SELECT current_database();
\i /absolute/path/to/import-system-settings.sql
```

The required `--database` argument binds the SQL to the application database named in runtime
`config.yaml` (`database.dbName`). A default `postgres=#` prompt normally means the maintenance
database, which is not the business database. The script refuses a mismatched connection before any
DDL or data changes and includes the database name in its result summary.

The script enables `ON_ERROR_STOP`, takes the schema bootstrap advisory lock, creates only the
settings table if needed, and imports all five sections in one transaction. Identical existing
values are skipped without changing versions or timestamps. Any differing section aborts the whole
transaction. Check the final section/version summary and the five sections in the UI.

If the new version has already initialized defaults, or replacement is intentional, generate a
separate replacement script:

```sh
bun run settings:export-legacy --source-dir /absolute/path/to/legacy-build-config --output /absolute/path/to/replace-system-settings.sql --database DATABASE_NAME --replace-existing
```

Before replacing customized settings, back up the table:

```sh
pg_dump --data-only --table=public.system_settings --file=/absolute/path/to/settings-before-import.sql DATABASE_NAME
```

Apply the replacement file through psql. Changed sections increment their versions, invalidating
stale editor drafts. Unchanged sections retain their versions. If an interactive import fails, issue
`ROLLBACK;` before continuing that psql session.

Then deploy the backend and frontend together and verify the runtime currency, option defaults,
About content, and a spreadsheet export. Other open browser sessions refresh runtime preferences
when their window regains focus. An already-open business form retains its entered values.

For rollback, stop the new application before restoring table data from the backup. The schema
addition does not alter business tables. Reverting to an older application version also requires its
original build-config files, retained in the deployment archive.

## Recreate the settings table from legacy configuration

To deliberately discard current system settings and restore all five legacy sections, generate:

```sh
bun run settings:export-legacy --source-dir /absolute/path/to/legacy-build-config --output /absolute/path/to/restore-system-settings.sql --database DATABASE_NAME --recreate-table
```

Connect psql to `DATABASE_NAME` before including the SQL file. The database guard runs before
`DROP TABLE IF EXISTS public.system_settings`. Only that table is dropped, without `CASCADE`, and
its recreation and import are in the same transaction. Business tables, accounts, and audit logs are
preserved. A failed import rolls back the table replacement. Recreated rows start at version 1;
refresh all open settings editor pages afterward. This mode cannot be combined with
`--replace-existing`.

After import, verify the target database and effective currency:

```sql
SELECT current_database(), value->>'currency_unit_symbol' AS currency
FROM public.system_settings WHERE section = 'general';
```

If an earlier script was imported into `postgres`, leave that unrelated table alone and import into
the actual application database. The application never reads settings across database boundaries.
