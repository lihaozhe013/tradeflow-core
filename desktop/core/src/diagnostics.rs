use crate::{
    connection::safe_code,
    storage::{Client, Store, atomic_write, private_dir, reject_symlink},
};
use anyhow::{Context, Result};
use fs2::FileExt;
use serde::{Deserialize, Serialize};
use std::{
    fs,
    future::Future,
    io::Write,
    sync::{Arc, Mutex},
    time::Instant,
};
use uuid::Uuid;

const MAX_LOG_BYTES: u64 = 5 * 1024 * 1024;
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Stage {
    Validate,
    Login,
    Capabilities,
    DetectClient,
    IssueCredential,
    ReadConfig,
    WriteConfig,
    McpHandshake,
    DiscoverTools,
    SampleQuery,
    CommitLocal,
    RollbackLocal,
    RevokeCandidate,
    RemoveLocal,
    Repair,
    Recovery,
    Bridge,
    Complete,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Action {
    Login,
    Connect,
    Doctor,
    Repair,
    Remove,
    Recovery,
    Bridge,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Status {
    Running,
    Succeeded,
    Failed,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Event {
    pub operation_id: String,
    pub timestamp: String,
    pub action: Action,
    pub stage: Stage,
    pub status: Status,
    pub client: Option<Client>,
    pub server: Option<String>,
    pub duration_ms: u64,
    pub error_code: Option<String>,
    pub http_status: Option<u16>,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Report {
    pub operation_id: String,
    pub status: Status,
    pub failed_stage: Option<Stage>,
    pub error_code: Option<String>,
    pub log_available: bool,
    pub events: Vec<Event>,
}
pub type Sink = Arc<dyn Fn(Event) + Send + Sync>;
#[derive(Clone)]
pub struct Operation(Arc<Inner>);
struct Inner {
    store: Store,
    id: String,
    action: Action,
    client: Option<Client>,
    server: Option<String>,
    sink: Option<Sink>,
    started: Instant,
    events: Mutex<Vec<Event>>,
    log_available: Mutex<bool>,
}
tokio::task_local! { static CURRENT: Operation; }

fn origin(value: &str) -> Option<String> {
    let url = reqwest::Url::parse(value).ok()?;
    if !matches!(url.scheme(), "https" | "http") || url.host_str().is_none() {
        return None;
    }
    Some(url.origin().ascii_serialization())
}
impl Operation {
    pub fn new(
        store: &Store,
        action: Action,
        client: Option<Client>,
        server: Option<&str>,
        sink: Option<Sink>,
    ) -> Self {
        Self(Arc::new(Inner {
            store: store.clone(),
            id: Uuid::new_v4().to_string(),
            action,
            client,
            server: server.and_then(origin),
            sink,
            started: Instant::now(),
            events: Mutex::new(vec![]),
            log_available: Mutex::new(true),
        }))
    }
    fn event(&self, stage: Stage, status: Status, elapsed: u64, error: Option<&anyhow::Error>) {
        let error_code = error.map(safe_code);
        let event = Event {
            operation_id: self.0.id.clone(),
            timestamp: chrono::Utc::now().to_rfc3339(),
            action: self.0.action.clone(),
            stage,
            status,
            client: self.0.client.clone(),
            server: self.0.server.clone(),
            duration_ms: elapsed,
            http_status: error_code
                .as_ref()
                .and_then(|code| code.strip_prefix("HTTP_")?.parse().ok()),
            error_code,
        };
        self.0.events.lock().unwrap().push(event.clone());
        if append(&self.0.store, &event).is_err() {
            *self.0.log_available.lock().unwrap() = false;
        }
        if let Some(sink) = &self.0.sink {
            sink(event);
        }
    }
    pub fn fork(&self) -> Self {
        Self::new(
            &self.0.store,
            self.0.action.clone(),
            self.0.client.clone(),
            self.0.server.as_deref(),
            self.0.sink.clone(),
        )
    }
    pub async fn run<T>(&self, future: impl Future<Output = Result<T>>) -> (Result<T>, Report) {
        let result = CURRENT.scope(self.clone(), future).await;
        let mut events = self.0.events.lock().unwrap().clone();
        if result.is_err()
            && !events
                .iter()
                .any(|event| matches!(event.status, Status::Failed))
        {
            self.event(Stage::Validate, Status::Failed, 0, result.as_ref().err());
        }
        self.event(
            Stage::Complete,
            if result.is_ok() {
                Status::Succeeded
            } else {
                Status::Failed
            },
            self.0.started.elapsed().as_millis() as u64,
            result.as_ref().err(),
        );
        events = self.0.events.lock().unwrap().clone();
        let failure_code = result.as_ref().err().map(safe_code);
        let failed_stage = if result.is_err() {
            events
                .iter()
                .rev()
                .find(|e| {
                    !matches!(e.stage, Stage::Complete)
                        && matches!(e.status, Status::Failed)
                        && e.error_code == failure_code
                })
                .or_else(|| {
                    events.iter().rev().find(|e| {
                        !matches!(e.stage, Stage::Complete) && matches!(e.status, Status::Failed)
                    })
                })
                .map(|e| e.stage.clone())
        } else {
            None
        };
        let report = Report {
            operation_id: self.0.id.clone(),
            status: if result.is_ok() {
                Status::Succeeded
            } else {
                Status::Failed
            },
            failed_stage,
            error_code: result.as_ref().err().map(safe_code),
            log_available: *self.0.log_available.lock().unwrap(),
            events,
        };
        (result, report)
    }
}
pub async fn step<T>(stage: Stage, future: impl Future<Output = Result<T>>) -> Result<T> {
    let operation = CURRENT.try_with(Clone::clone).ok();
    let started = Instant::now();
    if let Some(op) = &operation {
        op.event(stage.clone(), Status::Running, 0, None);
    }
    let result = future.await;
    if let Some(op) = operation {
        op.event(
            stage,
            if result.is_ok() {
                Status::Succeeded
            } else {
                Status::Failed
            },
            started.elapsed().as_millis() as u64,
            result.as_ref().err(),
        );
    }
    result
}
pub fn sync_step<T>(stage: Stage, work: impl FnOnce() -> Result<T>) -> Result<T> {
    let operation = CURRENT.try_with(Clone::clone).ok();
    let started = Instant::now();
    if let Some(op) = &operation {
        op.event(stage.clone(), Status::Running, 0, None);
    }
    let result = work();
    if let Some(op) = operation {
        op.event(
            stage,
            if result.is_ok() {
                Status::Succeeded
            } else {
                Status::Failed
            },
            started.elapsed().as_millis() as u64,
            result.as_ref().err(),
        );
    }
    result
}
fn append(store: &Store, event: &Event) -> Result<()> {
    let directory = store.root.join("logs");
    private_dir(&directory)?;
    let lock_path = directory.join("log.lock");
    reject_symlink(&lock_path)?;
    let lock = fs::OpenOptions::new()
        .create(true)
        .truncate(false)
        .read(true)
        .write(true)
        .open(lock_path)?;
    lock.lock_exclusive()?;
    let path = directory.join("operations.jsonl");
    let mut bytes = serde_json::to_vec(event)?;
    bytes.push(b'\n');
    reject_symlink(&path)?;
    if fs::metadata(&path).map(|m| m.len()).unwrap_or(0) + bytes.len() as u64 > MAX_LOG_BYTES {
        let older = directory.join("operations.2.jsonl");
        let previous = directory.join("operations.1.jsonl");
        reject_symlink(&older)?;
        reject_symlink(&previous)?;
        if older.exists() {
            fs::remove_file(&older)?;
        }
        if previous.exists() {
            fs::rename(&previous, &older)?;
        }
        if path.exists() {
            fs::rename(&path, &previous)?;
        }
    }
    if !path.exists() {
        atomic_write(&path, b"")?;
    }
    let mut file = fs::OpenOptions::new().append(true).open(path)?;
    file.write_all(&bytes)?;
    Ok(())
}
pub fn recent(store: &Store) -> Result<Vec<Event>> {
    let mut events = vec![];
    for name in [
        "operations.2.jsonl",
        "operations.1.jsonl",
        "operations.jsonl",
    ] {
        let path = store.root.join("logs").join(name);
        reject_symlink(&path)?;
        match fs::read_to_string(path) {
            Ok(text) => {
                for line in text.lines() {
                    if let Ok(mut event) = serde_json::from_str::<Event>(line) {
                        if Uuid::parse_str(&event.operation_id).is_err()
                            || chrono::DateTime::parse_from_rfc3339(&event.timestamp).is_err()
                        {
                            continue;
                        }
                        event.server = event.server.as_deref().and_then(origin);
                        event.error_code = event
                            .error_code
                            .map(|code| safe_code(&anyhow::anyhow!(code)));
                        events.push(event);
                    }
                }
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => (),
            Err(_) => anyhow::bail!("LOG_READ_FAILED"),
        }
    }
    if events.len() > 2000 {
        events.drain(..events.len() - 2000);
    }
    Ok(events)
}
pub fn export(store: &Store, path: &std::path::Path) -> Result<()> {
    let value = serde_json::json!({"version":1,"events":recent(store)?});
    atomic_write(
        path,
        &serde_json::to_vec_pretty(&value).context("LOG_EXPORT_FAILED")?,
    )
    .context("LOG_EXPORT_FAILED")
}

pub fn current() -> Option<Operation> {
    CURRENT.try_with(Clone::clone).ok()
}
