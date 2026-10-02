# Manual installation and connection

Read this reference when setting up or troubleshooting TradeFlow MCP. Ordinary business queries need
only the skill instructions and the host's live tool schemas. No Tauri app is required for the
remote connection described here.

## Install the skill

Distribute the complete `tradeflow-mcp/` folder, including `SKILL.md` and `references/`. It contains
no server address or secrets. Do not distribute a user's MCP configuration with it.

- OpenCode V2: copy the folder into `~/.config/opencode/skills/tradeflow-mcp/`, or into
  `<project>/.opencode/skills/tradeflow-mcp/` for project use. Reload and ask the Agent to use
  `tradeflow-mcp`.
- WorkBuddy: use **Skills → Add skill → Upload skill** to import a local skill package. Package this
  folder with `SKILL.md` and its `references/` at the package root; follow the installed version's
  import dialog for its accepted archive format. Enable the imported skill and start a new
  conversation. This is local installation, not publication to the WorkBuddy marketplace.

Host instructions: [OpenCode skills](https://opencode.ai/v2/docs/skills),
[WorkBuddy skill import](https://www.codebuddy.cn/docs/workbuddy/From-Beginner-to-Expert-Guide/Function-Description/Skills-Market).

## Obtain a separate credential for each Agent

Use the server origin supplied by the user or administrator, such as
`https://tradeflow.example.com`. Append `/mcp` for the MCP endpoint. Use HTTPS except for local
loopback development. Do not infer a production server from examples in this skill.

Choose one existing credential route:

1. **Administrator-issued static credential:** the administrator generates a dedicated token, adds
   its SHA-256 entry and tool allowlist to the private server configuration, and restarts the
   backend. The repository's command, run by the administrator from its root, is:

   ```sh
   bun --cwd backend run scripts/generateMcpToken.ts office-agent get_inventory,list_transactions 90
   ```

   Its output contains a secret. Run it in a private administrator terminal, not an Agent tool whose
   output enters the conversation. This example grants only two tools; the administrator chooses the
   required allowlist. Static credentials are not listed on the user's web page and do not inherit
   account role changes.

2. **Account-bound credential through the existing API:** use a trusted HTTP client with secrets
   excluded from saved request history and Agent transcripts. Log in at `POST /api/auth/login` with
   `username` and `password`. Keep the response's top-level `token` (login JWT) in memory and use it
   as `Authorization: Bearer ...` for the management endpoints below. Do not use this JWT as the MCP
   credential. Account authentication and MCP must be enabled, and the server's additive MCP
   database upgrade must have been applied. A successful capabilities response alone does not verify
   the credential table or the public endpoint's Host allowlist.

   | Request                                       | Purpose                                                                                                   |
   | --------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
   | `GET /api/mcp/capabilities`                   | Check `data.enabled`, `data.endpointPath`, `data.allowedTools`, and `data.credentialDays`                 |
   | `POST /api/mcp/connections`                   | Send `{"client":"opencode","deviceId":"DEVICE_UUID"}` or `client: "workbuddy"`; `deviceId` must be a UUID |
   | `GET /api/mcp/connections?page=1&limit=20`    | List this account's credential metadata without secrets                                                   |
   | `DELETE /api/mcp/connections/CREDENTIAL_UUID` | Revoke this account's credential; success is HTTP 204                                                     |

   Creation returns HTTP 201 with `data.id`, `data.token`, `data.tools`, and `data.expiresAt`.
   Transfer `data.token` directly into the host's private secret/configuration input and retain the
   ID and expiry for management. The token is returned only once and cannot be recovered. Discard
   the login JWT after setup. Account tokens last 90 days and follow current account permissions;
   password changes, disablement, deletion, expiry, and revocation invalidate them.

The web page `https://YOUR_SERVER/#/mcp-connections` currently supports viewing and revoking
account-bound credentials, not creating or recovering tokens. Installing a skill does not create a
credential. Do not ask the user to paste passwords or bearer tokens into an Agent conversation.

## Configure the host

Examples are merge fragments, not replacement files. Preserve other MCP servers, settings, and JSONC
comments. Before changes, make a private backup, detect concurrent edits, and update only the
requested TradeFlow entry. Keep files and backups restricted to the current user (Unix 0600 or
equivalent Windows ACLs). Do not commit them. Use distinct names for different servers or accounts
and check for project overrides before changing user configuration.

### OpenCode V2

Use the existing user `opencode.jsonc` or `opencode.json` under `$XDG_CONFIG_HOME/opencode` (default
`~/.config/opencode`). Merge this structure:

```json
{
  "mcp": {
    "servers": {
      "tradeflow": {
        "type": "remote",
        "url": "https://tradeflow.example.com/mcp",
        "oauth": false,
        "headers": { "Authorization": "Bearer {env:TRADEFLOW_MCP_TOKEN}" }
      }
    }
  }
}
```

Supply `TRADEFLOW_MCP_TOKEN` through a private environment/secret input available to the OpenCode
process, without displaying its value. Restarted processes need the value supplied again; desktop
launchers might not inherit a terminal's environment. A private literal header is an alternative
when the launch environment cannot supply secrets. TradeFlow does not implement OAuth.

Use `opencode mcp list` and `/mcps` to inspect or activate the connection, then reload and run the
minimal inventory query through the Agent. These fields target V2; check the installed version. See
[OpenCode MCP configuration](https://opencode.ai/v2/docs/mcp-servers).

### WorkBuddy desktop

Open the MCP configuration UI or edit the user-level `~/.workbuddy/mcp.json`. The repository's
desktop adapter uses this remote structure for the 5.6.0 baseline:

```json
{
  "mcpServers": {
    "tradeflow": {
      "type": "streamableHttp",
      "url": "https://tradeflow.example.com/mcp",
      "headers": { "Authorization": "Bearer REPLACE_IN_PRIVATE_CONFIGURATION" }
    }
  }
}
```

The placeholder is not a token; replace it privately. Do not assume OpenCode's `{env:...}` syntax
works in WorkBuddy. Verify remote Bearer-header support on the installed version, enable/trust the
connection, and start a fresh conversation. The project-level `.workbuddy/mcp.json` can affect the
active connection. Do not substitute CodeBuddy CLI settings for WorkBuddy desktop settings. See
[WorkBuddy MCP configuration](https://www.codebuddy.cn/docs/workbuddy/From-Beginner-to-Expert-Guide/Function-Description/MCP-Guide).

## Verify, troubleshoot, and switch servers

Discover tools, then call `get_inventory` with `{"page":1,"limit":5}` through the host. Check the
validated limit, row count, and query timestamp. Report skill installation, service verification,
and successful host use separately. A direct HTTP test must not be reported as a native Agent tool
call. If tools are missing from a conversation created before installation, reload or start anew.

For an unauthenticated Host-routing check, this request contains no credentials:

```sh
curl -i --max-time 15 -X POST 'https://tradeflow.example.com/mcp' \
  -H 'Content-Type: application/json' --data '{}'
```

A TradeFlow HTTP 401 indicates the request reached bearer authentication; it does not verify a
credential or a business query. HTTP 403 with `Invalid Host` requires the administrator to include
the public hostname in `mcp.allowedHosts` without scheme, port, or path, then restart the backend.
An Origin rejection requires the corresponding browser hostname allowlist. Do not disable these
protections. A disabled endpoint returns 404. A credential-operation 500 needs server logs; the
known `public.mcp_connections does not exist` error requires the additive MCP database upgrade, not
another token or a database reset.

On a generic handshake error, retain the failed stage and safe HTTP/protocol code if available; do
not guess whether it is TLS, Host rejection, or credential failure. Stop after one diagnostic
attempt and request the missing status or administrator check. Direct-HTTP compatibility errors can
justify an already-installed stdio bridge, but this skill contains no bridge executable or profile
creation helper. Do not invent `tradeflow-connect` profiles or require Tauri for direct remote use.
A bridge cannot fix 401, 403, 429, or TLS rejection.

When switching servers, keep the old configuration until the destination's credential and minimal
query are verified. If a candidate configuration fails, restore it only if no external edit
occurred, and revoke the newly issued account credential (not a reused one). After success, reload
the Agent and revoke the old account credential on the original server's web page. If that server is
offline, record the non-secret credential ID for later cleanup. Removing a local entry does not
revoke remote access or clear a running Agent's memory. A revoked candidate after failed setup is
expected cleanup and is not itself evidence that credential creation failed.
