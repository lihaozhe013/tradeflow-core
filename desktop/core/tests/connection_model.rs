use serde_json::{Value, json};
use tempfile::TempDir;
use tradeflow_connect::{
    api::normalize_url,
    connection, prompts,
    storage::{
        PendingRevocation, Profile, Settings, Store, atomic_write, validate_connection_name,
    },
};

fn fixture(dir: &TempDir) -> (Store, Profile) {
    let root = dir.path().canonicalize().unwrap();
    let store = Store::at(root.join("private")).unwrap();
    let profile = Profile {
        id: uuid::Uuid::new_v4().to_string(),
        connection_id: uuid::Uuid::new_v4().to_string(),
        owner_username: "fixture-user".into(),
        client: "Office assistant".into(),
        base_url: "https://tradeflow.example.com".into(),
        token: "tfmcp_test_secret".into(),
        tools: vec!["get_inventory".into()],
        expires_at: "2030-01-01T00:00:00Z".into(),
        helper_path: dir.path().join("bin/tradeflow-connect"),
        mode: "bridge".into(),
        pending_cleanup: vec![],
        catalog_version: Some("catalog-1".into()),
        guide_version: Some("2".into()),
        last_sync_at: Some("2026-10-03T00:00:00Z".into()),
    };
    (store, profile)
}

#[test]
fn profiles_round_trip_and_legacy_profiles_still_load() {
    let dir = tempfile::tempdir().unwrap();
    let (store, profile) = fixture(&dir);
    store.save(&profile).unwrap();
    let loaded = store.load(&profile.id).unwrap();
    assert_eq!(loaded.client, profile.client);
    assert_eq!(
        loaded.launch_args(),
        vec!["serve", "--profile", profile.id.as_str()]
    );
    let summary = loaded.summary();
    assert_eq!(summary["catalogVersion"], "catalog-1");
    assert!(summary.get("configPath").is_none());
    assert!(!summary.to_string().contains(&profile.token));

    // Earlier releases stored a fixed Agent id and a host configuration path.
    let legacy = json!({
        "id": uuid::Uuid::new_v4().to_string(),
        "connection_id": uuid::Uuid::new_v4().to_string(),
        "owner_username": "legacy-user",
        "client": "opencode",
        "base_url": "https://legacy.example.com",
        "token": "tfmcp_legacy_secret",
        "tools": ["get_inventory"],
        "expires_at": "2030-01-01T00:00:00Z",
        "config_path": "C:/Users/legacy/.config/opencode/opencode.jsonc",
        "helper_path": "C:/Program Files/TradeFlow/tradeflow-connect.exe",
        "mode": "remote",
        "pending_cleanup": ["11111111-1111-1111-1111-111111111111"]
    });
    let path = store
        .root
        .join(format!("{}.json", legacy["id"].as_str().unwrap()));
    atomic_write(&path, legacy.to_string().as_bytes()).unwrap();
    let loaded = store.load(legacy["id"].as_str().unwrap()).unwrap();
    assert_eq!(loaded.client, "opencode");
    assert_eq!(loaded.pending_cleanup.len(), 1);
    // The host configuration path is intentionally dropped: the Agent now owns it.
    store.save(&loaded).unwrap();
    assert!(
        !std::fs::read_to_string(path)
            .unwrap()
            .contains("config_path")
    );
}

#[test]
fn connection_names_are_bounded_and_printable() {
    assert_eq!(
        validate_connection_name("  Office assistant  ").unwrap(),
        "Office assistant"
    );
    assert_eq!(
        validate_connection_name("办公室助手").unwrap(),
        "办公室助手"
    );
    assert!(validate_connection_name("   ").is_err());
    assert!(validate_connection_name(&"x".repeat(65)).is_err());
    assert!(validate_connection_name("bad\u{7}name").is_err());
}

#[test]
fn prompts_describe_the_launch_without_exposing_credentials() {
    let dir = tempfile::tempdir().unwrap();
    let (_, profile) = fixture(&dir);
    let english = prompts::generate_for(&profile, "en");
    let chinese = prompts::generate_for(&profile, "zh");
    for prompt in ["business", "connect", "update", "repair"] {
        let text = english[prompt].as_str().unwrap();
        assert!(!text.is_empty(), "missing English {prompt} prompt");
        assert!(!text.contains("{{"), "unrendered placeholder in {prompt}");
        assert!(!text.contains(&profile.token));
        assert!(!text.contains("tfmcp_"));
        assert!(
            chinese[prompt]
                .as_str()
                .is_some_and(|value| !value.is_empty())
        );
    }
    let connect = english["connect"].as_str().unwrap();
    assert!(connect.contains("serve --profile"));
    assert!(connect.contains(&profile.server_name()));
    assert!(connect.contains("stdio"));
    let update = english["update"].as_str().unwrap();
    assert!(update.contains("catalog-1"));
    assert!(update.contains("discover"));
    let repair = english["repair"].as_str().unwrap();
    assert!(repair.contains("doctor --profile"));
    assert!(
        english["business"]
            .as_str()
            .unwrap()
            .contains("\"limit\":5")
    );
    assert!(chinese["connect"].as_str().unwrap().contains("stdio"));
    assert!(!chinese.to_string().contains("tfmcp_test_secret"));
}

#[test]
fn descriptor_contains_launch_information_but_no_token() {
    let dir = tempfile::tempdir().unwrap();
    let (store, profile) = fixture(&dir);
    store.save(&profile).unwrap();
    let value = connection::describe(&store, &profile.id).unwrap();
    assert_eq!(value["transport"], "stdio");
    assert_eq!(value["args"][0], "serve");
    assert_eq!(value["serverName"], profile.server_name());
    assert_eq!(
        value["command"],
        profile.helper_path.to_string_lossy().as_ref()
    );
    assert!(!value.to_string().contains(&profile.token));
}

#[test]
fn preferences_and_pending_revocations_are_private_and_validated() {
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
    assert_eq!(store.pending_revocations().unwrap().len(), 1);
    assert!(
        !std::fs::read_to_string(store.root.join("pending-revocations.json"))
            .unwrap()
            .contains("tfmcp_test_secret")
    );
}

#[test]
fn interrupted_legacy_switch_drops_the_candidate_and_keeps_the_previous_profile() {
    let dir = tempfile::tempdir().unwrap();
    let (store, old) = fixture(&dir);
    store.save(&old).unwrap();
    let mut candidate = old.clone();
    candidate.id = uuid::Uuid::new_v4().to_string();
    candidate.connection_id = uuid::Uuid::new_v4().to_string();
    candidate.token = "tfmcp_candidate_secret".into();
    let journal = json!({
        "id": uuid::Uuid::new_v4().to_string(),
        "phase": "prepared",
        "candidate": serde_json::to_value(&candidate).unwrap(),
        "candidate_is_new": true,
        "staged_profile_id": Value::Null,
        "source_profile_id": old.id,
        "source_profile_ids": [],
        "retired_credentials": [],
        "config_path": "C:/unused/opencode.jsonc",
        "config_before": Value::Null,
        "config_after": "{}",
        "config_final": "{}"
    });
    let operations = store.root.join("operations");
    std::fs::create_dir_all(&operations).unwrap();
    atomic_write(
        &operations.join(format!("{}.json", journal["id"].as_str().unwrap())),
        journal.to_string().as_bytes(),
    )
    .unwrap();

    let recovered = connection::recover_operations(&store).unwrap();
    assert_eq!(recovered.len(), 1);
    assert_eq!(recovered[0]["recovered"], true);
    assert!(store.load(&old.id).is_ok());
    let pending = store.pending_revocations().unwrap();
    assert_eq!(pending.len(), 1);
    assert_eq!(pending[0].connection_id, candidate.connection_id);
    assert!(!serde_json::to_string(&pending).unwrap().contains("tfmcp_"));
    assert_eq!(std::fs::read_dir(&operations).unwrap().count(), 0);
}

#[test]
fn verified_legacy_switch_keeps_the_candidate_and_queues_retired_credentials() {
    let dir = tempfile::tempdir().unwrap();
    let (store, old) = fixture(&dir);
    store.save(&old).unwrap();
    let mut candidate = old.clone();
    candidate.id = uuid::Uuid::new_v4().to_string();
    candidate.connection_id = uuid::Uuid::new_v4().to_string();
    candidate.token = "tfmcp_candidate_secret".into();
    let journal = json!({
        "id": uuid::Uuid::new_v4().to_string(),
        "phase": "verified",
        "candidate": serde_json::to_value(&candidate).unwrap(),
        "candidate_is_new": true,
        "staged_profile_id": Value::Null,
        "source_profile_id": old.id,
        "source_profile_ids": [],
        "retired_credentials": [{
            "baseUrl": old.base_url,
            "ownerUsername": old.owner_username,
            "client": old.client,
            "connectionId": old.connection_id,
            "expiresAt": old.expires_at,
            "lastError": "REVOCATION_PENDING"
        }],
        "config_path": "C:/unused/opencode.jsonc"
    });
    let operations = store.root.join("operations");
    std::fs::create_dir_all(&operations).unwrap();
    atomic_write(
        &operations.join(format!("{}.json", journal["id"].as_str().unwrap())),
        journal.to_string().as_bytes(),
    )
    .unwrap();

    connection::recover_operations(&store).unwrap();
    assert!(store.load(&old.id).is_err());
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

#[tokio::test]
async fn offline_disconnect_removes_the_profile_and_records_a_redacted_revocation() {
    let dir = tempfile::tempdir().unwrap();
    let (store, profile) = fixture(&dir);
    store.save(&profile).unwrap();
    let result = connection::disconnect(None, &store, &profile.id, false)
        .await
        .unwrap();
    assert_eq!(result["localRemoved"], true);
    assert_eq!(result["remoteRevoked"], false);
    assert_eq!(result["remoteCleanupRequired"], true);
    assert!(store.load(&profile.id).is_err());
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
