use serde_json::json;
use std::{
    io::{BufRead, BufReader},
    process::{Command, Stdio},
};
use tradeflow_connect::{
    api::Session,
    connection,
    diagnostics::{Action, Operation},
    storage::Store,
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
fn helper() -> std::path::PathBuf {
    env!("CARGO_BIN_EXE_tradeflow-connect").into()
}
#[tokio::test]
async fn connecting_creates_one_profile_and_reuses_the_credential() {
    let (_fixture, session) = fixture(&[]);
    let dir = tempfile::tempdir().unwrap();
    let store = Store::at(dir.path().to_owned()).unwrap();
    let operation = Operation::new(
        &store,
        Action::Connect,
        Some("Office assistant".into()),
        Some(&session.base_url),
        None,
    );
    let (result, report) = operation
        .run(connection::connect(
            &session,
            &store,
            helper(),
            None,
            "Office assistant",
            "bridge",
        ))
        .await;
    let result = result.unwrap();
    assert!(report.error_code.is_none());
    assert_eq!(result["serviceVerified"], true);
    assert_eq!(result["hostActivationRequired"], true);
    assert_eq!(result["reusedCredential"], false);
    assert_eq!(result["profile"]["client"], "Office assistant");
    assert!(result["profile"]["catalogVersion"].is_string());
    let profiles = store.profiles().unwrap();
    assert_eq!(profiles.len(), 1);
    let profile = &profiles[0];
    assert_eq!(profile.client, "Office assistant");
    assert_eq!(profile.mode, "bridge");
    assert!(!profile.token.is_empty());
    assert!(profile.last_sync_at.is_some());
    assert_eq!(session.get("/api/stats").await.unwrap()["issueCount"], 1);

    let reused = connection::connect(
        &session,
        &store,
        helper(),
        Some(profile.id.clone()),
        "Ignored rename",
        "bridge",
    )
    .await
    .unwrap();
    assert_eq!(reused["reusedCredential"], true);
    assert_eq!(reused["profile"]["client"], "Office assistant");
    assert_eq!(session.get("/api/stats").await.unwrap()["issueCount"], 1);

    let removed = connection::disconnect(None, &store, &profile.id, false)
        .await
        .unwrap();
    assert_eq!(removed["localRemoved"], true);
    assert!(store.profiles().unwrap().is_empty());
    assert_eq!(store.pending_revocations().unwrap().len(), 1);
    assert!(connection::recover_operations(&store).unwrap().is_empty());
}
#[tokio::test]
async fn a_failed_probe_revokes_or_queues_the_new_credential_without_leaking_it() {
    let (_fixture, session) = fixture(&["--fail-query", "--fail-revoke"]);
    let dir = tempfile::tempdir().unwrap();
    let store = Store::at(dir.path().to_owned()).unwrap();
    let operation = Operation::new(
        &store,
        Action::Connect,
        Some("Office assistant".into()),
        Some(&session.base_url),
        None,
    );
    let (result, report) = operation
        .run(connection::connect(
            &session,
            &store,
            helper(),
            None,
            "Office assistant",
            "bridge",
        ))
        .await;
    assert_eq!(result.unwrap_err().to_string(), "MCP_QUERY_FAILED");
    assert_eq!(
        serde_json::to_value(&report).unwrap()["failedStage"],
        "sample_query"
    );
    assert!(store.profiles().unwrap().is_empty());
    let pending = store.pending_revocations().unwrap();
    assert_eq!(pending.len(), 1);
    assert_eq!(
        pending[0].last_error.as_deref(),
        Some("INSTALL_FAILED_CLEANUP_PENDING")
    );
    let logs =
        serde_json::to_string(&tradeflow_connect::diagnostics::recent(&store).unwrap()).unwrap();
    assert!(!logs.contains("tfmcp_"));
    assert!(!logs.contains("fixture-jwt"));
}
#[tokio::test]
async fn syncing_refreshes_tools_and_catalog_metadata() {
    let (_fixture, session) = fixture(&[]);
    let dir = tempfile::tempdir().unwrap();
    let store = Store::at(dir.path().to_owned()).unwrap();
    let profile = connection::connect(
        &session,
        &store,
        helper(),
        None,
        "Office assistant",
        "bridge",
    )
    .await
    .unwrap()["profile"]
        .clone();
    let id = profile["id"].as_str().unwrap();
    let mut stored = store.load(id).unwrap();
    stored.tools = vec!["get_inventory".into(), "retired_tool".into()];
    stored.catalog_version = Some("old-version".into());
    store.save(&stored).unwrap();

    let result = connection::sync(&session, &store, id).await.unwrap();
    assert_eq!(result["changed"], true);
    assert_eq!(result["removed"], json!(["retired_tool"]));
    assert_eq!(result["added"], json!([]));
    assert_eq!(result["profile"]["tools"], json!(["get_inventory"]));
    assert_ne!(result["profile"]["catalogVersion"], "old-version");
    assert!(result["profile"]["lastSyncAt"].is_string());
    assert_eq!(result["catalog"]["guideVersion"], "2");
}
