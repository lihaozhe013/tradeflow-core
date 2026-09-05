# AGENTS.md Rewrite Plan

## Objective

Rewrite the repository-level `AGENTS.md` so it describes the current TradeFlow
Core repository accurately, keeps the project overview concise, removes
references to project-maintained API and data-flow documents, and incorporates
the requested language, dependency, TypeScript, logging, code organization,
safety, and validation constraints.

## Scope

- Update only the repository policy in `AGENTS.md`.
- Keep the overview of the root scripts, `backend/`, `frontend/`, and build
  tooling to one short paragraph.
- Retain commands and rules that match the current pnpm monorepo, Express/
  Prisma backend, React/Vite frontend, and Python build helper.
- Adapt Electron-specific logging language to this Node.js server and browser
  application instead of adding unsupported runtime requirements.
- Avoid changing source code, package manifests, lockfiles, or unrelated
  working-tree changes.

## Validation

- Inspect the final diff for accidental edits outside the plan scope.
- Check that the rewritten policy does not require files, scripts, or compiler
  settings that are absent from the repository.
- Confirm that Markdown headings, commands, and language constraints are
  internally consistent.
