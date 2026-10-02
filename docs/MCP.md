# TradeFlow MCP server

TradeFlow exposes a read-only Model Context Protocol endpoint at `/mcp`. It uses the existing
PostgreSQL database and business calculations. MCP is disabled until explicitly enabled in the
runtime `config/config.yaml`.

## Enable it

Keep `config/config.yaml` private and set `mcp.enabled` to `true`. Set `allowedHosts` to the
hostnames that clients use to reach TradeFlow, without a scheme or port. Set `allowedOrigins` to the
hostnames of browser clients; an empty list uses `allowedHosts`. Requests without an `Origin`
header, as normally sent by server-side agents, are allowed.

```yaml
mcp:
  enabled: true
  allowedHosts:
    - tradeflow.example.com
  allowedOrigins: []
  requestsPerMinute: 60
  maxConcurrentRequests: 2
  maxConcurrentAnalysis: 1
  credentials: []
```

Create a separate token for each integration. From the repository root, pass an ID, a
comma-separated tool list, and optionally a validity period in days (default 90):

```sh
bun --cwd backend run scripts/generateMcpToken.ts office-agent get_inventory,list_transactions 90
```

The command prints the bearer token once and a credential entry containing only its SHA-256 digest.
Copy the entry under `mcp.credentials`, restart TradeFlow, and store the token in the agent's secret
manager. To revoke access, remove or disable that entry and restart TradeFlow. Keep only enabled MCP
tools in each credential; available tools are filtered before the server advertises them.

The endpoint is `https://tradeflow.example.com/mcp`. Configure the client with
`Authorization: Bearer <token>` and the Streamable HTTP transport. Terminate public TLS at the
deployment's HTTPS reverse proxy and forward requests to TradeFlow. Do not expose PostgreSQL to the
agent.

## Available tools

| Tool                | What it returns                                                                                 |
| ------------------- | ----------------------------------------------------------------------------------------------- |
| `search_partners`   | Customer and supplier codes and names                                                           |
| `search_products`   | Product codes, models, and categories                                                           |
| `get_inventory`     | Current on-hand quantities                                                                      |
| `list_transactions` | Inbound or outbound records, with date, partner, product, quantity, price, and document numbers |
| `get_receivables`   | Receivable balances or one customer's transaction and payment details                           |
| `get_payables`      | Payable balances or one supplier's transaction and payment details                              |
| `get_analysis`      | Date-filtered purchase or sales summary; sales includes FIFO cost, profit, and profit rate      |

All list tools default to 20 rows per page and allow at most 100. Dates use `YYYY-MM-DD`. Results
include the validated query parameters, pagination information, a query timestamp, and the
configured currency symbol. Analysis reads the same FIFO cost calculation as the existing analysis
API. It does not refresh overview or invoice caches or recalculate inventory.

Partner contacts, phone numbers, addresses, and free-text remarks are excluded from MCP results.
Each request is authenticated independently. MCP queries use a separate Prisma pool with SQL query
logging disabled and run in a PostgreSQL read-only transaction. Existing business mutation and audit
routes are not exposed.

The static bearer credentials support MCP clients that can set request headers. They do not
implement OAuth login or per-employee authorization. Changes to configured credentials, tool
permissions, host allowlists, or limits take effect after a backend restart.
