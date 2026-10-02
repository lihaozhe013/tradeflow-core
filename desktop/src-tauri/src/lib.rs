use serde_json::{Value, json};
use std::path::PathBuf;
use tauri::{Manager, State};
use tokio::sync::Mutex;
use tradeflow_connect::{
    api::{self, Session},
    connection, prompts,
    storage::{Client, Store},
};

#[derive(Default)]
struct AppState {
    session: Mutex<Option<Session>>,
    operation: Mutex<()>,
}

fn target(value: &str) -> Result<Client, String> {
    match value {
        "opencode" => Ok(Client::Opencode),
        "workbuddy" => Ok(Client::Workbuddy),
        _ => Err("INVALID_CLIENT".into()),
    }
}
#[tauri::command]
async fn login(
    state: State<'_, AppState>,
    server: String,
    username: String,
    password: String,
) -> Result<Value, String> {
    let session = api::login(&server, &username, &password)
        .await
        .map_err(|e| connection::safe_code(&e))?;
    let capabilities = session
        .capabilities()
        .await
        .map_err(|e| connection::safe_code(&e))?;
    let result = json!({"user":session.user,"capabilities":capabilities});
    *state.session.lock().await = Some(session);
    Ok(result)
}
#[tauri::command]
async fn logout(state: State<'_, AppState>) -> Result<(), String> {
    *state.session.lock().await = None;
    Ok(())
}
#[tauri::command]
fn profiles() -> Result<Value, String> {
    let store = Store::system().map_err(|e| connection::safe_code(&e))?;
    let profiles = store.profiles().map_err(|e| connection::safe_code(&e))?;
    Ok(json!(
        profiles.iter().map(|p| p.summary()).collect::<Vec<_>>()
    ))
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
) -> Result<Value, String> {
    let _operation = state.operation.try_lock().map_err(|_| "OPERATION_BUSY")?;
    let session = state.session.lock().await.clone().ok_or("LOGIN_REQUIRED")?;
    let store = Store::system().map_err(|e| connection::safe_code(&e))?;
    connection::install(
        &session,
        &store,
        target(&client)?,
        helper(&app)?,
        existing,
        &mode,
    )
    .await
    .map_err(|e| connection::safe_code(&e))
}
#[tauri::command]
async fn diagnose(profile: String, client: String) -> Result<Value, String> {
    let store = Store::system().map_err(|e| connection::safe_code(&e))?;
    connection::doctor(
        &store,
        &profile,
        target(&client)?,
        &std::env::current_dir().map_err(|_| "WORKING_DIRECTORY_UNAVAILABLE")?,
    )
    .await
    .map_err(|e| connection::safe_code(&e))
}
#[tauri::command]
async fn repair_agent(
    state: State<'_, AppState>,
    profile: String,
    client: String,
    mode: String,
) -> Result<Value, String> {
    let _operation = state.operation.try_lock().map_err(|_| "OPERATION_BUSY")?;
    let store = Store::system().map_err(|e| connection::safe_code(&e))?;
    connection::repair(
        &store,
        &profile,
        target(&client)?,
        &mode,
        &std::env::current_dir().map_err(|_| "WORKING_DIRECTORY_UNAVAILABLE")?,
    )
    .await
    .map_err(|e| connection::safe_code(&e))
}
#[tauri::command]
async fn disconnect_agent(state: State<'_, AppState>, profile: String) -> Result<(), String> {
    let _operation = state.operation.try_lock().map_err(|_| "OPERATION_BUSY")?;
    let session = state.session.lock().await.clone().ok_or("LOGIN_REQUIRED")?;
    let store = Store::system().map_err(|e| connection::safe_code(&e))?;
    connection::disconnect(&session, &store, &profile)
        .await
        .map_err(|e| connection::safe_code(&e))
}
#[tauri::command]
fn connection_prompts(profile: String) -> Result<Value, String> {
    let store = Store::system().map_err(|e| connection::safe_code(&e))?;
    Ok(prompts::generate(
        &store
            .load(&profile)
            .map_err(|e| connection::safe_code(&e))?,
    ))
}
#[tauri::command]
fn copy_prompt(app: tauri::AppHandle, profile: String, kind: String) -> Result<(), String> {
    use tauri_plugin_clipboard_manager::ClipboardExt;
    if !matches!(kind.as_str(), "business" | "repair") {
        return Err("INVALID_PROMPT_KIND".into());
    }
    let values = connection_prompts(profile)?;
    let text = values[&kind].as_str().ok_or("INVALID_PROMPT_KIND")?;
    app.clipboard()
        .write_text(text)
        .map_err(|_| "CLIPBOARD_WRITE_FAILED".into())
}
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            login,
            logout,
            profiles,
            detect_clients,
            connect_agent,
            diagnose,
            repair_agent,
            disconnect_agent,
            connection_prompts,
            copy_prompt
        ])
        .run(tauri::generate_context!())
        .expect("Failed to start TradeFlow Connect");
}
