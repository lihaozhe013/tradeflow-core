# TradeFlow Connect (test release)

TradeFlow Connect is a Tauri 2 desktop assistant for Windows x64/ARM64, macOS Apple Silicon, and
Linux x64. It creates account-bound MCP credentials and installs user-level OpenCode V2 or WorkBuddy
connections. Business tools remain read-only. Reader accounts cannot discover or call receivable,
payable, or analysis tools. Authorized tools read the entire instance, not an employee partition.

## Server upgrade

1. Back up the database and deploy the updated backend. On startup it adds missing tables, columns,
   indexes, and constraints from the Prisma schema while retaining existing data. The configured
   PostgreSQL role needs permission to create objects in the `public` schema and to create the
   database if it does not already exist. Backfill required fields without a database default before
   restarting if their table already contains rows.
2. Enable `auth.enabled` and `mcp.enabled`, set allowed hosts, and expose the backend through HTTPS.
   `mcp.credentials: []` is now valid; existing static credentials remain supported unchanged.
3. Start the upgraded backend. Credential creation and revocation do not require restarts. Backend
   rollback can leave the added table in place.

User connection endpoints require a real login JWT even if normal web authentication is disabled.
The disabled-auth development identity cannot create connections. Capabilities have interface
version 1. Account credentials last 90 days, store only a SHA-256 digest on the server, and become
invalid after revocation, expiry, password changes, account deletion, or while the account is
disabled. Current role permissions are checked on every MCP request. All dynamic credentials owned
by one account share its request/concurrency budget. Existing static integrations keep their own
budgets and permissions.

## User workflow

1. Enter the server origin, such as `https://tradeflow.example.com`, and sign in with your TradeFlow
   account. HTTP is accepted only for loopback development. Paths, embedded passwords, queries, and
   fragments are rejected.
2. Select OpenCode, WorkBuddy, or both and click **Connect selected agents**. The page lists the
   local connections that will be replaced. Each Agent is processed independently.
3. Wait for **Service verified. Reload the Agent and run one query.** Enable/trust or reload the
   connection in the Agent, then use the copied business prompt. Its minimal query uses `limit: 5`.

**Switch server** opens the same login form. There is no separate switching wizard. A failed login
leaves the existing session and Agent configuration intact. A verified destination replaces the
assistant's existing entries for that Agent, preserving other MCP servers and JSONC comments. An
existing valid credential for the destination account is reused. Expired or rejected credentials are
replaced while preserving the local profile name. Successful replacements leave old remote
credentials for manual revocation; an offline old server does not block the new connection.

Endpoint verification does not prove host activation. A running Agent may still hold its old
configuration until it is reloaded. Sign out only clears the in-memory login session; installed
connections continue to work.

### Remove locally and revoke remotely

1. On a connection card, click **Remove local configuration**, then confirm. No login or network is
   needed. Only the assistant-managed entry and its active profile are removed. If the configuration
   is damaged or concurrently modified, the assistant stops rather than replacing unrelated data.
2. Reload or restart the Agent. Removing a configuration file entry does not terminate a running
   Agent or remove a credential from its memory.
3. Open **Diagnostics → Remote cleanup records → Open My MCP credentials**. Sign in to the original
   server with the original account, select the old credential ID, and revoke it. You can also open
   `https://your-original-server/#/mcp-connections` directly. Each server manages its own
   credentials.

Cleanup records contain only server origin, username, Agent, credential ID, expiry when known, and
safe status. They contain no token, password, or JWT and never prevent new connections. Records are
historical reminders: manual web revocation does not automatically delete a local reminder. The
legacy cleanup retry command still treats only explicit `CONNECTION_NOT_FOUND` as already removed;
other HTTP 404 responses remain failures.

The assistant saves a private recovery journal before changing configuration. Verification failure
restores the previous file unless another program changed it, and attempts to revoke newly issued
credentials. Cleanup failure leaves a redacted reminder. After restart, unverified changes roll back
and verified changes finish local cleanup. External edits are never silently overwritten.

### Diagnostics and operation logs

The connection result displays the failing step, safe error code, and next action. Starting a new
operation clears the prior result, including after login failure. The main screen contains only
connection checks, business prompts, and local removal; repair, bridge selection, repair prompts,
and remote cleanup reminders live in **Diagnostics**.

Rust records login, capability checks, Agent detection, credential issuance, configuration changes,
MCP handshake, discovery, minimal query, commit, rollback, and temporary credential cleanup. GUI
progress and CLI reports use the same events and operation IDs. **Export diagnostic report** saves
recent events through a file picker. Logs survive restarts in the private data directory's `logs/`
folder: at most three JSONL files, each at most 5 MiB. They exclude passwords, JWTs, MCP tokens,
headers, raw configuration, business parameters, and query results. A logging failure is displayed
separately from the connection result. The stdio bridge reserves stdout for MCP messages.

TradeFlow Connect supports Simplified Chinese, English, and Follow system. The setting persists
locally. Chinese system locales select Simplified Chinese; other locales select English. Korean is
not offered. UI explanations, operation stages, and generated prompts follow the selected language.
CLI commands, MCP tool names, and diagnostic JSON keys remain unchanged.

## My MCP credentials on the web

Open **Administration → My MCP credentials** or `/#/mcp-connections`. Reader, editor, and superuser
accounts can view and revoke only their own credentials. The table shows Agent, device and
credential IDs, dates, status, and effective/granted tools. Filter by status, select one or multiple
credentials, revoke them, and retry failed items. Tokens cannot be displayed or recovered. This page
does not create credentials or edit permissions.

The page remains usable while MCP is disabled; account authentication must be enabled. Status is
revoked, expired, password changed, or active, in that precedence. Effective tools are constrained
by the account's current role. Revocation is idempotent and blocks subsequent MCP requests, not a
business query already executing. No additional database migration is required for this page.

`GET /api/mcp/connections` retains its `data` array and adds `pagination`. Query parameters are
`page` (default 1), `limit` (default 100 for compatibility, maximum 100), `status`, and `client`.
The web UI requests 20 rows per page. Listing never returns password versions or credential hashes.
`DELETE /api/mcp/connections/:id` remains account-scoped, returning 204 for repeated revocation.

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
automatic test release is an unsigned Windows/macOS-ad-hoc-signed pre-release; Windows may request
confirmation for its installers. Configure production signing and notarization before distributing
signed production builds.

Push to `build-mcp-app` to validate and build the Windows x64 and ARM64 NSIS installers, Apple
Silicon DMG, and Linux x64 `.deb` and AppImage. You can also dispatch the workflow from that branch
in GitHub Actions. The fixed download page is
[`desktop-latest`](https://github.com/lihaozhe013/tradeflow-core/releases/tag/desktop-latest). Each
successful run updates the same pre-release, advances the tag to the source commit, publishes
version/platform/architecture/run-specific filenames with a SHA-256 manifest, then removes every
other GitHub release and tag in the repository. The release job runs only after all validation and
native builds succeed. Runs are serialized; an older build skips publishing if the source branch has
advanced. Installer artifacts attached to Actions runs are retained for seven days.

The workflow uses Bun 1.4.2 for workspace installs, Node 26 for desktop build scripts, and GitHub
Actions with the Node 24 action runtime. Windows x64 and ARM64 use the installed Visual Studio
Developer environment, with ARM64 tools selected for the companion executable.

The desktop icon source is `desktop/src/assets/connect.svg`. Regenerate native icons with
`bun run --cwd desktop tauri icon src/assets/connect.svg --output <temporary-directory>` and copy
the matching desktop PNG, ICO and ICNS files into `desktop/src-tauri/icons/`.

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

## Windows 0.1.1 diagnostics

Windows storage permissions use the current process user's SID and a protected DACL through native
APIs. No shell or localized account-name output is involved. Agent detection and helper checks run
with `CREATE_NO_WINDOW`; redirected CLI and bridge standard IO remain available.

Native Rust panics inside observed operations return `OPERATION_PANICKED`. The assistant records
only the application version, timestamp, operation ID, stage and source filename/line in a bounded
private `logs/crashes.jsonl` file. Panic payloads and memory dumps are excluded. The Diagnostics
page and exported report include these records. Unwind recovery does not catch Windows access
violations, stack overflow or external process termination; interrupted configuration journals are
still checked on the next startup. Record the exact application version when reporting a failure.

The temporary `codex/windows-mcp-smoke` branch was removed after native verification. Its Actions
run linked below retains the verification record. The test drove real Tauri login and connection
buttons with a local fixture backend and fake Agent detection, checked reuse/removal/query-failure
rollback, and saved redacted reports. It does not certify actual OpenCode or WorkBuddy activation.
`build-mcp-app` builds release installers for Windows x64/ARM64, macOS Apple Silicon, and Linux x64.

### Native regression verification (2026-10-02)

The Windows runner reproduced application termination immediately after the connection button, with
a truncated exit code of 253 and no connection-stage event. This is consistent with stack overflow,
but the original full exception code was not captured. Observed GUI operations now use boxed
futures, and the connection entry future shrank from 21,600 to 136 bytes on the local build. A
regression test bounds its size before polling, since Tauri constructs command futures on the native
window thread.

After this change, the
[Windows release smoke run](https://github.com/lihaozhe013/tradeflow-core/actions/runs/37029061255)
passed actual window login, both Agent connection buttons, credential reuse, local removal and
query-failure rollback with temporary credential revocation. Native private ACL and hidden-process
standard-IO tests also passed. This validates the simulated installation flow; production server
connections and actual Agent trust/reload/tool calls still require user acceptance on Windows.
