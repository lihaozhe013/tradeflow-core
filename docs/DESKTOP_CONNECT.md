# TradeFlow Connect (test release)

TradeFlow Connect is a Tauri 2 desktop assistant for Windows x64/ARM64, macOS Apple Silicon, and
Linux x64. It manages account-bound MCP credentials and hands each Agent a prompt that lets the
Agent configure its own MCP connection. The assistant never edits Agent configuration files.

Query tools are read-only. When staging writes are enabled, editor and superuser connections also
receive tools that submit and update pending transaction drafts. Only an authenticated editor or
superuser can review and merge drafts in the web application. Reader accounts cannot discover or
call receivable, payable, analysis, or draft mutation tools. Authorized query tools read the entire
instance, not an employee partition.

## Responsibilities

| Component | Owns                                                                   | Does not own                        |
| --------- | ---------------------------------------------------------------------- | ----------------------------------- |
| Assistant | Sign-in, credential issue, renewal, revocation, prompts, diagnostics   | Agent configuration, Agent versions |
| Bridge    | Credential lookup, MCP forwarding, error classification, local logging | Business tool names or permissions  |
| Agent     | Its own MCP entry, trust/reload, tool discovery, host usage            | Passwords, login JWTs, MCP tokens   |
| Backend   | Tool catalog, authorization, rate limits, business execution           | Agent identity                      |

A connection is a revocable access grant for one user-chosen name, not a fixed Agent type. Any host
that can run a local stdio MCP server can connect without a new desktop release. The default and
recommended transport is the bundled stdio bridge; a direct remote transport remains available for
hosts that prefer Streamable HTTP.

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
version 1 and now include the catalog and guide versions. Credential names are free-form labels of
up to 64 printable characters; `client` no longer rejects unknown Agents.

Account credentials last 90 days, store only a SHA-256 digest on the server, and become invalid
after revocation, expiry, password changes, account deletion, or while the account is disabled.
Current role permissions are checked on every MCP request. All dynamic credentials owned by one
account share its request/concurrency budget. Existing static integrations keep their own budgets
and permissions.

## User workflow

1. Enter the server origin, such as `https://tradeflow.example.com`, and sign in with your TradeFlow
   account. HTTP is accepted only for loopback development. Paths, embedded passwords, queries, and
   fragments are rejected.
2. Enter a connection name, for example `Office assistant`, and create the connection. The assistant
   verifies the server, issues an independent credential, and probes the MCP endpoint.
3. The assistant copies the connect prompt and shows it for review. Paste it into the Agent you want
   to connect. The prompt contains no token: it names the bundled bridge executable and the
   `serve --profile <id>` launch command.
4. Let the Agent register the stdio server using its own MCP management command or documented
   configuration fields, then trust or reload the connection and run one query.

Several connections can coexist, including multiple connections for the same host or account. Each
one has its own credential and can be revoked separately.

**Switch server** opens the same login form and keeps existing connections. Signing out only clears
the in-memory JWT; installed connections continue to work.

### Prompts

The main screen exposes one primary action per connection and keeps the rest behind **More
actions**:

| Prompt   | Purpose                                                                                     |
| -------- | ------------------------------------------------------------------------------------------- |
| Connect  | Register the stdio bridge entry, verify discovery, run a minimal query.                     |
| Update   | Re-discover tools, compare with the stored catalog, refresh host guidance, verify a query.  |
| Repair   | Diagnose the service, host entry, trust state, credential expiry, and network/TLS failures. |
| Business | Ask the Agent for business answers through the connected service.                           |

Prompts follow the assistant language (Simplified Chinese, English, or Follow system). CLI commands,
MCP tool names, and diagnostic JSON keys remain unchanged.

### Sync and update

The tool catalog is versioned by the backend. `GET /api/mcp/catalog` returns the catalog version,
the instruction-guide version, the minimum bridge version, and the tools visible to the signed-in
account. The version is derived from the visible entries, so adding or changing a tool changes it
without a manual bump.

**Sync latest capabilities** signs in to the same server, reads the catalog, probes the MCP
endpoint, updates the stored tool list and versions, and reports added or removed tools. It does not
reissue the credential, rewrite Agent configuration, or expand authorization. When tools change,
reload the Agent or start a new session so the host re-reads `tools/list`.

If a host cannot refresh tools inside a running session, the update prompt must end with that
instruction instead of claiming success. There is no push notification requirement: each tool
discovery reads the live catalog, and the sync action or update prompt covers the rest.

### Remove locally and revoke remotely

A connection card offers **Remove local connection only**, which works offline and queues a redacted
reminder for the remote credential, and **Revoke credential and remove**, which requires a matching
sign-in. The assistant removes only its own credential profile. The Agent's MCP entry is owned by
the Agent, so remove it there if you no longer use it.

Remote cleanup records are historical reminders: manual web revocation does not automatically delete
a local reminder. The legacy cleanup retry treats only explicit `CONNECTION_NOT_FOUND` as already
removed; other HTTP 404 responses remain failures.

### Diagnostics and operation logs

The connection result displays the failing step, safe error code, and next action. Repair prompts,
remote cleanup reminders, crash records, and operation history live in **Diagnostics**. **Export
diagnostic report** saves recent events through a file picker.

Rust records login, capability checks, credential issuance, MCP handshake, discovery, minimal query,
catalog sync, revocation, and recovery. GUI progress and CLI reports use the same events and
operation IDs. Logs survive restarts in the private data directory's `logs/` folder: at most three
JSONL files, each at most 5 MiB. They exclude passwords, JWTs, MCP tokens, headers, raw
configuration, business parameters, and query results. A logging failure is displayed separately
from the connection result. The stdio bridge reserves stdout for MCP messages.

The assistant reports `serviceVerified` separately from `hostVerified`. It cannot observe Agent
trust or reload state, so host activation always remains a user-confirmed step.

## My MCP credentials on the web

Open **Administration → My MCP credentials** or `/#/mcp-connections`. Reader, editor, and superuser
accounts can view and revoke only their own credentials. The table shows the connection name, device
and credential IDs, dates, status, and effective/granted tools. Filter by status or connection name,
select one or multiple credentials, revoke them, and retry failed items. Tokens cannot be displayed
or recovered. This page does not create credentials or edit permissions.

The page remains usable while MCP is disabled; account authentication must be enabled. Status is
revoked, expired, password changed, or active, in that precedence. Effective tools are constrained
by the account's current role. Revocation is idempotent and blocks subsequent MCP requests, not a
business query already executing. No additional database migration is required for this page.

`GET /api/mcp/connections` retains its `data` array and adds `pagination`. Query parameters are
`page` (default 1), `limit` (default 100 for compatibility, maximum 100), `status`, and `client`
(exact connection name). The web UI requests 20 rows per page. Listing never returns password
versions or credential hashes. `DELETE /api/mcp/connections/:id` remains account-scoped, returning
204 for repeated revocation.

## Transport, bridge and compatibility

The bundled `tradeflow-connect serve --profile <id>` executable speaks MCP over stdio and forwards
only `tools/list` and `tools/call` to the remote backend. It reads the credential from its private
profile, so no token appears in Agent configuration. The GUI need not remain open and the bridge
does not listen on an HTTP port.

The bridge does not filter business tool names. It forwards whatever the backend authorizes, which
means a new server tool is visible after the host re-discovers tools without a desktop release. The
probe samples only a page-based read-only tool, so a write tool is never called during verification.

Direct remote transport remains available for hosts with a documented Streamable HTTP client. In
that mode the Agent stores a Bearer token in its own secret configuration; the assistant does not
manage that file. Because the assistant no longer inspects Agent files, it cannot detect
project-level overrides, malformed host configuration, or trust policy. Those checks belong to the
Agent and the prompt.

A connection profile is a private local credential store, not encrypted storage. Profile IDs are not
a security boundary: any process running as the same OS user can use the bridge. Use OS account and
file permissions as the boundary, and revoke unused credentials.

## Diagnostic and repair commands

The assistant copies prompts that embed the helper's absolute installed path. Tokens do not appear
in any prompt.

```sh
tradeflow-connect describe --profile <uuid> --json
tradeflow-connect doctor --profile <uuid> --json
tradeflow-connect serve --profile <uuid>
```

`describe` returns the redacted launch descriptor (transport, executable, arguments, server name,
tools, versions, expiry). `doctor` returns a redacted JSON diagnosis of the service and helper.
`serve` reserves stdout for MCP and uses stderr for generic errors. The Agent must not read
credential files, print full MCP configuration, change permissions, or disable host security to
repair a connection. Missing or expired credentials require assistant sign-in.

`--client` is no longer accepted: the profile already describes the connection, and Agent identity
is not required for protocol access.

## Local credential storage

Passwords are never persisted. Login JWTs remain in Rust memory only; MCP credentials are stored in
private profile files. The default profile directory is the OS local data directory under
`com.tradeflow.connect`. Profile files use Unix 0600 or user-only Windows ACLs; the data directory
uses Unix 0700. Symlink paths are refused. `TRADEFLOW_CONNECT_DATA_DIR` overrides the profile
directory for isolated tests.

The directory is a private local credential store, not encrypted storage. Do not share profile
files. When an Agent's execution engine runs on another machine or in a cloud sandbox, local
profiles and the stdio executable are unavailable; such hosts need a manual remote connection
outside this release's scope.

## Upgrading from a configuration-writing release

Earlier releases wrote OpenCode, WorkBuddy, or other host entries directly. This release does not.

- Existing profile files load unchanged. The stored Agent id becomes the connection name and the old
  host configuration path is ignored and removed on the next save.
- Host entries installed by an earlier release keep working because they point at
  `tradeflow-connect serve --profile <id>` or at the remote endpoint. Remove or replace them in the
  Agent when convenient.
- Interrupted operations recorded by an earlier release are resolved by finishing local profile
  cleanup and credential revocation. The assistant no longer restores host configuration files;
  re-run the connect prompt for that connection if the host entry is missing or stale.
- `doctor`/`repair` no longer edit host files. Regenerate prompts after upgrading so they contain
  the current commands.

## Development and test packages

Use the locally installed Bun and Node 26+, plus stable Rust with rustfmt/clippy. Install workspace
dependencies from the root. Native Tauri builds need each platform's standard compiler and WebView
dependencies.

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

The workflow uses the current stable Bun for workspace installs, Node 26 for desktop build scripts,
and GitHub Actions with the Node 24 action runtime. Windows x64 and ARM64 use the installed Visual
Studio Developer environment, with ARM64 tools selected for the companion executable.

The desktop icon source is `desktop/src/assets/connect.svg`. Regenerate native icons with
`bun run --cwd desktop tauri icon src/assets/connect.svg --output <temporary-directory>` and copy
the matching desktop PNG, ICO and ICNS files into `desktop/src-tauri/icons/`.

Protocol tests run an isolated official TypeScript SDK fixture and exercise the Rust direct client,
rejection of invalid credentials, and stdio forwarding with structured content. Storage tests cover
profile round-trips, legacy profile and journal handling, prompt rendering without credentials,
private permissions and symlinks. Backend integration tests use only `tradeflow_e2e` via
`bun run test`.

## Required native release acceptance

Do not mark a host compatible solely because CI compiled it. For each installer and host version
record: installation, login, connection creation, prompt copy, host registration by the Agent, tool
discovery, a real host query, reader restrictions, capability sync after a tool change, credential
renewal, revocation, host restart, GUI closure, and bridge query. Keep the exact tested host
versions with release evidence.
