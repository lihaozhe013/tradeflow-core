# TradeFlow Connect (internal test release)

TradeFlow Connect is a Tauri 2 desktop assistant for Windows x64 and macOS Intel/Apple Silicon. It
creates account-bound MCP credentials and installs user-level OpenCode V2 or WorkBuddy connections.
Business tools remain read-only. Reader accounts cannot discover or call receivable, payable, or
analysis tools. Authorized tools read the entire instance, not an employee partition.

## Server upgrade

1. Back up the database and apply `backend/prisma/upgrades/20261002_mcp_connections.sql` with your
   normal PostgreSQL administration tool. This upgrade only adds a table, indexes, and its user
   association. Do not run the repository's destructive database initialization script.
2. Generate the Prisma client and build the backend using the existing deployment workflow.
3. Enable `auth.enabled` and `mcp.enabled`, set allowed hosts, and expose the backend through HTTPS.
   `mcp.credentials: []` is now valid; existing static credentials remain supported unchanged.
4. Start the upgraded backend. Credential creation and revocation do not require restarts. Backend
   rollback can leave the added table in place.

User connection endpoints require a real login JWT even if normal web authentication is disabled.
The disabled-auth development identity cannot create connections. Capabilities have interface
version 1. Account credentials last 90 days, store only a SHA-256 digest on the server, and become
invalid after revocation, expiry, password changes, account deletion, or while the account is
disabled. Current role permissions are checked on every MCP request. All dynamic credentials owned
by one account share its request/concurrency budget. Existing static integrations keep their own
budgets and permissions.

## User workflow

Enter the server origin, such as `https://tradeflow.example.com`, and sign in with your TradeFlow
account. Non-root URL paths, embedded passwords, queries, and fragments are rejected. HTTP is only
accepted for loopback development. Select an installed agent, create its connection, then enable or
trust the connection in that agent and reload if necessary. Run one minimal inventory query before
using the generated business prompt.

The GUI separates configuration installation and direct endpoint verification from actual host
activation. A successful endpoint check does not prove that a WorkBuddy/OpenCode conversation has
loaded the connection. Reports always leave host verification to an actual agent query.

Use Update credential after expiry or password changes. The assistant creates the replacement,
installs and tests it, then revokes the predecessor. Failed installation restores the previous
configuration unless another program changed it. Failed credential cleanup remains visible for a
later retry. Sign out clears the login JWT; it does not revoke installed integrations. Revoke and
Disconnect revokes the server credential before removing the local managed entry.

## Agent adapters and compatibility status

- OpenCode V2: user configuration under the XDG config directory (or `~/.config/opencode`),
  `opencode.jsonc` preferred when present, otherwise an existing `opencode.json` is used. Entries
  use `mcp.servers`, `type: remote`, `oauth: false`, and a Bearer header. V1 is rejected.
- WorkBuddy: `~/.workbuddy/mcp.json`, `mcpServers`, `type: streamableHttp`, a remote URL and Bearer
  header. The baseline is desktop 5.6.0. The GUI asks users to confirm the version; it does not
  treat a directory as proof of a verified version. Actual remote header support and trust/reload
  behavior must be checked on each target platform before calling that version certified.
- Bridge mode: OpenCode uses a local command array; WorkBuddy uses command/args. The bundled
  `tradeflow-connect serve --profile <id>` executable speaks MCP over stdio and forwards only
  tools/list and tools/call to the remote backend. The GUI need not remain open. It uses the
  official Rust SDK and does not listen on an HTTP port.

A profile has a stable UUID and a managed server name. Configuration updates preserve other servers
and JSONC comments, back up the original with private permissions, use an advisory lock, check for
concurrent changes, and atomically replace the file. Project-specific overrides are reported by the
CLI from its working directory and are never automatically edited.

Automatic repair keeps the current transport. When the endpoint is healthy but the host cannot use
remote Streamable HTTP, select Use bridge or let the repair prompt invoke `--mode bridge`. Transport
switching is explicit because direct endpoint probes cannot detect the host's trust policy or
private protocol behavior. It is never triggered to conceal HTTP 401/403/404/429, network or TLS
errors. Certificates are not bypassed and redirects are not followed with credentials.

## Diagnostic and repair commands

The GUI copies both a business prompt and a complete setup/repair prompt. The latter describes the
account login, credential lifecycle, local configuration, transport choice, diagnosis, expected
checks, and error handling. It gives OS-quoted commands with the helper's absolute installed path.
Tokens do not appear in either prompt.

```sh
tradeflow-connect doctor --profile <uuid> --client opencode --json
tradeflow-connect repair --profile <uuid> --client opencode --mode auto --json
tradeflow-connect repair --profile <uuid> --client workbuddy --mode bridge --json
tradeflow-connect serve --profile <uuid>
```

Doctor and repair return redacted JSON, not raw configuration or business query results. Serve
reserves stdout for MCP and uses stderr for generic errors. The agent must not read credential
files, print full MCP configuration, change permissions, or disable host security to repair a
connection. Missing/expired credentials require GUI login. Host trust and reload steps remain
user-controlled.

## Local credential storage

Passwords are never persisted. Login JWTs remain in Rust memory only; MCP credentials are stored in
private profile files and remote host configuration. The default profile directory is the OS local
data directory under `com.tradeflow.connect`. Profile files, configuration files, and backups use
Unix 0600 or user-only Windows ACLs; the assistant's data directory uses Unix 0700. Symlink paths
are refused. `TRADEFLOW_CONNECT_DATA_DIR` overrides the profile directory for isolated tests.

The directory is a private local credential store, not encrypted storage. Do not share profile or
backup files. When an agent's execution engine runs on another machine or in a cloud sandbox, local
profiles and the stdio executable are unavailable; that is outside this release's scope.

## Development and test packages

Use Bun 1.4.2 and Node 26+, plus stable Rust with rustfmt/clippy. Install workspace dependencies
from the root. Native Tauri builds need each platform's standard compiler and WebView dependencies.

```sh
bun install
bun run --cwd desktop prepare-sidecar
bun run desktop:dev
bun run desktop:test
bun run --cwd desktop playwright install chromium
bun run --cwd desktop test:ui
cargo fmt --manifest-path desktop/Cargo.toml --all --check
cargo clippy --manifest-path desktop/Cargo.toml -p tradeflow-connect --all-targets -- -D warnings
bun run --cwd desktop typecheck
bun run desktop:build
```

The build script packages the CLI as a sidecar; installed users need no Node, Bun or Python runtime.
Desktop builds are separate from the server Docker workflow. To supply release signing parameters,
pass a private Tauri configuration override with `--config <path>` (for example the macOS signing
identity or Windows certificate thumbprint/timestamp URL), and supply Apple notarization credentials
through the standard Tauri environment variables. Keep signing secrets out of repository files. The
desktop CI workflow builds NSIS on Windows and DMG/app on both macOS architectures and uploads
internal test artifacts. It does not publish releases. macOS uses ad-hoc signing; Windows packages
are unsigned. Production code signing and notarization must be supplied before public distribution.

Protocol tests run an isolated official TypeScript SDK fixture and exercise the Rust direct client,
rejection of invalid credentials, and stdio forwarding with structured content. Config checks cover
comments, existing servers, malformed files, rollback, concurrent changes, Chinese and
space-containing paths, project overrides, credential redaction, private permissions and symlinks.
Backend integration tests use only `tradeflow_e2e` via `bun run test`.

Adapter references: [OpenCode V2 MCP](https://opencode.ai/v2/docs/mcp-servers),
[WorkBuddy user configuration](https://www.codebuddy.cn/docs/workbuddy/From-Beginner-to-Expert-Guide/Function-Description/MCP-Guide),
[WorkBuddy transport fields](https://open.workbuddy.cn/en/docs/connector).

## Required native release acceptance

Do not mark Windows/macOS or WorkBuddy compatibility certified solely because CI compiled it. For
each installer and host version record: installation, login, remote tool discovery/query, reader
restrictions, credential renewal, revocation, host restart, GUI closure, bridge query, and repair of
a damaged configuration via the generated prompt. Include WorkBuddy trust/activation steps and
OpenCode project override behavior. Keep the exact tested versions with release evidence.

## Implementation verification (2026-10-02, Linux)

- Existing server/frontend build, backend lint and backend/frontend TypeScript checks passed.
- Full backend run: 186 tests passed. After adding live downgrade/deletion coverage, the focused MCP
  suite passed all 20 tests.
- Full browser run: 29 of 30 tests passed. The editor navigation/logout test timed out waiting for
  its menu; an isolated rerun passed. No unrelated application behavior was changed for that test.
- Rust config tests (8), official SDK direct/stdio interoperability (1), and mocked GUI IPC tests
  (2) passed. The entire Rust workspace passed clippy and the Tauri application passed native
  checking.
- OpenCode 2.0.21 was detected locally, but its catalog probe did not complete within the test
  timeout. No live conversation/tool-call acceptance is claimed. WorkBuddy and Windows/macOS hosts
  are not available in this environment; native compatibility and installer acceptance remain
  pending.

The checked-in CI workflow is the build definition, not evidence that native installers have been
produced. Record its artifact links and the native host acceptance results before a test release.
