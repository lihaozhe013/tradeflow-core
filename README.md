# TradeFlow Core

TradeFlow Core is a React/Vite browser app with an Express/Prisma/PostgreSQL API. The workspace uses
Bun for dependencies and scripts, Node.js for development and build tooling, and `uv` for the Python
build helper.

For repository rules and task entry points, read [AGENTS.md](AGENTS.md) and
[docs/AGENT_MAP.md](docs/AGENT_MAP.md).

For Agent access to business data, see [the read-only MCP service](docs/MCP.md) and the portable
[TradeFlow MCP skill](skills/tradeflow-mcp/SKILL.md). The skill includes manual connection
instructions for OpenCode and WorkBuddy without requiring the desktop assistant.

## Setup

Requires Bun 1.4.2, Node.js 26+, `uv`, and PostgreSQL. Copy `config-example/` into the matching
ignored runtime locations and set local database credentials. `build-config/` supplies build inputs.

```bash
bun run install:all
bun run dev
```

`bun run dev` starts the API and browser app and writes a fresh ignored `debug.log`.

Before accepting requests, the backend creates the configured PostgreSQL database when permitted and
adds missing tables, columns, and constraints from the Prisma schema. Existing data and extra
columns are kept. Startup stops with a redacted actionable error when safe additive setup is not
possible. The configured PostgreSQL role needs permission to create objects in the `public` schema;
it also needs permission to create the database when the target database is missing. If a required
column has no database default and its table already contains rows, backfill it manually before
restarting.

## Build and test

```bash
bun run build
bun run test
```

`bun run build` invokes `uv run build.py` and recreates generated output. The test command creates
`backend/test-config/config.yaml` from the example if missing; set its local PostgreSQL credentials
and rerun. Tests require the isolated `tradeflow_e2e` database and Playwright Chromium. Install the
browser once with `cd frontend && bunx playwright install chromium`. Use `bun run test:e2e` for the
browser suite alone. Do not use `bun test` or `scripts/init_postgres.sql` for test setup.

## Manual translation check

Run `bun run check:i18n` occasionally to find translation gaps. This read-only command prints
missing keys by language, keys referenced in code but absent from all applicable languages, empty or
invalid values, and object/string structure conflicts. Reports include locale file paths, known
source locations, and existing translations as references for manual completion. Web resources
require Chinese, English, and Korean; desktop-only `desktopConnect` resources require Chinese and
English.

The source scan recognizes the project's `t` calls (including typed component props), aliases from
`useTranslation`, `i18n.t` calls, and desktop resource property accesses. Unresolved dynamic
expressions are listed for manual review and do not fail the check. This is a static completeness
check, not a translation-quality or hardcoded-text check; identical text across languages is
allowed. It does not change locale files or run as part of tests, builds, or CI. When adding
languages, update the locale configuration at the top of `scripts/check-i18n.mjs`.

Exit codes are `0` for no definite gaps, `1` for missing or invalid translations, and `2` for file,
JSON, or source parsing errors. Run the checker's own isolated tests manually with
`node --test scripts/check-i18n.test.mjs`; no database or browser is required.
