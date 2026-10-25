# Manual installation and connection

Read this reference when setting up or troubleshooting TradeFlow MCP. Ordinary business queries need
only the skill instructions and the host's live tool schemas. No Tauri app is required for the
remote connection described here.

## Install the skill

Distribute the complete `tradeflow-mcp/` folder, including `SKILL.md` and `references/`. It contains
no server address or secrets. Do not distribute a user's MCP configuration with it.

Place the folder in the host's local skill location, or import it through the host's skill
management UI, then reload and start a new conversation. Use the host's official documentation for
the exact path or archive format; this skill does not assume a fixed Agent directory layout.

The skill does not register an MCP server. Registration is a separate step below.

## Obtain a credential

Use the server origin supplied by the user or administrator, such as
`https://tradeflow.example.com`. Append `/mcp` for the MCP endpoint. Use HTTPS except for local
loopback development. Do not infer a production server from examples in this skill.

Choose one credential route:

1. **Connection assistant (recommended):** the user creates a named connection in the TradeFlow
   Connect desktop assistant and pastes that connection's connect prompt into the Agent. The
   assistant stores a revocable credential in a private local profile and the prompt names the
   bundled stdio bridge. No token enters the conversation or the Agent configuration.
2. **Administrator-issued static credential:** the administrator generates a dedicated token, adds
   its SHA-256 entry and tool allowlist to the private server configuration, and restarts the
   backend. The repository's command, run by the administrator from its root, is:

   ```sh
   bun --cwd backend run scripts/generateMcpToken.ts office-agent get_inventory,list_transactions 90
   ```

   Its output contains a secret. Run it in a private administrator terminal, not an Agent tool whose
   output enters the conversation. Static credentials are not listed on the user's web page and do
   not inherit account role changes.

3. **Account-bound credential through the API:** use a trusted HTTP client with secrets excluded
   from saved request history and Agent transcripts. Log in at `POST /api/auth/login` with
   `username` and `password`. Keep the response's top-level `token` (login JWT) in memory and use it
   as `Authorization: Bearer ...` for the endpoints below. Do not use this JWT as the MCP
   credential. Account authentication and MCP must be enabled, and the server's additive MCP
   database upgrade must have been applied.

   | Request                                       | Purpose                                                                                  |
   | --------------------------------------------- | ---------------------------------------------------------------------------------------- |
   | `GET /api/mcp/capabilities`                   | Check `data.enabled`, `data.endpointPath`, catalog versions, and `data.credentialDays`   |
   | `GET /api/mcp/catalog`                        | Read the visible tool catalog, `version`, `guideVersion`, and `minBridgeVersion`         |
   | `POST /api/mcp/connections`                   | Send `{"client":"<connection name>","deviceId":"DEVICE_UUID"}`; both fields are required |
   | `GET /api/mcp/connections?page=1&limit=20`    | List this account's credential metadata without secrets                                  |
   | `DELETE /api/mcp/connections/CREDENTIAL_UUID` | Revoke this account's credential; success is HTTP 204                                    |

   `client` is a free-form connection name of up to 64 printable characters, not a fixed Agent list.
   Creation returns HTTP 201 with `data.id`, `data.token`, `data.tools`, `data.expiresAt`, and
   catalog versions. Transfer `data.token` directly into the host's private secret/configuration
   input and retain the ID and expiry for management. The token is returned only once and cannot be
   recovered. Discard the login JWT after setup. Account tokens last 90 days and follow current
   account permissions; password changes, disablement, deletion, expiry, and revocation invalidate
   them.

The web page `https://YOUR_SERVER/#/mcp-connections` supports viewing and revoking account-bound
credentials, not creating or recovering tokens. Installing a skill does not create a credential. Do
not ask the user to paste passwords or bearer tokens into an Agent conversation.

## Configure the host

Prefer the stdio bridge when the user has TradeFlow Connect installed. Otherwise use the host's
remote Streamable HTTP support.

### Stdio bridge (recommended)

The connection prompt provides the executable path and the launch command
`tradeflow-connect serve --profile <uuid>`. Register one local stdio MCP server that runs that
command:

- Use the host's current MCP management command or the configuration fields documented for the
  installed version. Do not copy paths or field names from another host, and do not overwrite
  unrelated settings.
- The bridge reads the credential from its private profile and performs authentication. Do not add a
  token, `Authorization` header, or URL.
- Preserve other MCP servers and comments. Ask the user before editing project-level configuration
  instead of user-level configuration.
- The descriptor command `tradeflow-connect describe --profile <uuid> --json` prints the redacted
  launch details if the prompt is unavailable.

The GUI need not remain open. Removing the local connection in the assistant does not remove the
host entry; remove that entry in the Agent.

### Direct remote fallback

When the host supports remote Streamable HTTP and the user supplies a token privately:

- Endpoint: `https://HOST/mcp` with `Authorization: Bearer <token>`.
- Configure it with the host's documented field names. TradeFlow does not implement OAuth, so
  disable OAuth for this server if the host offers the option.
- Store the token in the host's secret manager or a private environment/secret input. Never place it
  in a project file, a skill file, or the conversation. Restarted processes need the secret supplied
  again.
- Verify remote Bearer-header support on the installed version, enable or trust the connection, and
  start a fresh conversation.

## Verify after connecting or updating

1. Discover tools through the host, not with a separate HTTP client.
2. Call `get_inventory` with `{"page":1,"limit":5}`. Check `query_meta.parameters.limit` and the row
   count. An empty database can still pass.
3. Compare the discovered tools with what the account role should allow. If a tool is missing, check
   the role, the credential allowlist, and whether the host reloaded the connection.
4. Report skill installation, service verification, and successful host use separately. A direct
   HTTP test must not be reported as a native Agent tool call.
5. If tools are missing from a conversation created before installation or before a server change,
   reload or start a new conversation.

## Update after a server change

The backend catalog version changes when the visible tool entries change. Use the assistant's update
prompt or perform the same steps manually:

1. Re-discover tools so added, removed, renamed, or re-parameterized tools are visible.
2. Compare the names and input schemas with the previous list and update any local notes or skill
   copy to the current guide version.
3. Run the minimal inventory query again.
4. Do not reinstall the connection, reissue the credential, or broaden permissions to obtain a
   missing tool. Report the role and credential limits instead.
5. Do not call transaction draft tools during an update check unless the user explicitly asks.

## Troubleshoot and switch servers

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
attempt and request the missing status or administrator check. A bridge cannot fix 401, 403, 429, or
TLS rejection.

When switching servers, keep the old configuration until the destination's credential and minimal
query are verified. If a candidate configuration fails, restore it only if no external edit
occurred, and revoke the newly issued account credential (not a reused one). After success, reload
the Agent and revoke the old account credential on the original server's web page. If that server is
offline, record the non-secret credential ID for later cleanup. Removing a local entry does not
revoke remote access or clear a running Agent's memory.
