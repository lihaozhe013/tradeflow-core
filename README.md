# Tradeflow Core

A lightweight tradeflow system designed for small businesses, built with a React frontend and a Bun
backend backed by PostgreSQL.

## Quick Start

### Prerequisites

- Bun 1.4.2
- Node.js 26+ for development and build tooling
- Python/uv (for build script)
- PostgreSQL
- Docker (Optional)

### Docker-Based Deployment

1. **Copy necessary files**

- Download and put `compose.yaml` from the root directory and the `config-example/config/`
  directory, and put them in the root directory in your production environment

2. **Setup PostgreSQL**

- Use `scripts/init_postgres.sql` to initialize the database, your database name, password and
  username should match the information inside the `config.yaml` file.

3. **Start Server**

```bash
docker compose pull
docker compose up -d
```

### Manual Build

1.  **Clone the project**:

```bash
git clone [https://github.com/lihaozhe013/tradeflow-core.git](https://github.com/lihaozhe013/tradeflow-core.git)
cd tradeflow-core
```

2.  **Install dependencies**:

```bash
bun run install:all
```

3.  **Set up configuration**:

```bash
# Copy the example configuration files
cp -r config-example/* .
```

4.  **Customize the build-config files**

- `about.json`: Customize your company info
- `exportConfig`: Customize your export format. You can change the order of columns, the column
  name, or add a customized column in this file
- `frontendConfig.json`: Customize frontend options

4.  **Build**:

> Note: I use `uv run` instead of `python` because the `python` command is incompatible across
> different systems. It is strongly recommended to use `uv`. If you prefer not to use `uv`, run
> `python build.py` or `python3 build.py` directly.

```bash
bun run build
```

or

```bash
python3 build.py
```

### Development

1.  **Start the development servers**:

```bash
# Start the dev server()
bun run dev
```

### Dependency Updates

Run `bun outdated -r` from the repository root to review all workspaces. Run `bun update -r` to
refresh dependencies within their declared ranges and update `bun.lock`. For a new major version,
change the relevant manifest range only after its stable release is available; keep prereleases out.
Verify the result with `bun install --frozen-lockfile`, the checks below, and `bun run build`.

### Testing

The project test command runs the complete backend Vitest suite first, reseeds the isolated E2E
database, and then runs the frontend in a visible Chromium window through Playwright. If any stage
fails, later stages do not run.

Use `bun run test` to run the project suites. `bun test` invokes Bun's native test runner, which
bypasses the database setup and is not compatible with the Vitest and Playwright test files in this
repository. It exits with a message directing you to the project test command.

1. Run a test command once to create the local test configuration automatically from the example:

```bash
bun run test
```

If the configuration was created during this run, set its PostgreSQL credentials and rerun the
command:

```bash
nvim backend/test-config/config.yaml
bun run test
```

The test configuration must keep `dbName` set to `tradeflow_e2e` and `server.httpPort` set to
`18080`. The setup command creates only that database when it is missing and applies the Prisma
schema without dropping data. The PostgreSQL user needs `CREATEDB`; otherwise create an empty
`tradeflow_e2e` database manually and rerun the command. The regular `scripts/init_postgres.sql`
script drops the default `tradeflow` database and must not be used for E2E setup.

2. Prepare the test database and install the Playwright Chromium browser once:

```bash
bun run test:setup
cd frontend && bunx playwright install chromium
```

3. Run all backend and frontend tests. The browser suite exercises every application page and its
   main UI actions in English, including CRUD, filters, batch operations, payments, reports,
   exports, permissions, and narrow-screen layouts:

```bash
bun run test
```

To run only browser E2E tests, use `bun run test:e2e`. Playwright opens a visible Chromium window by
default. Set `TRADEFLOW_E2E_HEADLESS=true` to run it without a visible window. Playwright reports
are written to `frontend/playwright-report/`; failure traces and screenshots are written to
`frontend/test-results/`.
