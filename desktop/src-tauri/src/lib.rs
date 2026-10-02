use serde_json::{Value, json};
use std::future::Future;
use std::path::PathBuf;
use tauri::{Emitter, Manager, State};
use tokio::sync::Mutex;
use tradeflow_connect::{
    api::{self, Session},
    connection,
    diagnostics::{self, Action, Operation},
    prompts,
    storage::{Client, Settings, Store},
};

#[derive(Default)]
struct AppState {
    session: Mutex<Option<Session>>,
    previous_session: Mutex<Option<Session>>,
    operation: Mutex<()>,
}

fn target(value: &str) -> Result<Client, String> {
    match value {
        "opencode" => Ok(Client::Opencode),
        "workbuddy" => Ok(Client::Workbuddy),
        _ => Err("INVALID_CLIENT".into()),
    }
}
async fn observed(
    app: &tauri::AppHandle,
    action: Action,
    client: Option<Client>,
    server: Option<&str>,
    work: impl Future<Output = anyhow::Result<Value>>,
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
    preserve_previous: Option<bool>,
) -> Result<Value, Value> {
    observed(&app, Action::Login, None, Some(&server), async {
        let _operation = state
            .operation
            .try_lock()
            .map_err(|_| anyhow::anyhow!("OPERATION_BUSY"))?;
        let session = api::login(&server, &username, &password).await?;
        let capabilities = session.capabilities().await?;
        let result =
            json!({"user":session.user,"capabilities":capabilities,"baseUrl":session.base_url});
        if preserve_previous.unwrap_or(false) {
            let previous = state.session.lock().await.take();
            if let Some(previous) = previous {
                *state.previous_session.lock().await = Some(previous);
            }
        } else {
            *state.previous_session.lock().await = None;
        }
        *state.session.lock().await = Some(session);
        Ok(result)
    })
    .await
}
#[tauri::command]
async fn logout(state: State<'_, AppState>) -> Result<(), String> {
    *state.session.lock().await = None;
    *state.previous_session.lock().await = None;
    Ok(())
}
#[tauri::command]
async fn cancel_server_switch(state: State<'_, AppState>) -> Result<(), String> {
    let previous = state.previous_session.lock().await.take();
    if previous.is_some() {
        *state.session.lock().await = previous;
    }
    Ok(())
}
#[tauri::command]
async fn finish_server_switch(state: State<'_, AppState>) -> Result<(), String> {
    *state.previous_session.lock().await = None;
    Ok(())
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
    let session = state.session.lock().await.clone().ok_or("LOGIN_REQUIRED")?;
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
fn recover_switches() -> Result<Value, String> {
    let store = Store::system().map_err(|e| connection::safe_code(&e))?;
    connection::recover_switches(&store)
        .map_err(|e| connection::safe_code(&e))
        .map(Value::Array)
}
#[tauri::command]
fn detect_clients() -> Value {
    json!([
        connection::detect(&Client::Opencode),
        connection::detect(&Client::Workbuddy)
    ])
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
async fn connect_agent(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    client: String,
    existing: Option<String>,
    mode: String,
) -> Result<Value, Value> {
    let session = state.session.lock().await.clone();
    let server = session.as_ref().map(|s| s.base_url.clone());
    observed(
        &app,
        Action::Connect,
        target(&client).ok(),
        server.as_deref(),
        async {
            let _operation = state
                .operation
                .try_lock()
                .map_err(|_| anyhow::anyhow!("OPERATION_BUSY"))?;
            let session = session.ok_or_else(|| anyhow::anyhow!("LOGIN_REQUIRED"))?;
            let store = Store::system()?;
            connection::connect_simple(
                &session,
                &store,
                target(&client).map_err(anyhow::Error::msg)?,
                helper(&app).map_err(anyhow::Error::msg)?,
                existing,
                &mode,
            )
            .await
        },
    )
    .await
}
#[tauri::command]
async fn switch_agent(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    client: String,
    old_profile: Option<String>,
    target_profile: Option<String>,
    mode: String,
) -> Result<Value, String> {
    let _operation = state.operation.try_lock().map_err(|_| "OPERATION_BUSY")?;
    let session = state.session.lock().await.clone().ok_or("LOGIN_REQUIRED")?;
    let previous_session = state.previous_session.lock().await.clone();
    let store = Store::system().map_err(|e| connection::safe_code(&e))?;
    let result = connection::switch(
        &session,
        previous_session.as_ref(),
        &store,
        connection::SwitchRequest {
            client: target(&client)?,
            helper_path: helper(&app)?,
            old_profile_id: old_profile,
            target_profile_id: target_profile,
            mode,
        },
    )
    .await
    .map_err(|e| connection::safe_code(&e))?;
    Ok(result)
}
#[tauri::command]
async fn diagnose(app: tauri::AppHandle, profile: String, client: String) -> Result<Value, Value> {
    let store = Store::system().map_err(|e| json!({"errorCode":connection::safe_code(&e)}))?;
    let server = store.load(&profile).ok().map(|p| p.base_url);
    observed(
        &app,
        Action::Doctor,
        target(&client).ok(),
        server.as_deref(),
        async {
            let report = connection::doctor(
                &store,
                &profile,
                target(&client).map_err(anyhow::Error::msg)?,
                &std::env::current_dir()?,
            )
            .await?;
            if let Some(code) = report["errorCode"].as_str() {
                anyhow::bail!("{code}");
            }
            Ok(report)
        },
    )
    .await
}
#[tauri::command]
async fn repair_agent(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    profile: String,
    client: String,
    mode: String,
) -> Result<Value, Value> {
    let store = Store::system().map_err(|e| json!({"errorCode":connection::safe_code(&e)}))?;
    let server = store.load(&profile).ok().map(|p| p.base_url);
    observed(
        &app,
        Action::Repair,
        target(&client).ok(),
        server.as_deref(),
        async {
            let _operation = state
                .operation
                .try_lock()
                .map_err(|_| anyhow::anyhow!("OPERATION_BUSY"))?;
            connection::repair(
                &store,
                &profile,
                target(&client).map_err(anyhow::Error::msg)?,
                &mode,
                &std::env::current_dir()?,
            )
            .await
        },
    )
    .await
}
#[tauri::command]
async fn disconnect_agent(
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
        async {
            let _operation = state
                .operation
                .try_lock()
                .map_err(|_| anyhow::anyhow!("OPERATION_BUSY"))?;
            if !matches!(mode.as_str(), "revoke" | "local") {
                anyhow::bail!("INVALID_DISCONNECT_MODE");
            }
            let session = if mode == "revoke" {
                Some(
                    state
                        .session
                        .lock()
                        .await
                        .clone()
                        .ok_or_else(|| anyhow::anyhow!("LOGIN_REQUIRED"))?,
                )
            } else {
                None
            };
            connection::disconnect(session.as_ref(), &store, &profile, mode == "revoke").await
        },
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
    if !matches!(kind.as_str(), "business" | "repair") {
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
            logout,
            cancel_server_switch,
            finish_server_switch,
            get_settings,
            set_language,
            pending_revocations,
            retry_pending_revocations,
            profiles,
            recover_switches,
            detect_clients,
            connect_agent,
            switch_agent,
            diagnose,
            repair_agent,
            disconnect_agent,
            connection_prompts,
            copy_prompt
        ])
        .run(tauri::generate_context!())
        .expect("Failed to start TradeFlow Connect");
}
