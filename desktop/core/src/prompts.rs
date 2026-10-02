use crate::storage::Profile;
use serde_json::{Value, json};
fn quote(value: &str) -> String {
    if cfg!(windows) {
        format!("'{}'", value.replace('\'', "''"))
    } else {
        format!("'{}'", value.replace('\'', "'\"'\"'"))
    }
}
pub fn generate(profile: &Profile) -> Value {
    let executable = quote(&profile.helper_path.to_string_lossy());
    let invoke = if cfg!(windows) { "& " } else { "" };
    let common = format!(
        "--profile {} --client {}",
        profile.id,
        profile.client.name()
    );
    let doctor = format!("{invoke}{executable} doctor {common} --json");
    let repair = format!("{invoke}{executable} repair {common} --mode auto --json");
    let bridge = format!("{invoke}{executable} repair {common} --mode bridge --json");
    json!({
        "business":format!("Use the TradeFlow MCP connection {}. Available read-only tools: {}. Query the requested date range, paginate when needed, and report the currency and FIFO cost basis returned by the tools. First list available tools and perform one minimal inventory query. Then answer: summarize this month's sales, cost and profit by customer. If financial tools are unavailable, explain the account's data restriction instead of inventing results.",profile.server_name(),profile.tools.join(", ")),
        "repair":format!("Help repair my TradeFlow MCP connection in {}. Server: {}. Profile: {}. Managed server name: {}. User configuration: {}.\n\nSetup logic: the TradeFlow GUI authenticates my account using a short-lived login JWT, creates a separate 90-day MCP credential, stores it locally with user-only permissions, and installs this managed entry. Remote mode connects to {}/mcp using a Bearer header; OpenCode V2 places the entry under mcp.servers with type remote and oauth false; WorkBuddy places it under mcpServers with type streamableHttp, url and headers. Bridge mode launches the bundled helper with serve --profile {}. All seven business tools are read-only; reader accounts only have partner, product, inventory and transaction tools.\n\n1. Run the following diagnostic command and read only its redacted JSON:\n{}\n2. If local configuration is missing or damaged, run:\n{}\n3. Run diagnostics again and verify configurationWritten and serviceVerified. These do not prove host activation: enable/trust or reload the host as needed, list TradeFlow tools and make one minimal read-only query.\n4. If the host cannot use remote Streamable HTTP but the endpoint passes diagnostics, use the bundled bridge:\n{}\n5. HTTP 401 or an expired/revoked credential requires me to log into the GUI and update the connection. HTTP 403 requires checking account and Host permissions. HTTP 404 requires checking the backend MCP switch and reverse proxy. HTTP 429 requires waiting. Network/TLS errors require restoring connectivity; do not bypass certificate validation. Project overrides require a targeted user explanation; do not silently modify project files.\n\nDo not open credential files, print full MCP configurations, place tokens in chat, or change account permissions or host security settings. The helper performs deterministic merges, backups, concurrent-change checks and rollback. Show the redacted diagnosis, actions taken, and whether a real host query succeeded. If a user trust/reload step is needed, state it explicitly.",profile.client.name(),profile.base_url,profile.id,profile.server_name(),profile.config_path.display(),profile.base_url,profile.id,doctor,repair,bridge)
    })
}
