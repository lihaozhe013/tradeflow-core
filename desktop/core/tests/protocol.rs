use rmcp::{
    ServiceExt,
    model::{CallToolRequestParams, ClientConfig},
    transport::{ConfigureCommandExt, TokioChildProcess},
};
use serde_json::json;
use std::{
    io::{BufRead, BufReader},
    process::{Command, Stdio},
    time::Duration,
};
use tradeflow_connect::{
    mcp,
    storage::{Client, Profile, Store},
};
struct Fixture(std::process::Child);
impl Drop for Fixture {
    fn drop(&mut self) {
        let _ = self.0.kill();
        let _ = self.0.wait();
    }
}
#[tokio::test]
async fn rust_client_and_stdio_bridge_interoperate_with_typescript_server() {
    let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../tests/mcp-fixture.ts");
    let mut fixture = Fixture(
        Command::new("bun")
            .arg(path)
            .stdout(Stdio::piped())
            .stderr(Stdio::inherit())
            .spawn()
            .expect("Bun 1.4.2 is required for protocol interoperability tests"),
    );
    let mut line = String::new();
    BufReader::new(fixture.0.stdout.take().unwrap())
        .read_line(&mut line)
        .unwrap();
    let port: u16 = line
        .trim()
        .parse()
        .expect("Fixture did not report its port");
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path().canonicalize().unwrap();
    let store = Store::at(root.clone()).unwrap();
    let profile = Profile {
        id: uuid::Uuid::new_v4().to_string(),
        connection_id: uuid::Uuid::new_v4().to_string(),
        owner_username: "fixture-user".into(),
        client: Client::Opencode,
        base_url: format!("http://127.0.0.1:{port}"),
        token: "tfmcp_protocol_fixture".into(),
        tools: vec!["get_inventory".into()],
        expires_at: "2030-01-01T00:00:00Z".into(),
        config_path: root.join("config.json"),
        helper_path: env!("CARGO_BIN_EXE_tradeflow-connect").into(),
        mode: "bridge".into(),
        pending_cleanup: vec![],
    };
    let result = tokio::time::timeout(Duration::from_secs(35), mcp::probe(&profile))
        .await
        .unwrap()
        .unwrap();
    assert_eq!(result["structuredResult"], true);
    let mut invalid = profile.clone();
    invalid.token = "invalid".into();
    assert!(mcp::probe(&invalid).await.is_err());
    store.save(&profile).unwrap();
    let transport = TokioChildProcess::new(
        tokio::process::Command::new(&profile.helper_path).configure(|cmd| {
            cmd.args(["serve", "--profile", &profile.id])
                .env("TRADEFLOW_CONNECT_DATA_DIR", &root)
                .stderr(Stdio::null());
        }),
    )
    .unwrap();
    let remote = tokio::time::timeout(
        Duration::from_secs(35),
        ClientConfig::default().serve(transport),
    )
    .await
    .unwrap()
    .unwrap();
    assert_eq!(
        remote.list_tools(None).await.unwrap().tools[0].name,
        "get_inventory"
    );
    let result = remote
        .call_tool(
            CallToolRequestParams::new("get_inventory")
                .with_arguments(json!({"limit":1}).as_object().unwrap().clone()),
        )
        .await
        .unwrap();
    assert_eq!(result.structured_content.unwrap()["data"], json!([]));
    let error = remote
        .call_tool(CallToolRequestParams::new("get_analysis"))
        .await
        .unwrap_err();
    assert!(
        matches!(error, rmcp::ServiceError::McpError(data) if data.message.contains("not found"))
    );
    remote.cancel().await.unwrap();
}
