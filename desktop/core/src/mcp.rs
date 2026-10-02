use crate::{api, storage::Profile};
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
    if error.contains("401") || error.contains("authorization required") {
        "HTTP_401"
    } else if error.contains("403") {
        "HTTP_403"
    } else if error.contains("404") {
        "HTTP_404"
    } else if error.contains("429") {
        "HTTP_429"
    } else if error.contains("certificate") || error.contains("TLS") {
        "TLS_ERROR"
    } else if error.contains("protocol version") || error.contains("UnexpectedResponse") {
        "HOST_COMPATIBILITY"
    } else {
        "MCP_CONNECTION_FAILED"
    }
}
pub async fn probe(profile: &Profile) -> Result<Value> {
    let remote = connect(profile).await?;
    let result = async {
        let tools = remote
            .list_tools(None)
            .await
            .map_err(|e| anyhow::anyhow!(classify(&e.to_string())))?;
        let names: Vec<String> = tools.tools.iter().map(|t| t.name.to_string()).collect();
        if names.is_empty() {
            bail!("NO_AUTHORIZED_TOOLS");
        }
        let name = if names.iter().any(|v| v == "search_products") {
            "search_products"
        } else {
            "get_inventory"
        };
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
        self.remote.list_tools(params).await.map_err(|_| {
            ErrorData::internal_error(
                "Upstream tool discovery failed; run tradeflow-connect doctor.",
                None,
            )
        })
    }
    async fn call_tool(
        &self,
        params: CallToolRequestParams,
        _context: RequestContext<RoleServer>,
    ) -> std::result::Result<CallToolResponse, ErrorData> {
        self.remote
            .call_tool(params)
            .await
            .map(Into::into)
            .map_err(upstream_error)
    }
}
pub async fn serve(profile: Profile) -> Result<()> {
    let remote = Arc::new(connect(&profile).await?);
    let server = Bridge {
        remote: remote.clone(),
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
