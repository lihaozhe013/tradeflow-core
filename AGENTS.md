# AGENTS.md

## Project structure

TradeFlow Core is a pnpm-managed monorepo: the root scripts orchestrate the
React/Vite browser application in `frontend/`, the Express/TypeScript/Prisma API
in `backend/`, and the Python build helpers in `scripts/` and `build.py`. Each
package owns its manifest, lockfile, dependencies, and tooling; keep those
boundaries intact and never install or edit one package's dependencies from
another package's directory.

## 1. Language and repository policy

- Source-code comments, doc comments, commit messages, engineering
  documentation, configuration comments, and newly created repository prose MUST
  be written in English.
- Localized user-facing strings in the frontend's locale resources are allowed.
  Do not add localized text to internal logs, error messages, comments, or
  developer documentation.
- When modifying an existing non-English engineering comment, log message, or
  documentation section, translate the affected text to English when it is in
  scope for the change.
- Names and prose MUST explain intent. Do not add comments that merely restate
  obvious code.
- Keep `AGENTS.md` limited to durable repository policy. Do not add temporary
  implementation plans, TODO lists, debugging notes, or release-specific
  instructions here.

## 2. Toolchain and dependency policy

- Use **pnpm exclusively** for JavaScript and TypeScript package management and
  repository scripts. Do not use `npm`, `yarn`, or Bun to install, remove,
  update, or execute repository dependencies.
- The root `package.json` MUST contain a pinned `packageManager` field for the
  repository's pnpm baseline. Keep it synchronized with the current lockfile and
  toolchain when the package-manager baseline changes.
- The root `package.json`, `pnpm-lock.yaml`, `frontend/package.json`,
  `frontend/pnpm-lock.yaml`, `backend/package.json`, and
  `backend/pnpm-lock.yaml` are separate package boundaries. A dependency change
  MUST update the manifest and the matching lockfile in the same package.
- Run commands from the package they belong to. Use root scripts for
  cross-package workflows; do not install frontend dependencies in `backend/`,
  or backend dependencies in `frontend/`.
- Respect the Node.js engine declarations in the relevant package. Root
  workflows require Node.js 24 or newer; package-local workflows must also
  satisfy their package's declared engine.
- Use the TypeScript, Vite, React, Express, Prisma, and pnpm versions already
  pinned by the package manifests and lockfiles. Do not introduce prerelease
  dependencies or downgrade baseline dependencies to work around an
  implementation problem without explicit approval.
- Add a dependency only when it provides clear value over a small, maintainable
  local implementation. Consider bundle size, maintenance, security history, and
  whether the dependency belongs in the root tooling, backend runtime, backend
  tooling, or frontend bundle.
- Keep backend/Node-only dependencies out of browser-rendered frontend code. Do
  not manually edit generated contents under `node_modules/`.
- Use `uv run build.py` for the repository build helper. Do not modify
  `build.py` or `scripts/build/` unless the task specifically concerns the build
  pipeline.
- Runtime configuration and private data belong in the existing ignored
  configuration/data locations. Use `config-example/` as the public template;
  never commit local credentials or generated runtime data.

## 3. TypeScript requirements

- Use the TypeScript version declared by the package being changed. Do not mix
  TypeScript major versions across a package or change a package's TypeScript
  baseline without explicit approval.
- New application code SHOULD be TypeScript (`.ts`/`.tsx`). Existing
  JavaScript/JSX files and build scripts may remain JavaScript when conversion
  is not part of the task; do not silently expand a conversion's scope.
- Backend TypeScript MUST remain in strict mode. Do not weaken backend compiler
  options globally to silence errors; preserve its checked options, including no
  implicit `any`, unused-code checks, unchecked indexed access, and no implicit
  overrides.
- Frontend TypeScript currently uses a deliberately relaxed compatibility
  baseline. Do not claim or impose a repository-wide strict migration through an
  unrelated feature; improve types locally and preserve the existing frontend
  configuration unless strictness is explicitly requested.
- Prefer `unknown` over `any`. New uses of `any` require a narrow
  interoperability reason. Do not use `@ts-ignore` unless no safer option
  exists; prefer `@ts-expect-error` with a concise explanation when a
  suppression is unavoidable.
- HTTP request bodies, query parameters, uploaded/imported data, persisted
  configuration, authentication data, and external service responses MUST be
  validated at their trust boundary. Use the repository's existing validation
  patterns or focused runtime checks; do not assume TypeScript types validate
  runtime input.
- Public request/response types and other interfaces crossing the backend,
  database, or frontend boundary MUST be explicit and stable. Use `import type`
  for type-only imports where appropriate.
- Frontend modules MUST remain browser-safe and must not import Node.js, Prisma,
  filesystem, or server-only modules. Backend modules may use Node.js and Prisma
  APIs but must not import renderer UI modules.

## 4. Backend policy

- The backend is an Express API backed by Prisma and PostgreSQL. Preserve the
  separation between route handlers, domain/data services, authentication,
  export/analysis helpers, and infrastructure code.
- Use the existing backend logger for server diagnostics instead of adding ad
  hoc logging patterns. Keep audit records (database-backed user actions)
  distinct from operational diagnostics.
- Database schema and migration changes belong under `backend/prisma/` and must
  be reviewed for data compatibility. Do not hand-edit generated Prisma client
  output.
- From `backend/`, `pnpm lint` MUST finish with zero ESLint errors. Warnings
  should be addressed when practical, especially for new code.

## 5. Frontend policy

- The frontend is a React/Vite browser SPA. Keep browser-only code in
  `frontend/` and use the existing request, auth, routing, i18n, and config
  boundaries instead of duplicating them in individual pages.
- User-facing text MUST use the existing localization approach when the feature
  is localized. Do not put new user-facing copy directly into reusable logic
  when a locale resource is appropriate.
- From `frontend/`, `pnpm type-check` MUST pass with zero TypeScript errors. Run
  `pnpm build` when the change affects Vite bundling, assets, or runtime
  integration.

## 6. Formatting and source style

- Follow the repository's existing Prettier and ESLint configuration. Do not
  introduce a second formatter or package-local style that conflicts with the
  root configuration.
- `pnpm format` is the repository formatting command. Run it when the change
  touches formatting-sensitive files or before a requested commit, and review
  unrelated formatting changes before keeping them.
- Prefer `rg` for text/code search and `fd` for file discovery. Use `uv run`
  instead of invoking a system Python interpreter for repository Python tooling.
- Keep changes minimal and focused. Preserve established naming, module
  boundaries, and formatting unless the requested work includes a refactor.

## 7. Security and data handling

- Never log, commit, or expose API keys, JWTs, passwords, database credentials,
  generated secrets, authorization headers, or unnecessary personal or business
  data such as customer, supplier, invoice, or export contents.
- Mask sensitive fields before logging request or database metadata. Error
  responses MUST avoid leaking stack traces, secrets, SQL, or internal paths in
  production.
- Treat imported spreadsheets, uploaded files, configuration files, and external
  API responses as untrusted input. Validate, constrain, and handle failures
  without crashing unrelated requests.

## 8. Validation and handoff

- Before handing off a backend change, run `pnpm lint` in `backend/`.
- Before handing off a frontend change, run `pnpm type-check` in `frontend/`.
- For cross-package or build-related changes, also run the narrowest relevant
  root build/check, such as `pnpm build`, and report any unavailable or
  environment-dependent check explicitly.
- When debugging a feature, provide a ready-to-run command that exercises the
  relevant flow and writes focused output to a dedicated ignored log file. Use
  an `rg` filter for the feature prefix where useful.

## 9. Git and change management

- Never commit unless explicitly asked.
- When asked to commit, use a concise Conventional Commits message in English,
  include a `Co-Authored-By` trailer for the assisting model, and do not amend
  commits, skip hooks, force-push, or rewrite history unless explicitly
  instructed.
- Preserve unrelated user changes in a dirty worktree. Inspect overlapping files
  before editing and do not use destructive commands such as `git reset --hard`
  or broad recursive deletion without explicit approval.

## 10. Logging and debugging

- Application diagnostics MUST remain available without depending solely on
  terminal stdout/stderr redirection. Backend persistent logs SHOULD be written
  under an application-specific runtime log directory resolved through the
  existing server path/configuration helpers; console output may supplement file
  logs but must not be the only channel for persistent diagnostics.
- Startup MUST remain resilient when a log directory or log file cannot be
  created. Report the logging failure safely and continue startup when the
  application can do so.
- Use stable, searchable subsystem prefixes for feature or investigation logs,
  such as `[api]`, `[auth]`, `[inventory]`, `[export]`, `[analysis]`, or `[db]`.
  Keep prefixes consistent within a subsystem and write internal log messages in
  English.
- Never log API keys, authentication tokens, passwords, database URLs, generated
  secrets, credentials, or private trade/customer/invoice content unnecessarily.
- Verbose debug logging MUST NOT be enabled by default in production builds.
- Generated `*.log` files, including the root `debug.log`, MUST remain
  untracked. The root `pnpm dev` command MUST create a fresh `debug.log` at
  session start and capture the backend/frontend output and application
  diagnostics there while also showing them in the terminal:

  ```sh
  pnpm dev
  ```

  The command owns the log file, so shell redirection is not required. Filter it
  with `rg 'inventory|export|auth' debug.log` or a narrower subsystem prefix. Do
  not rely on this capture alone for production diagnostics.

## 11. Code organization and file size

- Preserve the established root, backend, and frontend package/module boundaries
  unless a refactor is part of the requested change.
- New modules MUST have one clear responsibility. Avoid circular dependencies,
  broad shared mutable state, barrel files that hide dependency direction, and
  generic `utils` modules that become dumping grounds.
- Code imported by the frontend MUST remain environment-safe and must not
  transitively depend on Node.js, Prisma, filesystem, or backend-only APIs.
- Prefer dependency injection or explicit parameters for difficult-to-test
  services, including filesystem access, database clients, external providers,
  clocks, and cache/persistence operations.
- Any source file over 800 lines MUST trigger an explicit design review before
  more responsibilities are added. Evaluate cohesion, dependency direction,
  state ownership, and whether behavior belongs in focused modules.
- Do not allow a file to cross 800 lines without recording the assessment in the
  change summary or commit body. When modifying an existing file already over
  800 lines, avoid increasing its scope and split cohesive behavior when doing
  so is lower risk than continued growth.
- Generated files, vendored code, lockfiles, build output, and generated Prisma
  client code are exempt from the source-file size limit.
