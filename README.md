# Tradeflow Core

A lightweight tradeflow system designed for small businesses, built with React.js based frontend and Node.js + PostgreSQL based backend.

## Quick Start

### Prerequisites

- Node.js 24+ (Always based on latest LTS version)
- pnpm
- Python/uv (for build script)
- PostgreSQL
- Docker (Optional)

### Docker-Based Deployment

1. **Copy necessary files**

- Download and put `compose.yaml` from the root directory and the `config-example/config/` directory, and put them in the root directory in your production environment

2. **Setup PostgreSQL**

- Use `scripts/init_postgres.sql` to initialize the database, your database name, password and username should match the information inside the `config.yaml` file.

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
- `exportConfig`: Customize your export format. You can change the order of columns, the column name, or add a customized column in this file
- `frontendConfig.json`: Customize frontend options

4.  **Build**:

> Note: I use `uv run` instead of `python` because the `python` command is incompatible across different systems. It is strongly recommended to use `uv`. If you prefer not to use `uv`, you can modify the `pnpm build` command yourself to `python build.py` or `python3 build.py`.

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
