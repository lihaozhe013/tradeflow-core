use serde_json::json;
use std::{
    io::{BufRead, BufReader},
    process::{Command, Stdio},
};
use tradeflow_connect::{
    api::Session,
    config, connection,
    diagnostics::{Action, Operation},
    storage::{Client, Profile, Store},
};
struct Fixture(std::process::Child);
impl Drop for Fixture {
    fn drop(&mut self) {
        let _ = self.0.kill();
        let _ = self.0.wait();
    }
}
fn fixture(args: &[&str]) -> (Fixture, Session) {
    let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../tests/connect-fixture.ts");
    let mut process = Fixture(
        Command::new("bun")
            .arg(path)
            .args(args)
            .stdout(Stdio::piped())
            .spawn()
            .unwrap(),
    );
    let mut line = String::new();
    BufReader::new(process.0.stdout.take().unwrap())
        .read_line(&mut line)
        .unwrap();
    let port: u16 = line.trim().parse().unwrap();
    (
        process,
        Session {
            base_url: format!("http://127.0.0.1:{port}"),
            jwt: "fixture-jwt".into(),
            user: json!({"username":"same-name"}),
        },
    )
}
fn old(store: &Store) -> Profile {
    let profile = Profile {
        id: uuid::Uuid::new_v4().to_string(),
        connection_id: uuid::Uuid::new_v4().to_string(),
        owner_username: "same-name".into(),
        client: Client::Workbuddy,
        base_url: "http://127.0.0.1:1".into(),
        token: "tfmcp_old-secret".into(),
        tools: vec!["get_inventory".into()],
        expires_at: "2030-01-01T00:00:00Z".into(),
        config_path: store.root.join("mcp.json"),
        helper_path: "unused".into(),
        mode: "remote".into(),
        pending_cleanup: vec![],
    };
    store.save(&profile).unwrap();
    std::fs::write(
        &profile.config_path,
        config::patch(
            "{\n// Preserve this comment\n\"mcpServers\":{\"other\":{\"command\":\"other\"}}\n}",
            &profile.client,
            &profile.server_name(),
            Some(&config::entry(&profile)),
        )
        .unwrap(),
    )
    .unwrap();
    profile
}
#[tokio::test]
async fn offline_source_is_replaced_and_reconnecting_reuses_the_credential() {
    let (_fixture, session) = fixture(&[]);
    let dir = tempfile::tempdir().unwrap();
    let store = Store::at(dir.path().to_owned()).unwrap();
    let source = old(&store);
    let operation = Operation::new(
        &store,
        Action::Connect,
        Some(Client::Workbuddy),
        Some(&session.base_url),
        None,
    );
    let (result, report) = operation
        .run(connection::connect_at(
            &session,
            &store,
            Client::Workbuddy,
            "unused".into(),
            None,
            "remote",
            source.config_path.clone(),
        ))
        .await;
    let result = result.unwrap();
    assert_eq!(result["serviceVerified"], true);
    assert!(report.error_code.is_none());
    assert!(store.load(&source.id).is_err());
    assert_eq!(store.profiles().unwrap().len(), 1);
    let profile = store.profiles().unwrap().remove(0);
    assert!(config::configured(&profile).unwrap());
    let text = std::fs::read_to_string(&source.config_path).unwrap();
    assert!(text.contains("Preserve this comment"));
    assert!(!text.contains(&source.server_name()));
    assert!(text.contains("other"));
    assert_eq!(
        store.pending_revocations().unwrap()[0].connection_id,
        source.connection_id
    );
    let result = connection::connect_at(
        &session,
        &store,
        Client::Workbuddy,
        "unused".into(),
        None,
        "remote",
        source.config_path.clone(),
    )
    .await
    .unwrap();
    assert_eq!(result["reusedCredential"], true);
    assert_eq!(session.get("/api/stats").await.unwrap()["issueCount"], 1);
    assert_eq!(session.get("/api/stats").await.unwrap()["revoked"], 0);
    let result = connection::disconnect(None, &store, &profile.id, false)
        .await
        .unwrap();
    assert_eq!(result["localRemoved"], true);
    assert!(store.profiles().unwrap().is_empty());
    assert!(connection::recover_switches(&store).unwrap().is_empty());
    assert!(
        !std::fs::read_to_string(source.config_path)
            .unwrap()
            .contains(&profile.server_name())
    );
}
#[tokio::test]
async fn query_failure_restores_source_and_records_failed_stage_without_secrets() {
    let (_fixture, session) = fixture(&["--fail-query", "--fail-revoke"]);
    let dir = tempfile::tempdir().unwrap();
    let store = Store::at(dir.path().to_owned()).unwrap();
    let source = old(&store);
    let before = std::fs::read_to_string(&source.config_path).unwrap();
    let operation = Operation::new(
        &store,
        Action::Connect,
        Some(Client::Workbuddy),
        Some(&session.base_url),
        None,
    );
    let (result, report) = operation
        .run(connection::connect_at(
            &session,
            &store,
            Client::Workbuddy,
            "unused".into(),
            None,
            "remote",
            source.config_path.clone(),
        ))
        .await;
    assert_eq!(result.unwrap_err().to_string(), "MCP_QUERY_FAILED");
    assert_eq!(
        serde_json::to_value(&report).unwrap()["failedStage"],
        "sample_query"
    );
    assert_eq!(
        std::fs::read_to_string(&source.config_path).unwrap(),
        before
    );
    assert_eq!(store.profiles().unwrap().len(), 1);
    assert_eq!(store.load(&source.id).unwrap().token, source.token);
    assert!(store.switch_journals().unwrap().is_empty());
    assert_eq!(store.pending_revocations().unwrap().len(), 1);
    let logs =
        serde_json::to_string(&tradeflow_connect::diagnostics::recent(&store).unwrap()).unwrap();
    assert!(!logs.contains("tfmcp_"));
    assert!(!logs.contains("fixture-jwt"));
    assert!(logs.contains("HTTP_503"));
}
