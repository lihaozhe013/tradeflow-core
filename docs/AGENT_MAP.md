# Agent Map

Use this file to find the source of truth, then inspect the code and tests for the task at hand.
Avoid maintaining route inventories or copied data flows here.

| Task                                     | Start here                                                                                     |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------- |
| API routes, authentication, permissions  | `backend/app.ts`, then `backend/routes/` and `backend/utils/auth.ts`                           |
| Database model or generated client       | `backend/prisma/schema.prisma`, `backend/prismaClient.ts`, `backend/prisma/client.ts`          |
| Inventory effects of purchases and sales | `backend/routes/inbound.ts`, `backend/routes/outbound.ts`, `backend/utils/inventoryService.ts` |
| Analysis or spreadsheet export           | `backend/routes/analysis/`, `backend/routes/export/`                                           |
| Browser routes and permissions           | `frontend/src/App.tsx`, `frontend/src/auth/`                                                   |
| Browser API calls and localized text     | `frontend/src/utils/request.ts`, `frontend/src/hooks/`, `frontend/src/i18n/locales/`           |
| Runtime configuration and build inputs   | `backend/utils/paths.ts`, `config-example/`, `build-config/`, `scripts/build/`                 |
| Test setup and examples                  | `scripts/test*.mjs`, `backend/test/`, `frontend/e2e/`                                          |

## Easy-to-miss constraints

- `backend/server.ts` only starts the app. Route registration and global middleware are in
  `backend/app.ts`; route files define endpoint behavior. The browser uses hash routing.
- Inventory is derived from inbound and outbound records through the inventory service. Changes to
  either transaction path must account for the inventory ledger and the full recalculation path.
- `backend/utils/paths.ts` resolves runtime configuration and cache locations. Local `config/` and
  `cache/` contents are ignored; `config-example/` is the tracked template.
- The root test scripts use `backend/test-config/config.yaml` and require its database name to be
  `tradeflow_e2e`. `scripts/init_postgres.sql` drops the default `tradeflow` database; never use it
  for test setup. `bun run test:setup` prepares the isolated test database.
- `bun run build` invokes `build.py`; it recreates `dist/`, copies the logo into `frontend/public/`,
  and regenerates the Prisma client. Review the build script before changing these generated paths.
