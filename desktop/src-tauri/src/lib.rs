use serde_json::{Value, json};
use std::path::PathBuf;
use std::{future::Future, pin::Pin};
use tauri::{Emitter, Manager, State};
use tokio::sync::Mutex;
use tradeflow_connect::{
    api::{self, Session},
    connection,
    diagnostics::{self, Action, Operation},
    prompts,
    storage::{Settings, Store},
};

mod session_store;

#[derive(Default)]
struct AppState {
    session: Mutex<Option<Session>>,
    session_started: Mutex<Option<std::time::Instant>>,
    remembered: Mutex<bool>,
    operation: Mutex<()>,
}

async fn restored_session(state: &AppState) -> anyhow::Result<Option<Session>> {
    let Some(saved) = session_store::load().await? else {
        return Ok(None);
    };
    match api::refresh_login(&saved.base_url, &saved.refresh_token).await {
        Ok(session) => {
            *state.session.lock().await = Some(session.clone());
            *state.session_started.lock().await = Some(std::time::Instant::now());
            *state.remembered.lock().await = true;
            Ok(Some(session))
        }
        Err(error) => {
            if matches!(
                connection::safe_code(&error).as_str(),
                "HTTP_401" | "AUTH_DISABLED" | "ACCOUNT_DISABLED"
            ) {
                *state.session.lock().await = None;
                session_store::clear().await?;
            }
            Err(error)
        }
    }
}
async fn current_session(state: &AppState) -> anyhow::Result<Session> {
    let current = state.session.lock().await.clone();
    let fresh = state
        .session_started
        .lock()
        .await
        .is_some_and(|time| time.elapsed().as_secs() < 300);
    if fresh && let Some(session) = current.as_ref() {
        return Ok(session.clone());
    }
    if !*state.remembered.lock().await {
        return current.ok_or_else(|| anyhow::anyhow!("LOGIN_REQUIRED"));
    }
    if let Some(session) = restored_session(state).await? {
        return Ok(session);
    }
    current.ok_or_else(|| anyhow::anyhow!("LOGIN_REQUIRED"))
}
#[tauri::command]
async fn restore_session(state: State<'_, AppState>) -> Result<Value, String> {
    let _operation = state.operation.try_lock().map_err(|_| "OPERATION_BUSY")?;
    let session = restored_session(&state)
        .await
        .map_err(|e| connection::safe_code(&e))?;
    let Some(session) = session else {
        return Ok(json!({"restored":false}));
    };
    let capabilities = session
        .capabilities()
        .await
        .map_err(|e| connection::safe_code(&e))?;
    Ok(
        json!({"restored":true,"remembered":true,"user":session.user,"baseUrl":session.base_url,"capabilities":capabilities}),
    )
}

async fn observed(
    app: &tauri::AppHandle,
    action: Action,
    client: Option<String>,
    server: Option<&str>,
    work: Pin<Box<dyn Future<Output = anyhow::Result<Value>> + Send + '_>>,
) -> Result<Value, Value> {
    let store = Store::system().map_err(|e| json!({"errorCode":connection::safe_code(&e)}))?;
    let emitter = app.clone();
    let operation = Operation::new(
        &store,
        action,
        client,
        server,
        Some(std::sync::Arc::new(move |event| {
            let _ = emitter.emit("connect-operation", event);
        })),
    );
    let (result, report) = operation.run(work).await;
    match result {
        Ok(mut value) => {
            if let Some(object) = value.as_object_mut() {
                object.insert("operation".into(), serde_json::to_value(report).unwrap());
            } else {
                value = json!({"data":value,"operation":report});
            }
            Ok(value)
        }
        Err(error) => Err(json!({"errorCode":connection::safe_code(&error),"operation":report})),
    }
}
#[tauri::command]
async fn login(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    server: String,
    username: String,
    password: String,
    remember: Option<bool>,
) -> Result<Value, Value> {
    observed(
        &app,
        Action::Login,
        None,
        Some(&server),
        Box::pin(async {
            let _operation = state
                .operation
                .try_lock()
                .map_err(|_| anyhow::anyhow!("OPERATION_BUSY"))?;
            let previous_result = session_store::load().await;
            let saved_login_may_remain = previous_result.is_err() && !remember.unwrap_or(false);
            let previous = if remember.unwrap_or(false) { previous_result? } else { previous_result.ok().flatten() };
            let remembered = if remember.unwrap_or(false) {
                Some(api::remember_login(&server, &username, &password).await?)
            } else { None };
            let session = match &remembered {
                Some(value) => value.session.clone(),
                None => api::login(&server, &username, &password).await?,
            };
            let setup = async {
                let capabilities = session.capabilities().await?;
                if let Some(value) = &remembered {
                    session_store::save(session_store::SavedSession {
                        base_url: session.base_url.clone(), refresh_token: value.refresh_token.clone(), expires_at: value.expires_at.clone(),
                    }).await?;
                } else if previous.is_some() { session_store::clear().await?; }
                Ok::<_, anyhow::Error>(capabilities)
            }.await;
            let capabilities = match setup {
                Ok(value) => value,
                Err(error) => {
                    if let Some(value) = &remembered { let _ = api::revoke_login(&session.base_url, &value.refresh_token).await; }
                    return Err(error);
                }
            };
            if let Some(old) = previous { let _ = api::revoke_login(&old.base_url, &old.refresh_token).await; }
            let result = json!({"user":session.user,"capabilities":capabilities,"baseUrl":session.base_url,"remembered":remembered.is_some(),"savedLoginMayRemain":saved_login_may_remain});
            *state.remembered.lock().await = remembered.is_some();
            *state.session.lock().await = Some(session);
            *state.session_started.lock().await = Some(std::time::Instant::now());
            Ok(result)
        }),
    )
    .await
}
#[tauri::command]
async fn logout(state: State<'_, AppState>) -> Result<Value, String> {
    let _operation = state.operation.try_lock().map_err(|_| "OPERATION_BUSY")?;
    *state.session.lock().await = None;
    *state.session_started.lock().await = None;
    *state.remembered.lock().await = false;
    let saved = session_store::load().await;
    session_store::clear()
        .await
        .map_err(|e| connection::safe_code(&e))?;
    let mut remote_pending = false;
    if let Ok(Some(saved)) = saved {
        remote_pending = api::revoke_login(&saved.base_url, &saved.refresh_token)
            .await
            .is_err();
    }
    Ok(json!({"remoteSessionCleanupRequired":remote_pending}))
}
#[tauri::command]
fn get_settings() -> Result<Value, String> {
    let store = Store::system().map_err(|e| connection::safe_code(&e))?;
    serde_json::to_value(store.settings().map_err(|e| connection::safe_code(&e))?)
        .map_err(|_| "INVALID_SETTINGS".into())
}
#[tauri::command]
fn set_language(language: String) -> Result<(), String> {
    let store = Store::system().map_err(|e| connection::safe_code(&e))?;
    store
        .save_settings(&Settings { language })
        .map_err(|e| connection::safe_code(&e))
}
#[tauri::command]
fn pending_revocations() -> Result<Value, String> {
    let store = Store::system().map_err(|e| connection::safe_code(&e))?;
    serde_json::to_value(
        connection::list_pending_revocations(&store).map_err(|e| connection::safe_code(&e))?,
    )
    .map_err(|_| "INVALID_PENDING_REVOCATIONS".into())
}
#[tauri::command]
async fn retry_pending_revocations(state: State<'_, AppState>) -> Result<Value, String> {
    let _operation = state.operation.try_lock().map_err(|_| "OPERATION_BUSY")?;
    let session = current_session(&state)
        .await
        .map_err(|e| connection::safe_code(&e))?;
    let store = Store::system().map_err(|e| connection::safe_code(&e))?;
    connection::retry_pending_revocations(&session, &store)
        .await
        .map_err(|e| connection::safe_code(&e))
}
#[tauri::command]
fn profiles() -> Result<Value, String> {
    let store = Store::system().map_err(|e| connection::safe_code(&e))?;
    connection::profile_summaries(&store)
        .map(Value::Array)
        .map_err(|e| connection::safe_code(&e))
}
#[tauri::command]
fn recover_operations() -> Result<Value, String> {
    let store = Store::system().map_err(|e| connection::safe_code(&e))?;
    connection::recover_operations(&store)
        .map_err(|e| connection::safe_code(&e))
        .map(Value::Array)
}
fn helper(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let name = if cfg!(windows) {
        "tradeflow-connect.exe"
    } else {
        "tradeflow-connect"
    };
    let beside = std::env::current_exe()
        .map_err(|_| "HELPER_NOT_FOUND")?
        .parent()
        .ok_or("HELPER_NOT_FOUND")?
        .join(name);
    if beside.exists() {
        return Ok(beside);
    }
    let resource = app
        .path()
        .resource_dir()
        .map_err(|_| "HELPER_NOT_FOUND")?
        .join(name);
    if resource.exists() {
        return Ok(resource);
    }
    let dev = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../target/debug")
        .join(name);
    if dev.exists() {
        return Ok(dev);
    }
    if let Some(target) = option_env!("TAURI_ENV_TARGET_TRIPLE") {
        let extension = if cfg!(windows) { ".exe" } else { "" };
        let sidecar = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("binaries")
            .join(format!("tradeflow-connect-{target}{extension}"));
        if sidecar.exists() {
            return Ok(sidecar);
        }
    }
    Err("HELPER_NOT_FOUND".into())
}
#[tauri::command]
async fn connect_connection(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    name: String,
    existing: Option<String>,
    mode: String,
) -> Result<Value, Value> {
    let session = state.session.lock().await.clone();
    let server = session.as_ref().map(|s| s.base_url.clone());
    observed(
        &app,
        Action::Connect,
        Some(name.clone()),
        server.as_deref(),
        Box::pin(async {
            let _operation = state
                .operation
                .try_lock()
                .map_err(|_| anyhow::anyhow!("OPERATION_BUSY"))?;
            let session = current_session(&state).await?;
            let store = Store::system()?;
            connection::connect(
                &session,
                &store,
                helper(&app).map_err(anyhow::Error::msg)?,
                existing,
                &name,
                &mode,
            )
            .await
        }),
    )
    .await
}
#[tauri::command]
async fn sync_connection(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    profile: String,
) -> Result<Value, Value> {
    let store = Store::system().map_err(|e| json!({"errorCode":connection::safe_code(&e)}))?;
    let loaded = store.load(&profile).ok();
    let server = loaded.as_ref().map(|p| p.base_url.clone());
    observed(
        &app,
        Action::Sync,
        loaded.as_ref().map(|p| p.client.clone()),
        server.as_deref(),
        Box::pin(async {
            let _operation = state
                .operation
                .try_lock()
                .map_err(|_| anyhow::anyhow!("OPERATION_BUSY"))?;
            let session = current_session(&state).await?;
            connection::sync(&session, &store, &profile).await
        }),
    )
    .await
}
#[tauri::command]
async fn diagnose(app: tauri::AppHandle, profile: String) -> Result<Value, Value> {
    let store = Store::system().map_err(|e| json!({"errorCode":connection::safe_code(&e)}))?;
    let loaded = store.load(&profile).ok();
    let server = loaded.as_ref().map(|p| p.base_url.clone());
    observed(
        &app,
        Action::Doctor,
        loaded.as_ref().map(|p| p.client.clone()),
        server.as_deref(),
        Box::pin(async {
            let report = connection::doctor(&store, &profile).await?;
            if let Some(code) = report["errorCode"].as_str() {
                anyhow::bail!("{code}");
            }
            Ok(report)
        }),
    )
    .await
}
#[tauri::command]
async fn disconnect_connection(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    profile: String,
    mode: String,
) -> Result<Value, Value> {
    let store = Store::system().map_err(|e| json!({"errorCode":connection::safe_code(&e)}))?;
    let loaded = store.load(&profile).ok();
    observed(
        &app,
        Action::Remove,
        loaded.as_ref().map(|p| p.client.clone()),
        loaded.as_ref().map(|p| p.base_url.as_str()),
        Box::pin(async {
            let _operation = state
                .operation
                .try_lock()
                .map_err(|_| anyhow::anyhow!("OPERATION_BUSY"))?;
            if !matches!(mode.as_str(), "revoke" | "local") {
                anyhow::bail!("INVALID_DISCONNECT_MODE");
            }
            let session = if mode == "revoke" {
                Some(current_session(&state).await?)
            } else {
                None
            };
            connection::disconnect(session.as_ref(), &store, &profile, mode == "revoke").await
        }),
    )
    .await
}
#[tauri::command]
fn operation_logs() -> Result<Value, String> {
    let store = Store::system().map_err(|e| connection::safe_code(&e))?;
    serde_json::to_value(diagnostics::recent(&store).map_err(|e| connection::safe_code(&e))?)
        .map_err(|_| "LOG_READ_FAILED".into())
}
#[tauri::command]
fn crash_reports() -> Result<Value, String> {
    let store = Store::system().map_err(|e| connection::safe_code(&e))?;
    serde_json::to_value(diagnostics::crash_events(&store).map_err(|e| connection::safe_code(&e))?)
        .map_err(|_| "LOG_READ_FAILED".into())
}
#[tauri::command]
async fn export_operation_logs(app: tauri::AppHandle) -> Result<Value, String> {
    use tauri_plugin_dialog::DialogExt;
    let (sender, receiver) = tokio::sync::oneshot::channel();
    app.dialog()
        .file()
        .set_file_name("tradeflow-diagnostics.json")
        .add_filter("JSON", &["json"])
        .save_file(move |file| {
            let _ = sender.send(file);
        });
    let Some(file) = receiver.await.map_err(|_| "LOG_EXPORT_FAILED")? else {
        return Ok(json!({"exported":false}));
    };
    let path = file.into_path().map_err(|_| "LOG_EXPORT_FAILED")?;
    let store = Store::system().map_err(|e| connection::safe_code(&e))?;
    diagnostics::export(&store, &path).map_err(|e| connection::safe_code(&e))?;
    Ok(json!({"exported":true}))
}
#[tauri::command]
fn open_credentials_page(app: tauri::AppHandle, server: String) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    let base = api::normalize_url(&server).map_err(|e| connection::safe_code(&e))?;
    app.opener()
        .open_url(format!("{base}/#/mcp-connections"), None::<&str>)
        .map_err(|_| "BROWSER_OPEN_FAILED".into())
}
#[tauri::command]
fn connection_prompts(profile: String, language: Option<String>) -> Result<Value, String> {
    let store = Store::system().map_err(|e| connection::safe_code(&e))?;
    Ok(prompts::generate_for(
        &store
            .load(&profile)
            .map_err(|e| connection::safe_code(&e))?,
        language.as_deref().unwrap_or("en"),
    ))
}
#[tauri::command]
fn copy_prompt(
    app: tauri::AppHandle,
    profile: String,
    kind: String,
    language: Option<String>,
) -> Result<(), String> {
    use tauri_plugin_clipboard_manager::ClipboardExt;
    if !matches!(kind.as_str(), "business" | "connect" | "update" | "repair") {
        return Err("INVALID_PROMPT_KIND".into());
    }
    let values = connection_prompts(profile, language)?;
    let text = values[&kind].as_str().ok_or("INVALID_PROMPT_KIND")?;
    app.clipboard()
        .write_text(text)
        .map_err(|_| "CLIPBOARD_WRITE_FAILED".into())
}
pub fn run() {
    diagnostics::install_panic_logging();
    tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            operation_logs,
            crash_reports,
            export_operation_logs,
            open_credentials_page,
            login,
            restore_session,
            logout,
            get_settings,
            set_language,
            pending_revocations,
            retry_pending_revocations,
            profiles,
            recover_operations,
            connect_connection,
            sync_connection,
            diagnose,
            disconnect_connection,
            connection_prompts,
            copy_prompt
        ])
        .run(tauri::generate_context!())
        .expect("Failed to start TradeFlow Connect");
}

#[cfg(test)]
mod tests {
    use super::*;
    #[tokio::test]
    async fn temporary_logins_do_not_need_a_system_keyring_for_operations() {
        let state = AppState::default();
        *state.session.lock().await = Some(Session {
            base_url: "https://tradeflow.example.com".into(),
            jwt: "in-memory-only".into(),
            user: json!({"username":"reader","role":"reader"}),
        });
        let session = current_session(&state).await.unwrap();
        assert_eq!(session.jwt, "in-memory-only");
        *state.session.lock().await = None;
        assert_eq!(
            current_session(&state).await.err().unwrap().to_string(),
            "LOGIN_REQUIRED"
        );
    }
}
