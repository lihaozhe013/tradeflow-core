# Development Logging and Orchestration Plan

## Objective

Replace the root `concurrently`-based development command with a repository
owned Node.js script that starts the backend and frontend together, mirrors
their output to the terminal, and writes a fresh root `debug.log` for every
development session.

## Implementation

- Add a root `scripts/dev.mjs` using Node.js built-ins only.
- Truncate/create `debug.log` at startup, prefix entries with the child service
  and stream, and continue running if the log file cannot be opened.
- Spawn the existing backend and frontend package-local `dev` scripts without
  changing their package boundaries.
- Forward SIGINT/SIGTERM and child failures so both processes shut down cleanly
  and the root process returns a useful status.
- Replace the root `dev` command, remove the `concurrently` dependency, and
  regenerate the root lockfile with pnpm.
- Update the logging policy so `pnpm dev` itself owns `debug.log`; manual stdout
  redirection is no longer required.

## Validation

- Check the script syntax and root dependency/lockfile consistency.
- Run the development command briefly, verify both child services and
  `debug.log`, then stop it cleanly.
- Confirm unrelated working-tree changes remain unstaged and untouched.
