# TradeFlow Core

TradeFlow Core is a React/Vite browser app with an Express/Prisma/PostgreSQL API. The workspace uses
Bun for dependencies and scripts, Node.js for development and build tooling, and `uv` for the Python
build helper.

For repository rules and task entry points, read [AGENTS.md](AGENTS.md) and
[docs/AGENT_MAP.md](docs/AGENT_MAP.md).

## Setup

Requires Bun 1.4.2, Node.js 26+, `uv`, and PostgreSQL. Copy `config-example/` into the matching
ignored runtime locations and set local database credentials. `build-config/` supplies build inputs.

```bash
bun run install:all
bun run dev
```

`bun run dev` starts the API and browser app and writes a fresh ignored `debug.log`.

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
