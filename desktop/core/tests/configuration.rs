use serde_json::json;
use tempfile::TempDir;
use tradeflow_connect::{
    api::normalize_url,
    config, prompts,
    storage::{Client, Profile, Store, atomic_write},
};
fn fixture(dir: &TempDir) -> (Store, Profile) {
    let root = dir.path().canonicalize().unwrap();
    let store = Store::at(root.join("private")).unwrap();
    let profile = Profile {
        id: uuid::Uuid::new_v4().to_string(),
        connection_id: uuid::Uuid::new_v4().to_string(),
        owner_username: "fixture-user".into(),
        client: Client::Opencode,
        base_url: "https://tradeflow.example.com".into(),
        token: "tfmcp_test_secret".into(),
        tools: vec!["get_inventory".into()],
        expires_at: "2030-01-01T00:00:00Z".into(),
        config_path: root.join("中文 space/opencode.jsonc"),
        helper_path: root.join("bin/tradeflow-connect"),
        mode: "remote".into(),
        pending_cleanup: vec![],
    };
    (store, profile)
}
#[test]
fn preserves_comments_other_servers_and_is_idempotent() {
    let text = "{\n// keep this\n\"model\": \"test\",\n\"mcp\": {\"servers\": {\"other\": {\"type\":\"remote\",\"url\":\"https://other\"}}},\n}";
    let entry = json!({"type":"remote","url":"https://example.com/mcp"});
    let once = config::patch(text, &Client::Opencode, "tradeflow_test", Some(&entry)).unwrap();
    let twice = config::patch(&once, &Client::Opencode, "tradeflow_test", Some(&entry)).unwrap();
    assert!(twice.contains("// keep this"));
    let parsed = config::parse(&twice).unwrap();
    assert_eq!(parsed["model"], "test");
    assert_eq!(parsed["mcp"]["servers"]["other"]["url"], "https://other");
    assert_eq!(parsed["mcp"]["servers"].as_object().unwrap().len(), 2);
}
#[test]
fn malformed_config_is_preserved_and_non_object_branches_are_rejected() {
    assert!(
        config::patch(
            "{broken",
            &Client::Opencode,
            "tradeflow_test",
            Some(&json!({}))
        )
        .is_err()
    );
    assert!(
        config::patch(
            "{\"mcp\":true}",
            &Client::Opencode,
            "tradeflow_test",
            Some(&json!({}))
        )
        .is_err()
    );
}
#[test]
fn rollback_restores_original_and_refuses_concurrent_edits() {
    let dir = tempfile::tempdir().unwrap();
    let (store, profile) = fixture(&dir);
    atomic_write(&profile.config_path, b"{\"model\":\"original\"}\n").unwrap();
    let change = config::install(&store, &profile, false).unwrap();
    assert!(config::configured(&profile).unwrap());
    change.rollback().unwrap();
    assert_eq!(
        std::fs::read_to_string(&profile.config_path).unwrap(),
        "{\"model\":\"original\"}\n"
    );
    let change = config::install(&store, &profile, false).unwrap();
    atomic_write(&profile.config_path, b"{\"model\":\"edited\"}").unwrap();
    assert!(change.rollback().is_err());
    assert!(
        std::fs::read_to_string(&profile.config_path)
            .unwrap()
            .contains("edited")
    );
}
#[test]
fn diagnostics_and_prompts_do_not_expose_credentials() {
    let dir = tempfile::tempdir().unwrap();
    let (store, profile) = fixture(&dir);
    store.save(&profile).unwrap();
    assert_eq!(store.load(&profile.id).unwrap().token, profile.token);
    assert!(!profile.summary().to_string().contains(&profile.token));
    let text = prompts::generate(&profile).to_string();
    assert!(!text.contains(&profile.token));
    assert!(text.contains("doctor"));
    assert!(text.contains("repair"));
    assert!(store.load("../../outside").is_err());
}
#[test]
fn rejects_remote_http_credentials_and_url_components() {
    assert!(normalize_url("http://example.com").is_err());
    assert!(normalize_url("https://user:password@example.com").is_err());
    assert!(normalize_url("https://example.com/path").is_err());
    assert!(normalize_url("https://example.com?token=secret").is_err());
    assert_eq!(
        normalize_url("http://127.0.0.1:8000").unwrap(),
        "http://127.0.0.1:8000"
    );
}
#[test]
fn bridge_configs_have_no_token_and_workbuddy_has_separate_schema() {
    let dir = tempfile::tempdir().unwrap();
    let (_, mut profile) = fixture(&dir);
    profile.mode = "bridge".into();
    assert!(!config::entry(&profile).to_string().contains(&profile.token));
    profile.client = Client::Workbuddy;
    let text = config::patch(
        "{\"mcpServers\":{\"other\":{\"command\":\"example\"}}}",
        &profile.client,
        &profile.server_name(),
        Some(&config::entry(&profile)),
    )
    .unwrap();
    let parsed = config::parse(&text).unwrap();
    assert_eq!(parsed["mcpServers"]["other"]["command"], "example");
    assert!(parsed["mcpServers"][profile.server_name()]["args"].is_array());
}
#[test]
fn reports_project_overrides_without_modifying_them() {
    let dir = tempfile::tempdir().unwrap();
    let (_, profile) = fixture(&dir);
    let path = dir.path().canonicalize().unwrap().join("opencode.json");
    let text =
        json!({"mcp":{"servers":{profile.server_name():{"url":"https://override"}}}}).to_string();
    std::fs::write(&path, &text).unwrap();
    assert_eq!(
        config::overrides(&profile, &dir.path().canonicalize().unwrap()).len(),
        1
    );
    assert_eq!(std::fs::read_to_string(path).unwrap(), text);
}
#[cfg(unix)]
#[test]
fn credential_files_are_private_and_symlinks_are_rejected() {
    use std::os::unix::fs::{PermissionsExt, symlink};
    let dir = tempfile::tempdir().unwrap();
    let (store, profile) = fixture(&dir);
    store.save(&profile).unwrap();
    let path = store.root.join(format!("{}.json", profile.id));
    assert_eq!(
        std::fs::metadata(path).unwrap().permissions().mode() & 0o777,
        0o600
    );
    assert_eq!(
        std::fs::metadata(&store.root).unwrap().permissions().mode() & 0o777,
        0o700
    );
    let link = dir.path().join("linked");
    symlink(&store.root, &link).unwrap();
    assert!(Store::at(link).is_err());
}
