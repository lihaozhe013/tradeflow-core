use crate::{
    api::Session,
    config, mcp,
    storage::{Client, Profile, Store},
};
use anyhow::{Context, Result, bail};
use serde_json::{Value, json};
use std::{
    path::{Path, PathBuf},
    process::Command,
};

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
                Command::new(path)
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
    let configured = config::configured(&profile)?;
    let overrides = config::overrides(&profile, cwd);
    let helper_available = profile.mode != "bridge"
        || Command::new(&profile.helper_path)
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
    if value.len() <= 80
        && value
            .chars()
            .all(|c| c.is_ascii_uppercase() || c.is_ascii_digit() || c == '_')
    {
        value
    } else {
        "OPERATION_FAILED".into()
    }
}
pub async fn repair(
    store: &Store,
    id: &str,
    client: Client,
    mode: &str,
    cwd: &Path,
) -> Result<Value> {
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
    let change = config::install(store, &profile, false)?;
    if let Err(error) = mcp::probe(&profile).await {
        change.rollback().context("ROLLBACK_FAILED")?;
        return Err(error);
    }
    if let Err(error) = store.save(&profile) {
        change.rollback().context("ROLLBACK_FAILED")?;
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
    let owner_username = session.user["username"]
        .as_str()
        .context("INVALID_SERVER_RESPONSE")?
        .to_owned();
    let previous = match existing {
        Some(id) => Some(store.load(&id)?),
        None => store.profiles()?.into_iter().find(|p| {
            p.client == client
                && p.base_url == session.base_url
                && p.owner_username == owner_username
        }),
    };
    if let Some(old) = &previous {
        if old.owner_username != owner_username {
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
    let issued = session.issue(client.name(), &store.device_id()?).await?;
    let connection_id = issued["id"]
        .as_str()
        .context("INVALID_SERVER_RESPONSE")?
        .to_owned();
    let mut profile = Profile {
        id: previous
            .as_ref()
            .map(|p| p.id.clone())
            .unwrap_or_else(|| uuid::Uuid::new_v4().to_string()),
        connection_id: connection_id.clone(),
        owner_username,
        client: client.clone(),
        base_url: session.base_url.clone(),
        token: issued["token"]
            .as_str()
            .context("INVALID_SERVER_RESPONSE")?
            .into(),
        tools: serde_json::from_value(issued["tools"].clone())
            .context("INVALID_SERVER_RESPONSE")?,
        expires_at: issued["expiresAt"]
            .as_str()
            .context("INVALID_SERVER_RESPONSE")?
            .into(),
        config_path: config::config_path(&client)?,
        helper_path,
        mode: mode.into(),
        pending_cleanup: previous
            .as_ref()
            .map(|p| p.pending_cleanup.clone())
            .unwrap_or_default(),
    };
    let result = async {
        let change = config::install(store, &profile, false)?;
        if let Err(error) = mcp::probe(&profile).await {
            change.rollback().context("ROLLBACK_FAILED")?;
            return Err(error);
        }
        if let Err(error) = store.save(&profile) {
            change.rollback().context("ROLLBACK_FAILED")?;
            return Err(error);
        }
        Ok(())
    }
    .await;
    if let Err(error) = result {
        if session.revoke(&connection_id).await.is_err() {
            if let Some(mut old) = previous {
                old.pending_cleanup.push(connection_id);
                store.save(&old)?;
            } else {
                profile.pending_cleanup.push(connection_id);
                store.save(&profile)?;
            }
            bail!("INSTALL_FAILED_CLEANUP_PENDING");
        }
        return Err(error);
    }
    if let Some(old) = previous
        && session.revoke(&old.connection_id).await.is_err()
    {
        profile.pending_cleanup.push(old.connection_id);
    }
    let mut pending = vec![];
    for id in &profile.pending_cleanup {
        if session.revoke(id).await.is_err() {
            pending.push(id.clone());
        }
    }
    profile.pending_cleanup = pending;
    store.save(&profile)?;
    doctor(store, &profile.id, client, &std::env::current_dir()?).await
}
pub async fn disconnect(session: &Session, store: &Store, id: &str) -> Result<()> {
    let profile = store.load(id)?;
    if session.user["username"].as_str() != Some(&profile.owner_username) {
        bail!("PROFILE_ACCOUNT_MISMATCH");
    }
    if profile.base_url != session.base_url {
        bail!("PROFILE_SERVER_MISMATCH");
    }
    session.revoke(&profile.connection_id).await?;
    for pending in &profile.pending_cleanup {
        session.revoke(pending).await?;
    }
    config::install(store, &profile, true)?;
    store.remove(id)
}
