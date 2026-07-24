# AGENTS.md

## Project overview

`tradeflow-core` is a monorepo with separate frontend and backend packages. Each has its own dependencies, build tooling, and config — never mix them.

| Directory | Stack | Package Manager |
|---|---|---|
| `backend/` | Express + TypeScript + Prisma (Node.js API server) | pnpm |
| `frontend/` | React 19 + Vite + TypeScript (SPA) | pnpm |
| Root | Monorepo scripts (dev, build, format) | pnpm |

The backend and frontend are completely independent. Their `node_modules`, tooling, and scripts live in their own directories. Do **not** install frontend dependencies in `backend/` or vice versa.

## Package manager

Always use **pnpm**. Running `npm` or `yarn` is blocked by a `preinstall` lifecycle script in each `package.json`.

## Backend (`backend/`)

### Linting

Eslint (`eslint.config.mjs`, flat config) is **mandatory** for the backend. Before submitting changes, run:

```sh
pnpm lint
```

from the `backend/` directory. There must be **zero eslint errors**. Warnings are tolerated but should be addressed if practical.

Key lint rules in effect:
- `no-console` is `warn` (only `console.warn`, `console.error`, `console.info` are allowed).
- `@typescript-eslint/no-unused-vars` is `error` (vars prefixed with `_` are ignored).
- `@typescript-eslint/no-explicit-any` is `off`.

### TypeScript

The backend tsconfig is at `backend/tsconfig.json`. TypeScript compilation is part of the ESLint pipeline via `typescript-eslint`. Ensure `tsc` passes before committing.

## Frontend (`frontend/`)

### Type checking

Eslint is **not mandatory** for the frontend — the eslint config is intentionally relaxed for fast iteration. The required check is:

```sh
pnpm type-check
```

from the `frontend/` directory. `tsc --noEmit` must pass with **zero errors**.

### Linting (optional)

Eslint can be run with `pnpm lint` in `frontend/`, but it is not a gate. Focus on `tsc` correctness.

## Search tools

Prefer **`rg`** (ripgrep) over `grep` and **`fd`** over `find`. Both are assumed to be available on the system.

## Code style

- Follow the Prettier config in `.prettierrc` at the repo root (single quotes, semicolons, trailing commas, 2-space indent, 80 chars).
- Run `pnpm format` from the repo root before committing.
- Do **not** write unnecessary comments. Comments that explain *what* obvious code does are noise. Write comments only when they explain *why* something is done in a non-obvious way.
- All comments and log messages must be in **English**.
- Do **not** use emoji in log messages, console output, error messages, or comments.

## Git

- **Never commit unless explicitly asked to.**
- When you are asked to commit, write a concise, descriptive commit message in English following the repo's existing style.
- Do not amend commits, force-push, or skip hooks unless explicitly instructed.

## Before submitting changes

1. In `backend/`: `pnpm lint` — zero errors.
2. In `frontend/`: `pnpm type-check` — zero errors.
3. At repo root: `pnpm format` (optional but recommended).

## Other conventions

- Keep file changes minimal and focused on the task. Do not refactor unrelated code.
- When adding a new dependency, install it in the correct sub-project (`backend/` or `frontend/`), never in the root unless it is a repo-wide tool.
- The build system uses `uv run build.py` at the root (Python). Do not modify `build.py` or the `build-config/` directory unless the task specifically involves the build pipeline.
- Environment variables and config files live in `config/` (git-ignored). Use `config-example/` as a reference.
- Database migrations are managed via Prisma in `backend/prisma/`.
