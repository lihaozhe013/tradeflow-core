use crate::{
    api::Session,
    diagnostics::{self, Stage},
    mcp,
    storage::{PendingRevocation, Profile, Store, validate_connection_name},
};
use anyhow::{Context, Result, bail};
use fs2::FileExt;
use serde_json::{Value, json};
use std::{
    fs::{self, File},
    future::Future,
    path::PathBuf,
    pin::Pin,
};

pub type BoxFuture<'a> = Pin<Box<dyn Future<Output = Result<Value>> + Send + 'a>>;

fn operation_lock(store: &Store, key: &str) -> Result<File> {
    let name: String = key
        .chars()
        .map(|value| {
            if value.is_ascii_alphanumeric() || value == '-' || value == '_' {
                value
            } else {
                '_'
            }
        })
        .take(64)
        .collect();
    let lock = fs::OpenOptions::new()
        .create(true)
        .truncate(false)
        .read(true)
        .write(true)
        .open(store.root.join(format!("{name}-operation.lock")))?;
    lock.try_lock_exclusive().context("OPERATION_BUSY")?;
    Ok(lock)
}
fn unexpired(profile: &Profile) -> bool {
    chrono::DateTime::parse_from_rfc3339(&profile.expires_at)
        .is_ok_and(|date| date > chrono::Utc::now())
}
fn queue_revocation(store: &Store, profile: &Profile, error: &str) -> Result<()> {
    store.queue_revocation(PendingRevocation {
        base_url: profile.base_url.clone(),
        owner_username: profile.owner_username.clone(),
        client: profile.client.clone(),
        connection_id: profile.connection_id.clone(),
        expires_at: Some(profile.expires_at.clone()),
        last_error: Some(error.into()),
    })
}
async fn revoke_or_queue(session: &Session, store: &Store, profile: &Profile) -> Result<bool> {
    if diagnostics::step(
        Stage::RevokeCandidate,
        session.revoke(&profile.connection_id),
    )
    .await
    .is_ok()
    {
        return Ok(true);
    }
    queue_revocation(store, profile, "INSTALL_FAILED_CLEANUP_PENDING")?;
    Ok(false)
}
fn tools_from(value: &Value) -> Result<Vec<String>> {
    serde_json::from_value(value.clone()).context("INVALID_SERVER_RESPONSE")
}
fn catalog_values(profile: &mut Profile, source: &Value) {
    if let Some(version) = source["catalogVersion"].as_str() {
        profile.catalog_version = Some(version.to_owned());
    }
    if let Some(version) = source["guideVersion"].as_str() {
        profile.guide_version = Some(version.to_owned());
    }
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
        "CLIPBOARD_WRITE_FAILED",
        "HELPER_NOT_FOUND",
        "HOME_UNAVAILABLE",
        "HOST_COMPATIBILITY",
        "HTTPS_OR_LOOPBACK_ORIGIN_REQUIRED",
        "INVALID_CONNECTION_ID",
        "INVALID_CONNECTION_MODE",
        "INVALID_CONNECTION_NAME",
        "INVALID_DEVICE_ID",
        "INVALID_DISCONNECT_MODE",
        "INVALID_LANGUAGE",
        "INVALID_OPERATION_ID",
        "INVALID_PROFILE",
        "INVALID_PROFILE_ID",
        "INVALID_PROMPT_KIND",
        "INVALID_SAVED_SESSION",
        "SESSION_STORAGE_UNAVAILABLE",
        "INVALID_SERVER_RESPONSE",
        "INVALID_SERVER_URL",
        "INVALID_SETTINGS",
        "INVALID_STORAGE_PATH",
        "LEGACY_JOURNAL_UNREADABLE",
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
        "NETWORK_TIMEOUT",
        "NO_AUTHORIZED_TOOLS",
        "OPERATION_BUSY",
        "OPERATION_FAILED",
        "OPERATION_PANICKED",
        "PROFILE_ACCOUNT_MISMATCH",
        "PROFILE_NOT_FOUND",
        "PROFILE_REMOVE_FAILED",
        "PROFILE_SERVER_MISMATCH",
        "ROLE_NOT_SUPPORTED",
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
pub fn profile_summaries(store: &Store) -> Result<Vec<Value>> {
    Ok(store
        .profiles()?
        .iter()
        .map(Profile::summary)
        .collect::<Vec<_>>())
}
/// Redacted launch descriptor. It contains no credential, so an Agent can read it safely.
pub fn describe(store: &Store, id: &str) -> Result<Value> {
    let profile = store.load(id)?;
    Ok(json!({
        "client": profile.client,
        "server": profile.base_url,
        "account": profile.owner_username,
        "profile": profile.id,
        "serverName": profile.server_name(),
        "mode": profile.mode,
        "transport": "stdio",
        "command": profile.helper_path,
        "args": profile.launch_args(),
        "tools": profile.tools,
        "expiresAt": profile.expires_at,
        "catalogVersion": profile.catalog_version,
        "guideVersion": profile.guide_version,
        "lastSyncAt": profile.last_sync_at,
    }))
}
pub async fn doctor(store: &Store, id: &str) -> Result<Value> {
    let profile = store.load(id)?;
    let helper_available = profile.helper_path.is_file();
    let probe = if helper_available {
        mcp::probe(&profile).await
    } else {
        Err(anyhow::anyhow!("HELPER_NOT_FOUND"))
    };
    let (remote, error) = match probe {
        Ok(value) => (value, Value::Null),
        Err(failure) => (Value::Null, Value::String(safe_code(&failure))),
    };
    Ok(json!({
        "profile": profile.summary(),
        "helperAvailable": helper_available,
        "serviceVerified": !remote.is_null(),
        "hostVerified": false,
        "hostActivationRequired": true,
        "remote": remote,
        "errorCode": error,
        "nextStep": "Enable/trust or reload the host, then run one TradeFlow query. Expired credentials require renewal in the connection assistant.",
    }))
}
enum Credential {
    Reused(Value),
    Issued(Value),
}
pub fn connect<'a>(
    session: &'a Session,
    store: &'a Store,
    helper_path: PathBuf,
    existing: Option<String>,
    name: &'a str,
    mode: &'a str,
) -> BoxFuture<'a> {
    // Tauri constructs command futures on the native window thread; keep the state machine off it.
    Box::pin(async move {
        let name = validate_connection_name(name)?;
        if !matches!(mode, "bridge" | "remote") {
            bail!("INVALID_CONNECTION_MODE");
        }
        if mode == "bridge" && !helper_path.exists() {
            bail!("HELPER_NOT_FOUND");
        }
        let _operation = operation_lock(store, "connect")?;
        let username = session.user["username"]
            .as_str()
            .context("INVALID_SERVER_RESPONSE")?;
        let previous = existing.as_deref().map(|id| store.load(id)).transpose()?;
        if let Some(old) = &previous {
            if old.owner_username != username {
                bail!("PROFILE_ACCOUNT_MISMATCH");
            }
            if old.base_url != session.base_url {
                bail!("PROFILE_SERVER_MISMATCH");
            }
        }
        let capabilities = session.capabilities().await?;
        if capabilities["enabled"] != true {
            bail!("MCP_DISABLED");
        }
        let reuse_name = previous
            .as_ref()
            .map(|profile| profile.client.clone())
            .unwrap_or(name);
        let credential = match previous.as_ref() {
            Some(old) if unexpired(old) => match mcp::probe(old).await {
                Ok(value) => Credential::Reused(value),
                Err(error) if safe_code(&error) == "HTTP_401" => {
                    // An expired or revoked credential is replaced without changing the profile ID.
                    Credential::Issued(
                        diagnostics::step(
                            Stage::IssueCredential,
                            session.issue(&reuse_name, &store.device_id()?),
                        )
                        .await?,
                    )
                }
                Err(error) => return Err(error),
            },
            _ => Credential::Issued(
                diagnostics::step(
                    Stage::IssueCredential,
                    session.issue(&reuse_name, &store.device_id()?),
                )
                .await?,
            ),
        };
        let (mut candidate, reused) = match credential {
            Credential::Reused(remote) => {
                let mut profile = previous.clone().context("PROFILE_NOT_FOUND")?;
                profile.mode = mode.into();
                profile.helper_path = helper_path;
                profile.tools = tools_from(&remote["tools"])?;
                catalog_values(&mut profile, &capabilities);
                (profile, Some(remote))
            }
            Credential::Issued(issued) => {
                let mut profile = Profile {
                    id: previous
                        .as_ref()
                        .map(|profile| profile.id.clone())
                        .unwrap_or_else(|| uuid::Uuid::new_v4().to_string()),
                    connection_id: issued["id"]
                        .as_str()
                        .context("INVALID_SERVER_RESPONSE")?
                        .into(),
                    owner_username: username.into(),
                    client: reuse_name.clone(),
                    base_url: session.base_url.clone(),
                    token: issued["token"]
                        .as_str()
                        .context("INVALID_SERVER_RESPONSE")?
                        .into(),
                    tools: tools_from(issued.get("effectiveTools").unwrap_or(&issued["tools"]))?,
                    expires_at: issued["expiresAt"]
                        .as_str()
                        .context("INVALID_SERVER_RESPONSE")?
                        .into(),
                    helper_path,
                    mode: mode.into(),
                    pending_cleanup: vec![],
                    catalog_version: None,
                    guide_version: None,
                    last_sync_at: None,
                };
                catalog_values(&mut profile, &issued);
                catalog_values(&mut profile, &capabilities);
                (profile, None)
            }
        };
        if candidate.catalog_version.is_none() {
            catalog_values(&mut candidate, &capabilities);
        }
        let reused_credential = reused.is_some();
        let verified = match reused {
            Some(remote) => remote,
            None => match mcp::probe(&candidate).await {
                Ok(remote) => remote,
                Err(error) => {
                    revoke_or_queue(session, store, &candidate).await?;
                    return Err(error);
                }
            },
        };
        candidate.tools = tools_from(&verified["tools"])?;
        candidate.last_sync_at = Some(chrono::Utc::now().to_rfc3339());
        if let Some(old) = &previous
            && old.connection_id != candidate.connection_id
        {
            queue_revocation(store, old, "MANUAL_REVOCATION")?;
        }
        if let Err(error) = store.save(&candidate) {
            if !reused_credential {
                revoke_or_queue(session, store, &candidate).await?;
            }
            return Err(error);
        }
        Ok(json!({
            "profile": candidate.summary(),
            "serviceVerified": true,
            "hostVerified": false,
            "hostActivationRequired": true,
            "reusedCredential": reused_credential,
            "remote": verified,
            "nextStep": "Copy the connect prompt into the Agent. The Agent configures its own MCP entry, then reload and run one query.",
        }))
    })
}
pub fn sync<'a>(session: &'a Session, store: &'a Store, id: &'a str) -> BoxFuture<'a> {
    Box::pin(async move {
        let mut profile = store.load(id)?;
        let username = session.user["username"]
            .as_str()
            .context("INVALID_SERVER_RESPONSE")?;
        if profile.owner_username != username {
            bail!("PROFILE_ACCOUNT_MISMATCH");
        }
        if profile.base_url != session.base_url {
            bail!("PROFILE_SERVER_MISMATCH");
        }
        let _operation = operation_lock(store, &profile.id)?;
        let capabilities = session.capabilities().await?;
        if capabilities["enabled"] != true {
            bail!("MCP_DISABLED");
        }
        let catalog = diagnostics::step(Stage::SyncCatalog, session.catalog()).await?;
        let remote = mcp::probe(&profile).await?;
        let tools = tools_from(&remote["tools"])?;
        let added: Vec<String> = tools
            .iter()
            .filter(|name| !profile.tools.contains(name))
            .cloned()
            .collect();
        let removed: Vec<String> = profile
            .tools
            .iter()
            .filter(|name| !tools.contains(name))
            .cloned()
            .collect();
        profile.tools = tools;
        profile.catalog_version = catalog["version"].as_str().map(str::to_owned);
        profile.guide_version = catalog["guideVersion"].as_str().map(str::to_owned);
        profile.last_sync_at = Some(chrono::Utc::now().to_rfc3339());
        store.save(&profile)?;
        Ok(json!({
            "profile": profile.summary(),
            "catalog": {
                "version": catalog["version"],
                "guideVersion": catalog["guideVersion"],
                "minBridgeVersion": catalog["minBridgeVersion"],
                "tools": catalog["tools"],
            },
            "remote": remote,
            "added": added,
            "removed": removed,
            "changed": !added.is_empty() || !removed.is_empty(),
            "hostActivationRequired": true,
            "nextStep": "If tools changed, reload or start a new session in the host, then run one minimal query.",
        }))
    })
}
pub async fn disconnect(
    session: Option<&Session>,
    store: &Store,
    id: &str,
    revoke: bool,
) -> Result<Value> {
    let profile = store.load(id)?;
    let _operation = operation_lock(store, &profile.id)?;
    let mut revoked = false;
    if revoke && let Some(session) = session {
        if session.user["username"].as_str() != Some(&profile.owner_username) {
            bail!("PROFILE_ACCOUNT_MISMATCH");
        }
        if profile.base_url != session.base_url {
            bail!("PROFILE_SERVER_MISMATCH");
        }
        revoked = session.revoke(&profile.connection_id).await.is_ok();
    }
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
    Ok(json!({
        "localRemoved": true,
        "remoteRevoked": revoked,
        "reloadRequired": true,
        "remoteCleanupRequired": !revoked,
        "agentConfigurationNote": "The host may still list this MCP server. Remove it in the Agent if you no longer use it.",
    }))
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
/// Finishes profile cleanup for journals written before host configuration management was removed.
/// Host entries themselves are owned by the Agent and are never edited here.
pub fn recover_operations(store: &Store) -> Result<Vec<Value>> {
    let mut issues = Vec::new();
    for journal in store.legacy_journals()? {
        let _operation = match operation_lock(store, &journal.candidate.id) {
            Ok(lock) => lock,
            Err(error) => {
                issues.push(json!({"id":journal.id,"errorCode":safe_code(&error)}));
                continue;
            }
        };
        let result = (|| -> Result<()> {
            if journal.phase == "verified" {
                store.save(&journal.candidate)?;
                for retired in &journal.retired_credentials {
                    store.queue_revocation(retired.clone())?;
                }
                for source in journal
                    .source_profile_ids
                    .iter()
                    .map(String::as_str)
                    .chain(journal.source_profile_id.as_deref())
                {
                    if source != journal.candidate.id && store.load(source).is_ok() {
                        store.remove(source)?;
                    }
                }
            } else if journal.candidate_is_new {
                queue_revocation(store, &journal.candidate, "SWITCH_ROLLED_BACK")?;
            }
            if let Some(id) = &journal.staged_profile_id
                && store.load(id).is_ok()
            {
                store.remove(id)?;
            }
            store.remove_legacy_journal(&journal.id)
        })();
        match result {
            Ok(()) => issues.push(json!({"id":journal.id,"recovered":true})),
            Err(error) => issues.push(json!({"id":journal.id,"errorCode":safe_code(&error)})),
        }
    }
    Ok(issues)
}
