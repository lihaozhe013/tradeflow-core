# Agent Instructions

TradeFlow Core is a Bun workspace with a React/Vite frontend, an Express/Prisma/PostgreSQL backend,
and a Python build helper. Start with [docs/AGENT_MAP.md](docs/AGENT_MAP.md) to find the owning
code; verify behavior in source rather than treating documentation as an API contract.

## Repository rules

- Write code comments, internal messages, documentation, and commit messages in English. Localized
  UI text belongs in the existing frontend locale resources. Add comments only for non-obvious
  constraints or behavior.
- Use Bun 1.4.2 for workspace dependencies and scripts. Node.js 26+ is required by development and
  build tools; production runs on Bun. Update the owning `package.json` and root `bun.lock`
  together. Do not use npm, pnpm, or Yarn for repository dependencies.
- Keep browser code in `frontend/` and server/database code in `backend/`. The frontend must not
  import Node.js, Prisma, filesystem, or backend modules. Use the existing request, auth, config,
  routing, and i18n boundaries.
- Keep backend TypeScript strict. The frontend has a relaxed compatibility baseline; improve types
  locally without changing that baseline as a side effect. Validate external input at its runtime
  boundary, especially API data, imports, configuration, and authentication data.
- Do not edit generated Prisma client output or `node_modules/`. Review schema changes for data
  compatibility. Use `config-example/` for public templates; `config/`, `cache/`, and
  `backend/test-config/` contain ignored runtime data.
- Keep operational logs in the existing backend logger and separate from database audit records.
  Never log credentials, tokens, private trade data, or other unnecessary sensitive content.
- Preserve unrelated working-tree changes. Never commit unless asked; use an English Conventional
  Commit message when asked. Do not put task plans or temporary findings in this file.

## Commands and checks

- Install from the root with `bun install`; generate Prisma client with
  `bun run --cwd backend prisma:generate` when needed.
- Run backend lint with `bun run --cwd backend lint` after backend changes. Run frontend type
  checking with `bun run --cwd frontend type-check` after frontend changes. Use the narrowest
  relevant tests; run `bun run build` for build or cross-workspace integration changes.
- Run the repository suite with `bun run test`, not `bun test`. It prepares the isolated
  `tradeflow_e2e` database and runs backend Vitest plus frontend Playwright. Review
  [docs/AGENT_MAP.md](docs/AGENT_MAP.md) before any database setup or seed command.
- Use `bun run dev` for both servers; it refreshes ignored `debug.log` and mirrors output to the
  terminal. Use `uv run build.py` for the build helper. The build replaces generated assets and
  output, so inspect its effects before running it in a dirty tree.
- Follow the existing Prettier configuration. Avoid running the root `bun run format` on a narrow
  documentation change because it rewrites the entire repository; format only touched files.
