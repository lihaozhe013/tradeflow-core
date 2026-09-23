# Tradeflow Core

A lightweight tradeflow system designed for small businesses, built with React.js based frontend and
Node.js + PostgreSQL based backend.

## Quick Start

### Prerequisites

- Node.js 24+ (Always based on latest LTS version)
- pnpm
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
pnpm install:all
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
> different systems. It is strongly recommended to use `uv`. If you prefer not to use `uv`, you can
> modify the `pnpm build` command yourself to `python build.py` or `python3 build.py`.

```bash
pnpm build
```

or

```bash
python3 build.py
```

### Development

1.  **Start the development servers**:

```bash
# Start the dev server()
pnpm dev
```

### Testing

The project test command runs the complete backend Vitest suite first, reseeds the isolated E2E
database, and then runs the frontend in a visible Chromium window through Playwright. If any stage
fails, later stages do not run.

1. Create the local test configuration and set its PostgreSQL credentials:

```bash
mkdir -p backend/test-config
cp config-example/config/config.e2e.yaml backend/test-config/config.yaml
```

The test configuration must keep `dbName` set to `tradeflow_e2e` and `server.httpPort` set to
`18080`. The setup command creates only that database when it is missing and applies the Prisma
schema without dropping data. The PostgreSQL user needs `CREATEDB`; otherwise create an empty
`tradeflow_e2e` database manually and rerun the command. The regular `scripts/init_postgres.sql`
script drops the default `tradeflow` database and must not be used for E2E setup.

2. Prepare the test database and install the Playwright Chromium browser once:

```bash
pnpm test:setup
pnpm --dir frontend exec playwright install chromium
```

3. Run all backend and frontend tests. The browser suite exercises every application page and its
   main UI actions in English, including CRUD, filters, batch operations, payments, reports,
   exports, permissions, and narrow-screen layouts:

```bash
pnpm test
```

To run only browser E2E tests, use `pnpm test:e2e`. Playwright opens a visible Chromium window by
default. Set `TRADEFLOW_E2E_HEADLESS=true` to run it without a visible window. Playwright reports
are written to `frontend/playwright-report/`; failure traces and screenshots are written to
`frontend/test-results/`.
