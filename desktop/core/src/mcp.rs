use crate::{
    api,
    diagnostics::{self, Stage},
    storage::Profile,
};
use anyhow::{Result, bail};
use rmcp::{
    RoleClient, RoleServer, ServerHandler, ServiceExt,
    model::*,
    service::{RequestContext, RunningService},
    transport::{
        StreamableHttpClientTransport, streamable_http_client::StreamableHttpClientTransportConfig,
    },
};
use serde_json::{Value, json};
use std::{sync::Arc, time::Duration};

pub type Remote = RunningService<RoleClient, ClientConfig>;
pub async fn connect(profile: &Profile) -> Result<Remote> {
    api::normalize_url(&profile.base_url)?;
    let transport = StreamableHttpClientTransport::with_client(
        api::http_client()?,
        StreamableHttpClientTransportConfig::with_uri(format!("{}/mcp", profile.base_url))
            .auth_header(profile.token.clone()),
    );
    let service = tokio::time::timeout(
        Duration::from_secs(30),
        ClientConfig::default().serve(transport),
    )
    .await
    .map_err(|_| anyhow::anyhow!("MCP_TIMEOUT"))?
    .map_err(|error| anyhow::anyhow!(classify(&error.to_string())))?;
    Ok(service)
}
pub fn classify(error: &str) -> &'static str {
    let text = error.to_ascii_lowercase();
    let status = |code: u16| {
        [
            format!("http {code}"),
            format!("status: {code}"),
            format!("status code {code}"),
            format!("({code} "),
            format!("status={code}"),
            format!("http_{code}"),
        ]
        .iter()
        .any(|pattern| text.contains(pattern))
    };
    if status(401) || text.contains("authorization required") || text.contains("auth required") {
        "HTTP_401"
    } else if status(403) || text.contains("insufficient scope") {
        "HTTP_403"
    } else if status(404) {
        "HTTP_404"
    } else if status(429) {
        "HTTP_429"
    } else if status(500) {
        "HTTP_500"
    } else if status(502) {
        "HTTP_502"
    } else if status(503) {
        "HTTP_503"
    } else if status(504) {
        "HTTP_504"
    } else if text.contains("certificate") || text.contains("tls") {
        "TLS_ERROR"
    } else if text.contains("timed out") || text.contains("timeout") {
        "NETWORK_TIMEOUT"
    } else if text.contains("protocol version")
        || text.contains("unexpectedresponse")
        || text.contains("unexpected content type")
        || text.contains("unexpected server response")
    {
        "HOST_COMPATIBILITY"
    } else if text.contains("connect")
        || text.contains("dns")
        || text.contains("error sending request")
    {
        "NETWORK_CONNECTION_FAILED"
    } else {
        "MCP_CONNECTION_FAILED"
    }
}
pub async fn probe(profile: &Profile) -> Result<Value> {
    let remote = diagnostics::step(Stage::McpHandshake, Box::pin(connect(profile))).await?;
    let result = async {
        let tools = diagnostics::step(Stage::DiscoverTools, async {
            remote
                .list_tools(None)
                .await
                .map_err(|e| anyhow::anyhow!(classify(&e.to_string())))
        })
        .await?;
        let names: Vec<String> = tools
            .tools
            .iter()
            .map(|t| t.name.to_string())
            .filter(|name| {
                matches!(
                    name.as_str(),
                    "search_partners"
                        | "search_products"
                        | "get_inventory"
                        | "list_transactions"
                        | "get_receivables"
                        | "get_payables"
                        | "get_analysis"
                        | "submit_transaction_drafts"
                        | "update_transaction_draft"
                        | "list_transaction_drafts"
                        | "get_transaction_draft"
                )
            })
            .collect();
        if names.is_empty() {
            bail!("NO_AUTHORIZED_TOOLS");
        }
        let name = if names.iter().any(|v| v == "search_products") {
            "search_products"
        } else if names.iter().any(|v| v == "get_inventory") {
            "get_inventory"
        } else {
            "list_transaction_drafts"
        };
        diagnostics::step(Stage::SampleQuery, async {
            let call = remote
                .call_tool(
                    CallToolRequestParams::new(name)
                        .with_arguments(json!({"page":1,"limit":1}).as_object().unwrap().clone()),
                )
                .await
                .map_err(|e| anyhow::anyhow!(classify(&e.to_string())))?;
            if call.is_error == Some(true) {
                bail!("MCP_QUERY_FAILED");
            }
            if call.structured_content.is_none() {
                bail!("STRUCTURED_RESULT_MISSING");
            }
            Ok(())
        })
        .await?;
        Ok(json!({"tools":names,"structuredResult":true,"sampleQuery":name}))
    }
    .await;
    let _ = remote.cancel().await;
    result
}
fn upstream_error(error: rmcp::ServiceError) -> ErrorData {
    match error {
        rmcp::ServiceError::McpError(data) => data,
        other => ErrorData::internal_error(classify(&other.to_string()), None),
    }
}
struct Bridge {
    remote: Arc<Remote>,
    diagnostics: Option<diagnostics::Operation>,
}
impl ServerHandler for Bridge {
    fn get_info(&self) -> ServerConfig {
        ServerConfig::new(ServerCapabilities::builder().enable_tools().build()).with_server_info(
            Implementation::new("tradeflow-connect", env!("CARGO_PKG_VERSION")),
        )
    }
    async fn list_tools(
        &self,
        params: Option<PaginatedRequestParams>,
        _context: RequestContext<RoleServer>,
    ) -> std::result::Result<ListToolsResult, ErrorData> {
        let work = async {
            diagnostics::step(Stage::DiscoverTools, async {
                self.remote
                    .list_tools(params)
                    .await
                    .map_err(|e| anyhow::anyhow!(classify(&e.to_string())))
            })
            .await
        };
        let result = if let Some(operation) = &self.diagnostics {
            operation.fork().run(work).await.0
        } else {
            work.await
        };
        result.map_err(|e| ErrorData::internal_error(crate::connection::safe_code(&e), None))
    }
    async fn call_tool(
        &self,
        params: CallToolRequestParams,
        _context: RequestContext<RoleServer>,
    ) -> std::result::Result<CallToolResponse, ErrorData> {
        let mut upstream = None;
        let work = async {
            diagnostics::step(Stage::SampleQuery, async {
                match self.remote.call_tool(params).await {
                    Ok(value) => Ok(value),
                    Err(error) => {
                        let code = classify(&error.to_string());
                        upstream = Some(upstream_error(error));
                        Err(anyhow::anyhow!(code))
                    }
                }
            })
            .await
        };
        let result = if let Some(operation) = &self.diagnostics {
            operation.fork().run(work).await.0
        } else {
            work.await
        };
        result.map(Into::into).map_err(|error| {
            upstream.unwrap_or_else(|| {
                ErrorData::internal_error(crate::connection::safe_code(&error), None)
            })
        })
    }
}
pub async fn serve(profile: Profile) -> Result<()> {
    let remote = Arc::new(diagnostics::step(Stage::McpHandshake, connect(&profile)).await?);
    let server = Bridge {
        remote: remote.clone(),
        diagnostics: diagnostics::current(),
    }
    .serve(rmcp::transport::stdio())
    .await
    .map_err(|_| anyhow::anyhow!("BRIDGE_START_FAILED"))?;
    server
        .waiting()
        .await
        .map_err(|_| anyhow::anyhow!("BRIDGE_IO_FAILED"))?;
    if let Ok(remote) = Arc::try_unwrap(remote) {
        let _ = remote.cancel().await;
    }
    Ok(())
}
