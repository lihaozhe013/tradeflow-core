# AGENTS.md

## Reference docs (look here first)

When you need to look up an API endpoint or trace how data moves through the
system, **start with these two documents at the repo root**:

- **`docs/API_CATALOG.md`** — directory-style listing of every backend HTTP
  endpoint (method, path, auth requirement, source file). No prose — pick the
  row, then open the linked source file for the implementation.
- **`docs/DATA_FLOW.md`** — how data moves: inbound/outbound writes, inventory
  recompute, pricing lookup, receivable/payable balances, invoice cache,
  overview/analysis caches, auth flow, frontend → backend roundtrip. Uses
  Mermaid diagrams where useful.

**These docs may not always be the latest.** Code is the source of truth. Use
the docs to navigate quickly; if a doc disagrees with reality, open the
corresponding route/service file (paths are listed in `docs/API_CATALOG.md` and
`docs/DATA_FLOW.md`) and resolve the discrepancy yourself.

## Project overview

`tradeflow-core` is a monorepo with separate frontend and backend packages. Each
has its own dependencies, build tooling, and config — never mix them.

| Directory   | Stack                                              | Package Manager |
| ----------- | -------------------------------------------------- | --------------- |
| `backend/`  | Express + TypeScript + Prisma (Node.js API server) | pnpm            |
| `frontend/` | React 19 + Vite + TypeScript (SPA)                 | pnpm            |
| Root        | Monorepo scripts (dev, build, format)              | pnpm            |

The backend and frontend are completely independent. Their `node_modules`,
tooling, and scripts live in their own directories. Do **not** install frontend
dependencies in `backend/` or vice versa.

## Package manager

Always use **pnpm**. Running `npm` or `yarn` is blocked by a `preinstall`
lifecycle script in each `package.json`.

## Backend (`backend/`)

### Linting

Eslint (`eslint.config.mjs`, flat config) is **mandatory** for the backend.
Before submitting changes, run:

```sh
pnpm lint
```

from the `backend/` directory. There must be **zero eslint errors**. Warnings
are tolerated but should be addressed if practical.

Key lint rules in effect:

- `no-console` is `warn` (only `console.warn`, `console.error`, `console.info`
  are allowed).
- `@typescript-eslint/no-unused-vars` is `error` (vars prefixed with `_` are
  ignored).
- `@typescript-eslint/no-explicit-any` is `off`.

### TypeScript

The backend tsconfig is at `backend/tsconfig.json`. TypeScript compilation is
part of the ESLint pipeline via `typescript-eslint`. Ensure `tsc` passes before
committing.

## Frontend (`frontend/`)

### Type checking

Eslint is **not mandatory** for the frontend — the eslint config is
intentionally relaxed for fast iteration. The required check is:

```sh
pnpm type-check
```

from the `frontend/` directory. `tsc --noEmit` must pass with **zero errors**.

### Linting (optional)

Eslint can be run with `pnpm lint` in `frontend/`, but it is not a gate. Focus
on `tsc` correctness.

## Search tools

Prefer **`rg`** (ripgrep) over `grep` and **`fd`** over `find`. Both are assumed
to be available on the system.

## Code style

- Follow the Prettier config in `.prettierrc` at the repo root (single quotes,
  semicolons, trailing commas, 2-space indent, 80 chars).
- Run `pnpm format` from the repo root before committing.
- Do **not** write unnecessary comments. Comments that explain _what_ obvious
  code does are noise. Write comments only when they explain _why_ something is
  done in a non-obvious way.
- All comments and log messages must be in **English**.
- Do **not** use emoji in log messages, console output, error messages, or
  comments.

## Git

- **Never commit unless explicitly asked to.**
- When you are asked to commit, write a concise, descriptive commit message in
  English following the repo's existing style.
- Do not amend commits, force-push, or skip hooks unless explicitly instructed.

## Before submitting changes

1. In `backend/`: `pnpm lint` — zero errors.
2. In `frontend/`: `pnpm type-check` — zero errors.
3. At repo root: `pnpm format` (optional but recommended).

## Other conventions

- Keep file changes minimal and focused on the task. Do not refactor unrelated
  code.
- When adding a new dependency, install it in the correct sub-project
  (`backend/` or `frontend/`), never in the root unless it is a repo-wide tool.
- The build system uses `uv run build.py` at the root (Python). Do not modify
  `build.py` or the `build-config/` directory unless the task specifically
  involves the build pipeline.
- Environment variables and config files live in `config/` (git-ignored). Use
  `config-example/` as a reference.
- Database migrations are managed via Prisma in `backend/prisma/`.

## Workflow

### Plan-first approach

For any non-trivial task, follow this workflow:

1. **Write a plan first** — Before making changes, create a detailed plan
   document in `docs/reference/`. This ensures the approach is clear and agreed
   upon before implementation begins.
2. **Implement the plan** — Execute the changes according to the plan document.
3. **Archive the plan** — After successful implementation, move the plan from
   `docs/reference/` to `docs/archive/`. This should only be done when the user
   explicitly requests it — do not archive automatically.
