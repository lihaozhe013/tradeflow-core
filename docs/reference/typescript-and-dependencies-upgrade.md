# TypeScript and dependency upgrade plan

## Objective

Upgrade every workspace package from the current TypeScript 6.0.x dependency to
TypeScript 7.0.2, then use pnpm to identify and upgrade outdated direct
dependencies to their latest compatible releases.

## Scope

- Root workspace package and lockfile.
- `backend/` package and lockfile.
- `frontend/` package and lockfile.
- Existing uncommitted changes will be preserved and incorporated; unrelated
  source refactors are out of scope.

## Approach

1. Inspect package manifests, lockfiles, TypeScript configuration, and the
   current worktree diff.
2. Run `pnpm outdated` in the root, backend, and frontend packages to capture
   current, wanted, and latest versions.
3. Update TypeScript declarations so the `tsc` executable used by package
   scripts resolves to TypeScript 7.0.2. Keep the official TypeScript 6
   compatibility alias only for tools that still require the TypeScript compiler
   API (currently `typescript-eslint`).
4. Upgrade direct dependencies reported by pnpm to latest releases, including
   major releases where the package metadata and project engine constraints
   permit the upgrade.
5. Reinstall/update lockfiles with pnpm, then run root formatting plus backend
   lint and frontend type-check.
6. Review the final diff and report any packages that remain outdated because of
   compatibility or registry constraints.

## Verification

- `pnpm outdated` from root, backend, and frontend.
- `pnpm lint` from `backend/`.
- `pnpm type-check` from `frontend/`.
- `pnpm format` from the repository root.
- Confirm the active `tsc` compiler resolves to TypeScript 7.0.2; a TypeScript
  6.0.x compatibility package may remain only for compiler-API tooling that does
  not yet support TypeScript 7.

## Notes

- Do not commit changes or archive this plan automatically.
- Lockfile-only transitive changes are expected from dependency resolution and
  will be reviewed for consistency.
