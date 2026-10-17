# Database snapshots

Overview statistics and receivable/payable invoiced summaries are stored in PostgreSQL. Opening or
reloading a page reads the last saved result. Only an explicit refresh recalculates and replaces it.
Business record changes do not automatically invalidate or regenerate snapshots.

`overview_snapshots` stores one complete overview under `global`. `invoice_snapshots` stores one
result per direction and partner code. Both keep JSONB data and the last successful refresh time,
without expiration or history. An empty saved result is different from an absent snapshot.

Refreshes calculate and write inside a Repeatable Read transaction with a 60-second timeout. A
transaction advisory lock rejects overlapping refreshes for the same scope with HTTP 409. Failures
roll back and preserve the previous result and timestamp. All reads query the database; there is no
process-local business snapshot store.

Existing API paths and business response fields remain available. Overview responses now include
`last_updated`. Missing overview snapshots return HTTP 503; missing invoice snapshots return
HTTP 404. Both include `code: SNAPSHOT_NOT_READY`. Invoice pagination reads the saved result, not
live transactions. Authentication and authorization continue to use the existing rules.

Analysis remains a live query. Inventory and its ledger retain their existing database update and
recalculation behavior, including the live inventory cost estimate.

## Upgrade

1. Run `bun run --cwd backend prisma:generate` with the locally installed Bun and build the
   application. The generated schema manifest allows the existing startup bootstrap to add the two
   snapshot tables and their constraints before accepting requests. Existing business tables are not
   rebuilt.
2. Start the new backend. Legacy JSON results are not imported. Users must explicitly refresh each
   desired scope the first time. No background or startup generation occurs.
3. From the runtime working directory, run the source helper with
   `bun run <absolute-path-to-backend>/scripts/cleanupLegacySnapshots.ts`. It removes only
   `overview-stats.json` and `invoice-cache.json` from the resolved legacy cache locations, and
   `invoice-cache.json` from the resolved configuration directory. Run it for each separate runtime
   directory that previously stored these files. Set `TRADEFLOW_CONFIG_DIR` as for the deployment.

The cleanup helper does not remove directories or `jwt-secret.txt`. Keep the existing JWT secret to
preserve valid login tokens. Do not delete the entire `cache/` directory.

For validation, use `bun run test`, which prepares only the isolated `tradeflow_e2e` database. The
test reset includes the snapshot tables, so earlier results cannot leak between suite runs.
