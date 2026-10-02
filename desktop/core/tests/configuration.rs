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
fn replacing_a_connection_is_one_reversible_jsonc_change() {
    let dir = tempfile::tempdir().unwrap();
    let (store, old) = fixture(&dir);
    atomic_write(
        &old.config_path,
        format!(
            "{{\n// keep comment\n\"other\":true,\n\"mcp\":{{\"servers\":{{\"{}\":{{\"url\":\"old\"}},\"keep\":{{\"url\":\"keep\"}}}}}}}}",
            old.server_name()
        )
        .as_bytes(),
    )
    .unwrap();
    let mut new = old.clone();
    new.id = uuid::Uuid::new_v4().to_string();
    new.base_url = "https://new.tradeflow.example.com".into();
    new.connection_id = uuid::Uuid::new_v4().to_string();
    let change = config::install_replacing(&store, &new, Some(&old), false).unwrap();
    let installed = std::fs::read_to_string(&new.config_path).unwrap();
    assert!(installed.contains("// keep comment"));
    let parsed = config::parse(&installed).unwrap();
    assert!(parsed["mcp"]["servers"][new.server_name()].is_object());
    assert!(parsed["mcp"]["servers"][old.server_name()].is_null());
    assert_eq!(parsed["mcp"]["servers"]["keep"]["url"], "keep");
    change.rollback().unwrap();
    let restored = config::parse(&std::fs::read_to_string(&new.config_path).unwrap()).unwrap();
    assert!(restored["mcp"]["servers"][old.server_name()].is_object());
    assert!(restored["mcp"]["servers"][new.server_name()].is_null());
}
#[test]
fn switch_keeps_the_source_entry_until_the_candidate_has_been_verified() {
    let dir = tempfile::tempdir().unwrap();
    let (store, old) = fixture(&dir);
    atomic_write(
        &old.config_path,
        format!(
            "{{\n\"mcp\":{{\"servers\":{{\"{}\":{{\"url\":\"old\"}}}}}}}}",
            old.server_name()
        )
        .as_bytes(),
    )
    .unwrap();
    let mut candidate = old.clone();
    candidate.id = uuid::Uuid::new_v4().to_string();
    candidate.connection_id = uuid::Uuid::new_v4().to_string();
    candidate.base_url = "https://new.tradeflow.example.com".into();
    let mut staged = candidate.clone();
    staged.id = uuid::Uuid::new_v4().to_string();

    let plan = config::plan_switch(&staged, &candidate, Some(&old)).unwrap();
    let change = config::apply_plan(&store, &staged, plan.staged_change()).unwrap();
    let staged_value = config::parse(&std::fs::read_to_string(&old.config_path).unwrap()).unwrap();
    assert!(staged_value["mcp"]["servers"][old.server_name()].is_object());
    assert!(staged_value["mcp"]["servers"][staged.server_name()].is_object());
    assert!(staged_value["mcp"]["servers"][candidate.server_name()].is_null());

    let change = config::commit_switch(&store, &staged, &change, plan.final_after).unwrap();
    let committed = config::parse(&std::fs::read_to_string(&old.config_path).unwrap()).unwrap();
    assert!(committed["mcp"]["servers"][candidate.server_name()].is_object());
    assert!(committed["mcp"]["servers"][old.server_name()].is_null());
    assert!(committed["mcp"]["servers"][staged.server_name()].is_null());
    change.rollback().unwrap();
    let restored = config::parse(&std::fs::read_to_string(&old.config_path).unwrap()).unwrap();
    assert!(restored["mcp"]["servers"][old.server_name()].is_object());
    assert!(restored["mcp"]["servers"][candidate.server_name()].is_null());
}
#[test]
fn updating_an_existing_target_keeps_its_stable_entry_until_verification() {
    let dir = tempfile::tempdir().unwrap();
    let (store, existing) = fixture(&dir);
    config::install(&store, &existing, false).unwrap();
    let mut candidate = existing.clone();
    candidate.connection_id = uuid::Uuid::new_v4().to_string();
    candidate.token = "tfmcp_replacement_secret".into();
    let mut staged = candidate.clone();
    staged.id = uuid::Uuid::new_v4().to_string();

    let plan = config::plan_switch(&staged, &candidate, Some(&existing)).unwrap();
    let change = config::apply_plan(&store, &staged, plan.staged_change()).unwrap();
    let in_progress =
        config::parse(&std::fs::read_to_string(&existing.config_path).unwrap()).unwrap();
    let stable = &in_progress["mcp"]["servers"][existing.server_name()];
    assert_eq!(
        stable["headers"]["Authorization"],
        format!("Bearer {}", existing.token)
    );
    let staged_entry = &in_progress["mcp"]["servers"][staged.server_name()];
    assert_eq!(
        staged_entry["headers"]["Authorization"],
        format!("Bearer {}", candidate.token)
    );

    let committed = config::commit_switch(&store, &staged, &change, plan.final_after).unwrap();
    let final_config =
        config::parse(&std::fs::read_to_string(&candidate.config_path).unwrap()).unwrap();
    assert_eq!(
        final_config["mcp"]["servers"][candidate.server_name()]["headers"]["Authorization"],
        format!("Bearer {}", candidate.token)
    );
    assert!(final_config["mcp"]["servers"][staged.server_name()].is_null());
    committed.rollback().unwrap();
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
fn preferences_and_pending_revocations_are_private_and_validated() {
    use tradeflow_connect::storage::{PendingRevocation, Settings};
    let dir = tempfile::tempdir().unwrap();
    let (store, profile) = fixture(&dir);
    assert_eq!(store.settings().unwrap().language, "system");
    store
        .save_settings(&Settings {
            language: "zh".into(),
        })
        .unwrap();
    assert_eq!(store.settings().unwrap().language, "zh");
    assert!(
        store
            .save_settings(&Settings {
                language: "ko".into()
            })
            .is_err()
    );
    let pending = PendingRevocation {
        base_url: profile.base_url,
        owner_username: profile.owner_username,
        client: profile.client,
        connection_id: profile.connection_id,
        expires_at: None,
        last_error: Some("LOCAL_ONLY".into()),
    };
    store.queue_revocation(pending.clone()).unwrap();
    store.queue_revocation(pending).unwrap();
    let values = store.pending_revocations().unwrap();
    assert_eq!(values.len(), 1);
    assert!(
        !std::fs::read_to_string(store.root.join("pending-revocations.json"))
            .unwrap()
            .contains("tfmcp_test_secret")
    );
}
#[test]
fn prompts_follow_the_selected_language_and_keep_pagination_limit() {
    let dir = tempfile::tempdir().unwrap();
    let (_, profile) = fixture(&dir);
    let english = prompts::generate_for(&profile, "en");
    let chinese = prompts::generate_for(&profile, "zh");
    assert!(
        english["business"]
            .as_str()
            .unwrap()
            .contains("\"limit\":5")
    );
    assert!(chinese["business"].as_str().unwrap().contains("只读工具"));
    assert!(chinese["repair"].as_str().unwrap().contains("请协助检查"));
    assert!(!chinese.to_string().contains("tfmcp_test_secret"));
}
#[test]
fn interrupted_switch_rolls_back_configuration_and_queues_new_credential() {
    use tradeflow_connect::storage::SwitchJournal;
    let dir = tempfile::tempdir().unwrap();
    let (store, old) = fixture(&dir);
    store.save(&old).unwrap();
    config::install(&store, &old, false).unwrap();
    let mut candidate = old.clone();
    candidate.id = uuid::Uuid::new_v4().to_string();
    candidate.connection_id = uuid::Uuid::new_v4().to_string();
    candidate.base_url = "https://new.tradeflow.example.com".into();
    candidate.token = "tfmcp_candidate_secret".into();
    let mut staged = candidate.clone();
    staged.id = uuid::Uuid::new_v4().to_string();
    let plan = config::plan_switch(&staged, &candidate, Some(&old)).unwrap();
    let journal = SwitchJournal {
        id: uuid::Uuid::new_v4().to_string(),
        phase: "prepared".into(),
        candidate: candidate.clone(),
        candidate_is_new: true,
        staged_profile_id: Some(staged.id.clone()),
        source_profile_ids: vec![],
        source_profile_id: Some(old.id.clone()),
        retired_credentials: vec![],
        config_path: plan.path.clone(),
        config_before: plan.before.clone(),
        config_after: plan.staged.clone(),
        config_final: plan.final_after.clone(),
    };
    store.save_switch_journal(&journal).unwrap();
    store.save(&staged).unwrap();
    config::apply_plan(&store, &staged, plan.staged_change()).unwrap();
    let in_progress = config::parse(&std::fs::read_to_string(&old.config_path).unwrap()).unwrap();
    assert!(in_progress["mcp"]["servers"][old.server_name()].is_object());
    assert!(in_progress["mcp"]["servers"][staged.server_name()].is_object());

    let recovered = tradeflow_connect::connection::recover_switches(&store).unwrap();
    assert_eq!(recovered.len(), 1);
    assert_eq!(recovered[0]["recovered"], true);
    assert!(store.load(&old.id).is_ok());
    assert!(store.load(&candidate.id).is_err());
    assert!(store.load(&staged.id).is_err());
    let restored = std::fs::read_to_string(&old.config_path).unwrap();
    assert!(!restored.contains("tfmcp_candidate_secret"));
    let restored_value = config::parse(&restored).unwrap();
    assert!(restored_value["mcp"]["servers"][old.server_name()].is_object());
    assert!(restored_value["mcp"]["servers"][candidate.server_name()].is_null());
    assert_eq!(
        store.pending_revocations().unwrap()[0].connection_id,
        candidate.connection_id
    );
    let journal_contents = std::fs::read_dir(store.root.join("operations"))
        .unwrap()
        .count();
    assert_eq!(journal_contents, 0);
}
#[test]
fn verified_switch_recovery_finishes_profile_cleanup_without_tokens_in_queue() {
    use tradeflow_connect::storage::{PendingRevocation, SwitchJournal};
    let dir = tempfile::tempdir().unwrap();
    let (store, old) = fixture(&dir);
    store.save(&old).unwrap();
    let mut candidate = old.clone();
    candidate.id = uuid::Uuid::new_v4().to_string();
    candidate.connection_id = uuid::Uuid::new_v4().to_string();
    candidate.base_url = "https://new.tradeflow.example.com".into();
    candidate.token = "tfmcp_candidate_secret".into();
    let mut staged = candidate.clone();
    staged.id = uuid::Uuid::new_v4().to_string();
    let plan = config::plan_switch(&staged, &candidate, Some(&old)).unwrap();
    let journal = SwitchJournal {
        id: uuid::Uuid::new_v4().to_string(),
        phase: "verified".into(),
        candidate: candidate.clone(),
        candidate_is_new: true,
        staged_profile_id: Some(staged.id.clone()),
        source_profile_ids: vec![],
        source_profile_id: Some(old.id.clone()),
        retired_credentials: vec![PendingRevocation {
            base_url: old.base_url.clone(),
            owner_username: old.owner_username.clone(),
            client: old.client.clone(),
            connection_id: old.connection_id.clone(),
            expires_at: Some(old.expires_at.clone()),
            last_error: Some("REVOCATION_PENDING".into()),
        }],
        config_path: plan.path.clone(),
        config_before: plan.before.clone(),
        config_after: plan.staged.clone(),
        config_final: plan.final_after.clone(),
    };
    store.save_switch_journal(&journal).unwrap();
    store.save(&staged).unwrap();
    let change = config::apply_plan(&store, &staged, plan.staged_change()).unwrap();
    config::commit_switch(&store, &staged, &change, plan.final_after).unwrap();
    store.save(&candidate).unwrap();

    tradeflow_connect::connection::recover_switches(&store).unwrap();
    assert!(store.load(&old.id).is_err());
    assert!(store.load(&staged.id).is_err());
    assert_eq!(store.load(&candidate.id).unwrap().token, candidate.token);
    let pending = store.pending_revocations().unwrap();
    assert_eq!(pending.len(), 1);
    assert_eq!(pending[0].connection_id, old.connection_id);
    assert!(
        !serde_json::to_string(&pending)
            .unwrap()
            .contains(&old.token)
    );
}
#[test]
fn switch_recovery_does_not_overwrite_a_later_external_configuration_edit() {
    use tradeflow_connect::storage::SwitchJournal;
    let dir = tempfile::tempdir().unwrap();
    let (store, old) = fixture(&dir);
    store.save(&old).unwrap();
    config::install(&store, &old, false).unwrap();
    let mut candidate = old.clone();
    candidate.id = uuid::Uuid::new_v4().to_string();
    candidate.connection_id = uuid::Uuid::new_v4().to_string();
    candidate.base_url = "https://new.tradeflow.example.com".into();
    let plan = config::plan_switch(&candidate, &candidate, Some(&old)).unwrap();
    let journal = SwitchJournal {
        id: uuid::Uuid::new_v4().to_string(),
        phase: "prepared".into(),
        candidate: candidate.clone(),
        candidate_is_new: true,
        staged_profile_id: None,
        source_profile_ids: vec![],
        source_profile_id: Some(old.id.clone()),
        retired_credentials: vec![],
        config_path: plan.path.clone(),
        config_before: plan.before.clone(),
        config_after: plan.staged.clone(),
        config_final: plan.final_after.clone(),
    };
    store.save_switch_journal(&journal).unwrap();
    config::apply_plan(&store, &candidate, plan.staged_change()).unwrap();
    atomic_write(&old.config_path, b"{\"model\":\"external-edit\"}").unwrap();

    let issues = tradeflow_connect::connection::recover_switches(&store).unwrap();
    assert_eq!(issues[0]["errorCode"], "CONFIG_RECOVERY_CONCURRENT_CHANGE");
    assert_eq!(
        std::fs::read_to_string(&old.config_path).unwrap(),
        "{\"model\":\"external-edit\"}"
    );
    assert!(store.load(&old.id).is_ok());
    assert_eq!(
        std::fs::read_dir(store.root.join("operations"))
            .unwrap()
            .count(),
        1
    );
}
#[tokio::test]
async fn offline_disconnect_removes_local_entry_and_keeps_a_redacted_revocation_record() {
    let dir = tempfile::tempdir().unwrap();
    let (store, profile) = fixture(&dir);
    store.save(&profile).unwrap();
    config::install(&store, &profile, false).unwrap();

    let result = tradeflow_connect::connection::disconnect(None, &store, &profile.id, false)
        .await
        .unwrap();
    assert_eq!(result["localRemoved"], true);
    assert_eq!(result["remoteRevoked"], false);
    assert!(store.load(&profile.id).is_err());
    let config_value =
        config::parse(&std::fs::read_to_string(&profile.config_path).unwrap()).unwrap();
    assert!(config_value["mcp"]["servers"][profile.server_name()].is_null());
    let pending = store.pending_revocations().unwrap();
    assert_eq!(pending.len(), 1);
    assert_eq!(pending[0].connection_id, profile.connection_id);
    assert!(
        !std::fs::read_to_string(store.root.join("pending-revocations.json"))
            .unwrap()
            .contains(&profile.token)
    );
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

#[cfg(windows)]
#[test]
fn windows_private_files_have_a_protected_single_user_dacl() {
    use std::{os::windows::ffi::OsStrExt, ptr};
    use windows_sys::Win32::Security::{
        DACL_SECURITY_INFORMATION, GetFileSecurityW, GetSecurityDescriptorControl,
        GetSecurityDescriptorDacl, SE_DACL_PROTECTED,
    };
    let dir = tempfile::tempdir().unwrap();
    let (store, profile) = fixture(&dir);
    store.save(&profile).unwrap();
    for path in [
        &store.root,
        &store.root.join(format!("{}.json", profile.id)),
    ] {
        let path: Vec<u16> = path.as_os_str().encode_wide().chain(Some(0)).collect();
        unsafe {
            let mut required = 0;
            GetFileSecurityW(
                path.as_ptr(),
                DACL_SECURITY_INFORMATION,
                ptr::null_mut(),
                0,
                &mut required,
            );
            assert!(required > 0);
            let mut buffer = vec![0usize; (required as usize).div_ceil(size_of::<usize>())];
            let descriptor = buffer.as_mut_ptr().cast();
            assert_ne!(
                GetFileSecurityW(
                    path.as_ptr(),
                    DACL_SECURITY_INFORMATION,
                    descriptor,
                    required,
                    &mut required
                ),
                0
            );
            let mut present = 0;
            let mut defaulted = 0;
            let mut acl = ptr::null_mut();
            assert_ne!(
                GetSecurityDescriptorDacl(descriptor, &mut present, &mut acl, &mut defaulted),
                0
            );
            assert_ne!(present, 0);
            assert!(!acl.is_null());
            assert_eq!((*acl).AceCount, 1);
            let mut control = 0;
            let mut revision = 0;
            assert_ne!(
                GetSecurityDescriptorControl(descriptor, &mut control, &mut revision),
                0
            );
            assert_ne!(control & SE_DACL_PROTECTED, 0);
        }
    }
}

#[cfg(windows)]
#[test]
fn windows_background_commands_keep_stdio_without_a_console() {
    let output = tradeflow_connect::process::command("powershell.exe")
        .args(["-NoProfile", "-NonInteractive", "-Command", r#"Add-Type -Name Console -Namespace TradeFlowProbe -MemberDefinition '[DllImport("kernel32.dll")] public static extern IntPtr GetConsoleWindow();'; [TradeFlowProbe.Console]::GetConsoleWindow().ToInt64(); Write-Output 'redirected-output'"#])
        .output().unwrap();
    assert!(output.status.success());
    let text = String::from_utf8(output.stdout).unwrap();
    let lines: Vec<_> = text.lines().collect();
    assert_eq!(lines, vec!["0", "redirected-output"]);
}
