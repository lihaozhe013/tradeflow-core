use crate::{
    api::Session,
    config,
    diagnostics::{self, Stage},
    mcp,
    storage::{Client, PendingRevocation, Profile, Store, SwitchJournal},
};
use anyhow::{Context, Result, bail};
use fs2::FileExt;
use serde_json::{Value, json};
use std::{
    collections::HashSet,
    fs::{self, File},
    path::{Path, PathBuf},
};

fn operation_lock(store: &Store, client: &Client) -> Result<File> {
    let lock = fs::OpenOptions::new()
        .create(true)
        .truncate(false)
        .read(true)
        .write(true)
        .open(store.root.join(format!("{}-operation.lock", client.name())))?;
    lock.try_lock_exclusive().context("OPERATION_BUSY")?;
    Ok(lock)
}
fn queue_candidate(store: &Store, profile: &Profile, error: &str) -> Result<()> {
    store.queue_revocation(PendingRevocation {
        base_url: profile.base_url.clone(),
        owner_username: profile.owner_username.clone(),
        client: profile.client.clone(),
        connection_id: profile.connection_id.clone(),
        expires_at: Some(profile.expires_at.clone()),
        last_error: Some(error.into()),
    })
}
async fn revoke_or_queue_candidate(
    session: &Session,
    store: &Store,
    profile: &Profile,
) -> Result<bool> {
    if diagnostics::step(
        Stage::RevokeCandidate,
        session.revoke(&profile.connection_id),
    )
    .await
    .is_ok()
    {
        return Ok(true);
    }
    queue_candidate(store, profile, "INSTALL_FAILED")?;
    Ok(false)
}

pub fn detect(client: &Client) -> Value {
    let home = dirs::home_dir().unwrap_or_default();
    match client {
        Client::Opencode => {
            let executable = if cfg!(windows) {
                "opencode.exe"
            } else {
                "opencode"
            };
            let candidates = [
                PathBuf::from(executable),
                home.join(".opencode/bin").join(executable),
                home.join(".bun/bin").join(executable),
                PathBuf::from("/opt/homebrew/bin").join(executable),
                PathBuf::from("/usr/local/bin").join(executable),
            ];
            let version = candidates.iter().find_map(|path| {
                crate::process::command(path)
                    .arg("--version")
                    .output()
                    .ok()
                    .filter(|r| r.status.success())
                    .map(|r| String::from_utf8_lossy(&r.stdout).trim().to_owned())
            });
            json!({"client":"opencode","installed":version.is_some(),"version":version,"supported":version.as_ref().is_some_and(|v|v.contains("v2."))})
        }
        Client::Workbuddy => {
            #[cfg(target_os = "macos")]
            let installed = Path::new("/Applications/WorkBuddy.app").exists()
                || home.join("Applications/WorkBuddy.app").exists();
            #[cfg(windows)]
            let installed = std::env::var_os("LOCALAPPDATA").is_some_and(|base| {
                PathBuf::from(base)
                    .join("Programs/WorkBuddy/WorkBuddy.exe")
                    .exists()
            }) || home.join(".workbuddy").exists();
            #[cfg(not(any(windows, target_os = "macos")))]
            let installed = home.join(".workbuddy").exists();
            json!({"client":"workbuddy","installed":installed,"version":null,"supported":installed,"baseline":"5.6.0","versionConfirmationRequired":true})
        }
    }
}
fn validate_client(profile: &Profile, client: &Client) -> Result<()> {
    if &profile.client != client {
        bail!("PROFILE_CLIENT_MISMATCH");
    }
    Ok(())
}
pub async fn doctor(store: &Store, id: &str, client: Client, cwd: &Path) -> Result<Value> {
    let profile = store.load(id)?;
    validate_client(&profile, &client)?;
    let configured = diagnostics::sync_step(Stage::ReadConfig, || config::configured(&profile))?;
    let overrides = config::overrides(&profile, cwd);
    let helper_available = profile.mode != "bridge"
        || crate::process::command(&profile.helper_path)
            .arg("--version")
            .output()
            .is_ok_and(|result| {
                result.status.success()
                    && String::from_utf8_lossy(&result.stdout).starts_with("tradeflow-connect ")
            });
    let probe = if helper_available {
        mcp::probe(&profile).await
    } else {
        Err(anyhow::anyhow!("HELPER_NOT_FOUND"))
    };
    let (remote, error) = match probe {
        Ok(value) => (value, Value::Null),
        Err(e) => (Value::Null, Value::String(safe_code(&e))),
    };
    Ok(
        json!({"profile":profile.summary(),"configurationWritten":configured,"helperAvailable":helper_available,"serviceVerified":!remote.is_null(),"hostVerified":false,"hostActivationRequired":true,"overrides":overrides,"remote":remote,"errorCode":error,"nextStep":"Enable/trust or reload the host, then run one TradeFlow query. Expired credentials require GUI login."}),
    )
}
pub fn safe_code(error: &anyhow::Error) -> String {
    let value = error.to_string();
    let allowed = [
        "ACCOUNT_DISABLED",
        "ACL_IDENTITY_FAILED",
        "ACL_UPDATE_FAILED",
        "AUTH_DISABLED",
        "BACKEND_UPGRADE_REQUIRED",
        "BRIDGE_IO_FAILED",
        "BRIDGE_START_FAILED",
        "BROWSER_OPEN_FAILED",
        "CLIENT_NOT_INSTALLED",
        "CLIPBOARD_WRITE_FAILED",
        "CONFIG_BUSY",
        "CONFIG_CONCURRENT_CHANGE",
        "CONFIG_READ_FAILED",
        "CONFIG_RECOVERY_CONCURRENT_CHANGE",
        "CONFIG_RECOVERY_FAILED",
        "CONFIG_ROOT_MUST_BE_OBJECT",
        "CONNECTION_NOT_FOUND",
        "HELPER_NOT_FOUND",
        "HOME_UNAVAILABLE",
        "HOST_COMPATIBILITY",
        "HTTPS_OR_LOOPBACK_ORIGIN_REQUIRED",
        "INSTALL_FAILED_CLEANUP_PENDING",
        "INVALID_CLIENT",
        "INVALID_CONFIG_JSON",
        "INVALID_CONNECTION_ID",
        "INVALID_CONNECTION_MODE",
        "INVALID_DEVICE_ID",
        "INVALID_DISCONNECT_MODE",
        "INVALID_LANGUAGE",
        "INVALID_MCP_OBJECT",
        "INVALID_OPERATION_ID",
        "INVALID_OPERATION_PHASE",
        "INVALID_PENDING_REVOCATIONS",
        "INVALID_PROFILE",
        "INVALID_PROFILE_ID",
        "INVALID_PROMPT_KIND",
        "INVALID_SERVERS_OBJECT",
        "INVALID_SERVER_RESPONSE",
        "INVALID_SERVER_URL",
        "INVALID_SETTINGS",
        "INVALID_STORAGE_PATH",
        "LOCAL_DATA_UNAVAILABLE",
        "LOGIN_REQUIRED",
        "LOGIN_FIELDS_REQUIRED",
        "LOGIN_TOKEN_MISSING",
        "LOG_EXPORT_FAILED",
        "LOG_READ_FAILED",
        "LOG_WRITE_FAILED",
        "MCP_CONNECTION_FAILED",
        "MCP_DISABLED",
        "MCP_QUERY_FAILED",
        "MCP_TIMEOUT",
        "NETWORK_CONNECTION_FAILED",
        "NETWORK_ERROR",
        "NETWORK_OR_TLS_ERROR",
        "NETWORK_TIMEOUT",
        "NO_AUTHORIZED_TOOLS",
        "OPENCODE_V2_REQUIRED",
        "OPERATION_BUSY",
        "OPERATION_FAILED",
        "OPERATION_PANICKED",
        "PROFILE_ACCOUNT_MISMATCH",
        "PROFILE_CLIENT_MISMATCH",
        "PROFILE_CONFIG_PATH_CHANGED",
        "PROFILE_NOT_FOUND",
        "PROFILE_REMOVE_FAILED",
        "PROFILE_SERVER_MISMATCH",
        "PROFILE_SERVER_OR_CLIENT_MISMATCH",
        "ROLE_NOT_SUPPORTED",
        "ROLLBACK_CONCURRENT_CHANGE",
        "ROLLBACK_FAILED",
        "STRUCTURED_RESULT_MISSING",
        "SWITCH_RECOVERY_PENDING",
        "SYMLINK_PATH_REJECTED",
        "TLS_ERROR",
    ];
    let http = value
        .strip_prefix("HTTP_")
        .and_then(|code| code.parse::<u16>().ok())
        .is_some_and(|code| (100..600).contains(&code));
    if http || allowed.contains(&value.as_str()) {
        value
    } else {
        "OPERATION_FAILED".into()
    }
}
pub struct SwitchRequest {
    pub client: Client,
    pub helper_path: PathBuf,
    pub old_profile_id: Option<String>,
    pub target_profile_id: Option<String>,
    pub mode: String,
}
pub async fn repair(
    store: &Store,
    id: &str,
    client: Client,
    mode: &str,
    cwd: &Path,
) -> Result<Value> {
    let _operation = operation_lock(store, &client)?;
    let mut profile = store.load(id)?;
    validate_client(&profile, &client)?;
    match mode {
        "auto" => (),
        "remote" | "bridge" => profile.mode = mode.into(),
        _ => bail!("INVALID_CONNECTION_MODE"),
    }
    if profile.mode == "bridge" && !profile.helper_path.exists() {
        bail!("HELPER_NOT_FOUND");
    }
    let change = diagnostics::sync_step(Stage::WriteConfig, || {
        config::install(store, &profile, false)
    })?;
    if let Err(error) = mcp::probe(&profile).await {
        diagnostics::sync_step(Stage::RollbackLocal, || change.rollback())
            .context("ROLLBACK_FAILED")?;
        return Err(error);
    }
    if let Err(error) = store.save(&profile) {
        diagnostics::sync_step(Stage::RollbackLocal, || change.rollback())
            .context("ROLLBACK_FAILED")?;
        return Err(error);
    }
    doctor(store, &profile.id, client, cwd).await
}
pub async fn install(
    session: &Session,
    store: &Store,
    client: Client,
    helper_path: PathBuf,
    existing: Option<String>,
    mode: &str,
) -> Result<Value> {
    connect_simple(session, store, client, helper_path, existing, mode).await
}
pub async fn switch(
    session: &Session,
    _previous_session: Option<&Session>,
    store: &Store,
    request: SwitchRequest,
) -> Result<Value> {
    connect_simple(
        session,
        store,
        request.client,
        request.helper_path,
        request.target_profile_id,
        &request.mode,
    )
    .await
}
pub async fn connect_simple(
    session: &Session,
    store: &Store,
    client: Client,
    helper_path: PathBuf,
    existing: Option<String>,
    mode: &str,
) -> Result<Value> {
    diagnostics::sync_step(Stage::DetectClient, || {
        if !matches!(mode, "remote" | "bridge") {
            bail!("INVALID_CONNECTION_MODE");
        }
        let detected = detect(&client);
        if detected["installed"] != true {
            bail!("CLIENT_NOT_INSTALLED");
        }
        if client == Client::Opencode && detected["supported"] != true {
            bail!("OPENCODE_V2_REQUIRED");
        }
        if mode == "bridge" && !helper_path.exists() {
            bail!("HELPER_NOT_FOUND");
        }
        Ok(())
    })?;
    Box::pin(connect_at(
        session,
        store,
        client.clone(),
        helper_path,
        existing,
        mode,
        config::config_path(&client)?,
    ))
    .await
}
pub async fn connect_at(
    session: &Session,
    store: &Store,
    client: Client,
    helper_path: PathBuf,
    existing: Option<String>,
    mode: &str,
    config_path: PathBuf,
) -> Result<Value> {
    let _operation = operation_lock(store, &client)?;
    if !matches!(mode, "remote" | "bridge") {
        bail!("INVALID_CONNECTION_MODE");
    }
    if mode == "bridge" && !helper_path.exists() {
        bail!("HELPER_NOT_FOUND");
    }
    let username = session.user["username"]
        .as_str()
        .context("INVALID_SERVER_RESPONSE")?;
    let sources: Vec<Profile> = store
        .profiles()?
        .into_iter()
        .filter(|p| p.client == client)
        .collect();
    let previous = match existing {
        Some(id) => Some(store.load(&id)?),
        None => sources
            .iter()
            .find(|p| p.base_url == session.base_url && p.owner_username == username)
            .cloned(),
    };
    if let Some(old) = &previous {
        if old.owner_username != username {
            bail!("PROFILE_ACCOUNT_MISMATCH");
        }
        if old.base_url != session.base_url || old.client != client {
            bail!("PROFILE_SERVER_OR_CLIENT_MISMATCH");
        }
    }
    let capabilities = session.capabilities().await?;
    if capabilities["enabled"] != true {
        bail!("MCP_DISABLED");
    }
    let config_path = diagnostics::sync_step(Stage::ReadConfig, || {
        let path = config_path;
        config::validate_path(&path)?;
        if sources.iter().any(|old| old.config_path != path) {
            bail!("PROFILE_CONFIG_PATH_CHANGED");
        }
        Ok(path)
    })?;
    let mut reusable = None;
    if let Some(old) = &previous {
        let unexpired = chrono::DateTime::parse_from_rfc3339(&old.expires_at)
            .is_ok_and(|date| date > chrono::Utc::now());
        if unexpired {
            match mcp::probe(old).await {
                Ok(remote) => {
                    let names = remote["tools"]
                        .as_array()
                        .context("INVALID_SERVER_RESPONSE")?;
                    let allowed = capabilities["allowedTools"]
                        .as_array()
                        .context("INVALID_SERVER_RESPONSE")?;
                    if allowed.iter().all(|name| names.contains(name)) {
                        reusable = Some(remote);
                    }
                }
                Err(error) if safe_code(&error) == "HTTP_401" => (),
                Err(error) => return Err(error),
            }
        }
    }
    let issued = if reusable.is_none() {
        Some(
            diagnostics::step(
                Stage::IssueCredential,
                session.issue(client.name(), &store.device_id()?),
            )
            .await?,
        )
    } else {
        None
    };
    let candidate_result: Result<Profile> = (|| {
        if let Some(issued) = &issued {
            Ok(Profile {
                id: previous
                    .as_ref()
                    .map(|p| p.id.clone())
                    .unwrap_or_else(|| uuid::Uuid::new_v4().to_string()),
                connection_id: issued["id"]
                    .as_str()
                    .context("INVALID_SERVER_RESPONSE")?
                    .into(),
                owner_username: username.into(),
                client: client.clone(),
                base_url: session.base_url.clone(),
                token: issued["token"]
                    .as_str()
                    .context("INVALID_SERVER_RESPONSE")?
                    .into(),
                tools: serde_json::from_value(
                    issued.get("effectiveTools").unwrap_or(&issued["tools"]).clone(),
                )
                    .context("INVALID_SERVER_RESPONSE")?,
                expires_at: issued["expiresAt"]
                    .as_str()
                    .context("INVALID_SERVER_RESPONSE")?
                    .into(),
                config_path: config_path.clone(),
                helper_path: helper_path.clone(),
                mode: mode.into(),
                pending_cleanup: vec![],
            })
        } else {
            let mut profile = previous.clone().context("PROFILE_NOT_FOUND")?;
            profile.mode = mode.into();
            profile.helper_path = helper_path;
            if let Some(remote) = &reusable {
                profile.tools = serde_json::from_value(remote["tools"].clone())
                    .context("INVALID_SERVER_RESPONSE")?;
            }
            profile.pending_cleanup.clear();
            Ok(profile)
        }
    })();
    let profile = candidate_result?;
    let mut staged = profile.clone();
    staged.id = uuid::Uuid::new_v4().to_string();
    let preparation = diagnostics::sync_step(Stage::ReadConfig, || {
        let mut plan = config::plan_switch(&staged, &profile, None)?;
        for old in &sources {
            if old.id != profile.id {
                plan.final_after =
                    config::patch(&plan.final_after, &client, &old.server_name(), None)?;
            }
        }
        Ok(plan)
    });
    let plan = match preparation {
        Ok(plan) => plan,
        Err(error) => {
            if issued.is_some() {
                revoke_or_queue_candidate(session, store, &profile).await?;
            }
            return Err(error);
        }
    };
    let retired: Vec<PendingRevocation> = sources
        .iter()
        .flat_map(|old| {
            let mut values: Vec<PendingRevocation> = old
                .pending_cleanup
                .iter()
                .map(|id| PendingRevocation {
                    base_url: old.base_url.clone(),
                    owner_username: old.owner_username.clone(),
                    client: old.client.clone(),
                    connection_id: id.clone(),
                    expires_at: None,
                    last_error: Some("LEGACY_CLEANUP_PENDING".into()),
                })
                .collect();
            if old.connection_id != profile.connection_id {
                values.push(PendingRevocation {
                    base_url: old.base_url.clone(),
                    owner_username: old.owner_username.clone(),
                    client: old.client.clone(),
                    connection_id: old.connection_id.clone(),
                    expires_at: Some(old.expires_at.clone()),
                    last_error: Some("MANUAL_REVOCATION".into()),
                });
            }
            values
        })
        .collect();
    let mut journal = SwitchJournal {
        id: uuid::Uuid::new_v4().to_string(),
        phase: "prepared".into(),
        candidate: profile.clone(),
        candidate_is_new: issued.is_some(),
        staged_profile_id: Some(staged.id.clone()),
        source_profile_id: None,
        source_profile_ids: sources.iter().map(|p| p.id.clone()).collect(),
        retired_credentials: retired.clone(),
        config_path: plan.path.clone(),
        config_before: plan.before.clone(),
        config_after: plan.staged.clone(),
        config_final: plan.final_after.clone(),
    };
    let saved = diagnostics::sync_step(Stage::WriteConfig, || {
        store.save_switch_journal(&journal)?;
        store.save(&staged)?;
        Ok(())
    });
    if let Err(error) = saved {
        if issued.is_some() {
            revoke_or_queue_candidate(session, store, &profile).await?;
        }
        if store.load(&staged.id).is_ok() {
            store.remove(&staged.id)?;
        }
        store.remove_switch_journal(&journal.id)?;
        return Err(error);
    }
    let applied = diagnostics::sync_step(Stage::WriteConfig, || {
        config::apply_plan(store, &staged, plan.staged_change())
    });
    let change = match applied {
        Ok(change) => change,
        Err(error) => {
            if issued.is_some() {
                revoke_or_queue_candidate(session, store, &profile).await?;
            }
            store.remove(&staged.id)?;
            store.remove_switch_journal(&journal.id)?;
            return Err(error);
        }
    };
    let verified = match reusable {
        Some(remote) => Ok(remote),
        None => mcp::probe(&profile).await,
    };
    let verified = match verified {
        Ok(remote) => remote,
        Err(error) => {
            let rollback = diagnostics::sync_step(Stage::RollbackLocal, || change.rollback());
            if issued.is_some() {
                revoke_or_queue_candidate(session, store, &profile).await?;
            }
            if rollback.is_ok() {
                store.remove(&staged.id)?;
                store.remove_switch_journal(&journal.id)?;
            }
            rollback?;
            return Err(error);
        }
    };
    let committed = diagnostics::sync_step(Stage::CommitLocal, || {
        config::commit_switch(store, &staged, &change, plan.final_after.clone())
    });
    let final_change = match committed {
        Ok(change) => change,
        Err(error) => {
            let rollback = diagnostics::sync_step(Stage::RollbackLocal, || change.rollback());
            if issued.is_some() {
                revoke_or_queue_candidate(session, store, &profile).await?;
            }
            if rollback.is_ok() {
                store.remove(&staged.id)?;
                store.remove_switch_journal(&journal.id)?;
            }
            rollback?;
            return Err(error);
        }
    };
    journal.phase = "verified".into();
    if let Err(error) = store.save_switch_journal(&journal) {
        let rollback = diagnostics::sync_step(Stage::RollbackLocal, || final_change.rollback());
        if issued.is_some() {
            revoke_or_queue_candidate(session, store, &profile).await?;
        }
        if rollback.is_ok() {
            store.remove(&staged.id)?;
            store.remove_switch_journal(&journal.id)?;
        }
        rollback?;
        return Err(error);
    }
    diagnostics::sync_step(Stage::CommitLocal, || store.save(&profile))
        .context("SWITCH_RECOVERY_PENDING")?;
    let cleanup = diagnostics::sync_step(Stage::CommitLocal, || {
        for entry in &retired {
            store.queue_revocation(entry.clone())?;
        }
        for old in &sources {
            if old.id != profile.id && store.load(&old.id).is_ok() {
                store.remove(&old.id)?;
            }
        }
        store.remove(&staged.id)?;
        store.remove_switch_journal(&journal.id)
    });
    Ok(
        json!({"profile":profile.summary(),"configurationWritten":true,"serviceVerified":true,"hostVerified":false,"hostActivationRequired":true,"remote":verified,"reusedCredential":issued.is_none(),"remoteCleanupRequired":!retired.is_empty(),"localCleanupErrorCode":cleanup.err().map(|e|safe_code(&e)),"nextStep":"Reload the Agent. Old credentials can be revoked on the original server's My MCP credentials page."}),
    )
}
pub async fn disconnect(
    session: Option<&Session>,
    store: &Store,
    id: &str,
    revoke: bool,
) -> Result<Value> {
    let profile = store.load(id)?;
    let _operation = operation_lock(store, &profile.client)?;
    let mut revoked = false;
    if revoke && let Some(session) = session {
        if session.user["username"].as_str() != Some(&profile.owner_username) {
            bail!("PROFILE_ACCOUNT_MISMATCH");
        }
        if profile.base_url != session.base_url {
            bail!("PROFILE_SERVER_MISMATCH");
        }
        if session.revoke(&profile.connection_id).await.is_ok() {
            revoked = true;
        }
    }
    let change = diagnostics::sync_step(Stage::RemoveLocal, || {
        config::install(store, &profile, true)
    })?;
    let cleanup = (|| {
        if !revoked {
            store.queue_revocation(PendingRevocation {
                base_url: profile.base_url.clone(),
                owner_username: profile.owner_username.clone(),
                client: profile.client.clone(),
                connection_id: profile.connection_id.clone(),
                expires_at: Some(profile.expires_at.clone()),
                last_error: Some(
                    if revoke {
                        "REVOCATION_PENDING"
                    } else {
                        "LOCAL_ONLY"
                    }
                    .into(),
                ),
            })?;
        }
        for pending in &profile.pending_cleanup {
            store.queue_revocation(PendingRevocation {
                base_url: profile.base_url.clone(),
                owner_username: profile.owner_username.clone(),
                client: profile.client.clone(),
                connection_id: pending.clone(),
                expires_at: None,
                last_error: Some("LEGACY_CLEANUP_PENDING".into()),
            })?;
        }
        store.remove(id)?;
        Ok(())
    })();
    if let Err(error) = cleanup {
        diagnostics::sync_step(Stage::RollbackLocal, || change.rollback())?;
        return Err(error);
    }
    Ok(
        json!({"localRemoved":true,"remoteRevoked":revoked,"reloadRequired":true,"remoteCleanupRequired":!revoked}),
    )
}
pub async fn retry_pending_revocations(session: &Session, store: &Store) -> Result<Value> {
    let mut pending = store.pending_revocations()?;
    let mut retained = Vec::new();
    let mut revoked = 0;
    for mut entry in pending.drain(..) {
        if entry.base_url == session.base_url
            && entry.owner_username == session.user["username"].as_str().unwrap_or_default()
        {
            if session.revoke(&entry.connection_id).await.is_ok() {
                revoked += 1;
                continue;
            }
            entry.last_error = Some("REVOCATION_PENDING".into());
        }
        retained.push(entry);
    }
    store.save_pending_revocations(&retained)?;
    Ok(json!({"revoked":revoked,"remaining":retained.len()}))
}
pub fn list_pending_revocations(store: &Store) -> Result<Vec<PendingRevocation>> {
    for profile in store.profiles()? {
        for connection_id in &profile.pending_cleanup {
            store.queue_revocation(PendingRevocation {
                base_url: profile.base_url.clone(),
                owner_username: profile.owner_username.clone(),
                client: profile.client.clone(),
                connection_id: connection_id.clone(),
                expires_at: None,
                last_error: Some("LEGACY_CLEANUP_PENDING".into()),
            })?;
        }
    }
    store.pending_revocations()
}
pub fn profile_summaries(store: &Store) -> Result<Vec<Value>> {
    let staged_ids = store
        .switch_journals()?
        .into_iter()
        .filter_map(|journal| journal.staged_profile_id)
        .collect::<HashSet<_>>();
    store
        .profiles()?
        .iter()
        .filter(|profile| !staged_ids.contains(&profile.id))
        .map(|profile| {
            let mut summary = profile.summary();
            let Some(object) = summary.as_object_mut() else {
                bail!("INVALID_PROFILE");
            };
            object.insert(
                "connectionId".into(),
                Value::String(profile.connection_id.clone()),
            );
            match config::configured(profile) {
                Ok(value) => {
                    object.insert("configurationWritten".into(), Value::Bool(value));
                }
                Err(error) => {
                    object.insert("configurationWritten".into(), Value::Bool(false));
                    object.insert(
                        "configurationErrorCode".into(),
                        Value::String(safe_code(&error)),
                    );
                }
            }
            Ok(summary)
        })
        .collect()
}
pub fn recover_switches(store: &Store) -> Result<Vec<Value>> {
    let mut issues = Vec::new();
    for journal in store.switch_journals()? {
        let _operation = match operation_lock(store, &journal.candidate.client) {
            Ok(lock) => lock,
            Err(error) => {
                issues.push(json!({"id":journal.id,"errorCode":safe_code(&error)}));
                continue;
            }
        };
        let recovered = match journal.phase.as_str() {
            "prepared" => {
                let result = config::restore_journal(
                    store,
                    &journal.candidate.client,
                    &journal.config_path,
                    &journal.config_before,
                    &journal.config_after,
                    &journal.config_final,
                );
                if result.is_ok() {
                    if journal.candidate_is_new {
                        queue_candidate(store, &journal.candidate, "SWITCH_ROLLED_BACK")?;
                    }
                    if let Some(id) = &journal.staged_profile_id
                        && store.load(id).is_ok()
                    {
                        store.remove(id)?;
                    }
                    store.remove_switch_journal(&journal.id)?;
                    true
                } else {
                    issues.push(json!({"id":journal.id,"errorCode":result.err().map(|e|safe_code(&e)).unwrap_or_else(||"OPERATION_FAILED".into())}));
                    false
                }
            }
            "verified" => {
                let expected = if journal.config_final.is_empty() {
                    &journal.config_after
                } else {
                    &journal.config_final
                };
                if !config::journal_committed(&journal.config_path, expected)? {
                    issues.push(
                        json!({"id":journal.id,"errorCode":"CONFIG_RECOVERY_CONCURRENT_CHANGE"}),
                    );
                    continue;
                }
                if let Err(error) = store.save(&journal.candidate) {
                    issues.push(json!({"id":journal.id,"errorCode":safe_code(&error)}));
                    false
                } else {
                    for mut retired in journal.retired_credentials.clone() {
                        retired.last_error = Some("SWITCH_RECOVERY_PENDING".into());
                        store.queue_revocation(retired)?;
                    }
                    for source_id in journal
                        .source_profile_ids
                        .iter()
                        .map(String::as_str)
                        .chain(journal.source_profile_id.as_deref())
                    {
                        if source_id != journal.candidate.id && store.load(source_id).is_ok() {
                            store.remove(source_id)?;
                        }
                    }
                    if let Some(id) = &journal.staged_profile_id
                        && store.load(id).is_ok()
                    {
                        store.remove(id)?;
                    }
                    store.remove_switch_journal(&journal.id)?;
                    true
                }
            }
            _ => {
                issues.push(json!({"id":journal.id,"errorCode":"INVALID_OPERATION_PHASE"}));
                false
            }
        };
        if recovered {
            issues.push(json!({"id":journal.id,"recovered":true}));
        }
    }
    Ok(issues)
}
