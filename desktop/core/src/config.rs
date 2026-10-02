use crate::storage::{Client, Profile, Store, atomic_write, private_dir, reject_symlink};
use anyhow::{Context, Result, bail};
use fs2::FileExt;
use jsonc_parser::{
    ParseOptions,
    cst::{CstInputValue, CstRootNode},
    parse_to_serde_value,
};
use serde_json::{Value, json};
use std::{
    fs,
    path::{Path, PathBuf},
};

pub fn config_path(client: &Client) -> Result<PathBuf> {
    let home = dirs::home_dir().context("HOME_UNAVAILABLE")?;
    match client {
        Client::Opencode => {
            let base = std::env::var_os("XDG_CONFIG_HOME")
                .map(PathBuf::from)
                .unwrap_or_else(|| home.join(".config"));
            let dir = base.join("opencode");
            let jsonc = dir.join("opencode.jsonc");
            let json = dir.join("opencode.json");
            Ok(if jsonc.exists() || !json.exists() {
                jsonc
            } else {
                json
            })
        }
        Client::Workbuddy => Ok(home.join(".workbuddy/mcp.json")),
    }
}
pub fn entry(profile: &Profile) -> Value {
    if profile.mode == "bridge" {
        let command = profile.helper_path.to_string_lossy();
        match profile.client {
            Client::Opencode => {
                json!({"type":"local","command":[command,"serve","--profile",profile.id]})
            }
            Client::Workbuddy => {
                json!({"type":"stdio","command":command,"args":["serve","--profile",profile.id]})
            }
        }
    } else {
        let headers = json!({"Authorization":format!("Bearer {}",profile.token)});
        match profile.client {
            Client::Opencode => {
                json!({"type":"remote","url":format!("{}/mcp",profile.base_url),"oauth":false,"headers":headers})
            }
            Client::Workbuddy => {
                json!({"type":"streamableHttp","url":format!("{}/mcp",profile.base_url),"headers":headers})
            }
        }
    }
}
fn input(value: &Value) -> CstInputValue {
    match value {
        Value::Null => CstInputValue::Null,
        Value::Bool(v) => CstInputValue::Bool(*v),
        Value::Number(v) => CstInputValue::Number(v.to_string()),
        Value::String(v) => CstInputValue::String(v.clone()),
        Value::Array(v) => CstInputValue::Array(v.iter().map(input).collect()),
        Value::Object(v) => {
            CstInputValue::Object(v.iter().map(|(k, v)| (k.clone(), input(v))).collect())
        }
    }
}
pub fn parse(text: &str) -> Result<Value> {
    parse_to_serde_value::<Value>(text, &ParseOptions::default())
        .map_err(|_| anyhow::anyhow!("INVALID_CONFIG_JSON"))
}
pub fn patch(
    text: &str,
    client: &Client,
    name: &str,
    replacement: Option<&Value>,
) -> Result<String> {
    let parsed = parse(text)?;
    if !parsed.is_object() {
        bail!("CONFIG_ROOT_MUST_BE_OBJECT");
    }
    let root = CstRootNode::parse(text, &ParseOptions::default())
        .map_err(|_| anyhow::anyhow!("INVALID_CONFIG_JSON"))?;
    let obj = root.object_value().context("CONFIG_ROOT_MUST_BE_OBJECT")?;
    let servers = match client {
        Client::Opencode => obj
            .object_value_or_create("mcp")
            .context("INVALID_MCP_OBJECT")?
            .object_value_or_create("servers")
            .context("INVALID_SERVERS_OBJECT")?,
        Client::Workbuddy => obj
            .object_value_or_create("mcpServers")
            .context("INVALID_SERVERS_OBJECT")?,
    };
    if let Some(value) = replacement {
        if let Some(prop) = servers.get(name) {
            prop.set_value(input(value));
        } else {
            servers.append(name, input(value));
        }
    } else if let Some(prop) = servers.get(name) {
        prop.remove();
    }
    Ok(root.to_string())
}
fn read(path: &Path) -> Result<Option<String>> {
    reject_symlink(path)?;
    match fs::read_to_string(path) {
        Ok(text) => Ok(Some(text)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(_) => bail!("CONFIG_READ_FAILED"),
    }
}
pub fn configured(profile: &Profile) -> Result<bool> {
    let Some(text) = read(&profile.config_path)? else {
        return Ok(false);
    };
    let value = parse(&text)?;
    let actual = match profile.client {
        Client::Opencode => &value["mcp"]["servers"][profile.server_name()],
        Client::Workbuddy => &value["mcpServers"][profile.server_name()],
    };
    Ok(actual == &entry(profile))
}
pub struct Change {
    before: Option<String>,
    after: String,
    path: PathBuf,
}
impl Change {
    pub fn rollback(&self) -> Result<()> {
        if read(&self.path)?.as_deref() != Some(&self.after) {
            bail!("ROLLBACK_CONCURRENT_CHANGE");
        }
        if let Some(before) = &self.before {
            atomic_write(&self.path, before.as_bytes())
        } else {
            fs::remove_file(&self.path).context("ROLLBACK_FAILED")
        }
    }
}
pub fn install(store: &Store, profile: &Profile, remove: bool) -> Result<Change> {
    let lock_path = store.root.join(format!("{}.lock", profile.client.name()));
    let lock = fs::OpenOptions::new()
        .create(true)
        .truncate(false)
        .read(true)
        .write(true)
        .open(lock_path)?;
    lock.try_lock_exclusive().context("CONFIG_BUSY")?;
    let before = read(&profile.config_path)?;
    let text = before.as_deref().unwrap_or("{}\n");
    let replacement = entry(profile);
    let after = patch(
        text,
        &profile.client,
        &profile.server_name(),
        if remove { None } else { Some(&replacement) },
    )?;
    let backup_dir = store.root.join("backups");
    private_dir(&backup_dir)?;
    if let Some(before) = &before {
        atomic_write(
            &backup_dir.join(format!("{}-{}.jsonc", profile.id, uuid::Uuid::new_v4())),
            before.as_bytes(),
        )?;
    }
    if read(&profile.config_path)? != before {
        bail!("CONFIG_CONCURRENT_CHANGE");
    }
    atomic_write(&profile.config_path, after.as_bytes())?;
    Ok(Change {
        before,
        after,
        path: profile.config_path.clone(),
    })
}
pub fn overrides(profile: &Profile, cwd: &Path) -> Vec<String> {
    let mut found = vec![];
    for parent in cwd.ancestors() {
        let paths = match profile.client {
            Client::Opencode => vec![
                parent.join("opencode.json"),
                parent.join("opencode.jsonc"),
                parent.join(".opencode/opencode.json"),
                parent.join(".opencode/opencode.jsonc"),
            ],
            Client::Workbuddy => vec![parent.join(".workbuddy/mcp.json")],
        };
        for path in paths {
            if let Ok(Some(text)) = read(&path)
                && let Ok(value) = parse(&text)
            {
                let candidate = match profile.client {
                    Client::Opencode => &value["mcp"]["servers"][profile.server_name()],
                    Client::Workbuddy => &value["mcpServers"][profile.server_name()],
                };
                if !candidate.is_null() {
                    found.push(path.display().to_string());
                }
            }
        }
    }
    if profile.client == Client::Opencode
        && (std::env::var_os("OPENCODE_CONFIG").is_some()
            || std::env::var_os("OPENCODE_CONFIG_CONTENT").is_some())
    {
        found.push("OPENCODE_CONFIG_OVERRIDE".into());
    }
    found
}
