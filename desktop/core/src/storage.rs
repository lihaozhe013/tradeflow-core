use anyhow::{Context, Result, bail};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    fs,
    io::Write,
    path::{Path, PathBuf},
};
use uuid::Uuid;

pub const MAX_CONNECTION_NAME_CHARS: usize = 64;

/// A connection name is a user-facing label stored with the credential. It is deliberately free
/// form so any host can connect without a client release, but it must stay printable and bounded
/// because it is also written to the remote credential record.
pub fn validate_connection_name(value: &str) -> Result<String> {
    let name = value.trim();
    let length = name.chars().count();
    if length == 0 || length > MAX_CONNECTION_NAME_CHARS || name.chars().any(char::is_control) {
        bail!("INVALID_CONNECTION_NAME");
    }
    Ok(name.to_owned())
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Profile {
    pub id: String,
    pub connection_id: String,
    pub owner_username: String,
    /// Connection name chosen by the user. Older profiles store the Agent id here.
    pub client: String,
    pub base_url: String,
    pub token: String,
    pub tools: Vec<String>,
    pub expires_at: String,
    pub helper_path: PathBuf,
    pub mode: String,
    #[serde(default)]
    pub pending_cleanup: Vec<String>,
    #[serde(default)]
    pub catalog_version: Option<String>,
    #[serde(default)]
    pub guide_version: Option<String>,
    #[serde(default)]
    pub last_sync_at: Option<String>,
}
impl Profile {
    pub fn server_name(&self) -> String {
        format!("tradeflow_{}", self.id.replace('-', ""))
    }
    pub fn launch_args(&self) -> Vec<String> {
        vec!["serve".to_owned(), "--profile".to_owned(), self.id.clone()]
    }
    pub fn summary(&self) -> Value {
        serde_json::json!({
            "id": self.id,
            "connectionId": self.connection_id,
            "client": self.client,
            "ownerUsername": self.owner_username,
            "serverName": self.server_name(),
            "baseUrl": self.base_url,
            "tools": self.tools,
            "expiresAt": self.expires_at,
            "mode": self.mode,
            "pendingCleanup": self.pending_cleanup,
            "catalogVersion": self.catalog_version,
            "guideVersion": self.guide_version,
            "lastSyncAt": self.last_sync_at,
        })
    }
}
#[derive(Clone)]
pub struct Store {
    pub root: PathBuf,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PendingRevocation {
    pub base_url: String,
    pub owner_username: String,
    pub client: String,
    pub connection_id: String,
    pub expires_at: Option<String>,
    pub last_error: Option<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Settings {
    pub language: String,
}
/// Read-only view of the switch journals written by earlier releases. This release no longer edits
/// host configuration, so recovery only finishes local profile cleanup and credential revocation.
#[derive(Clone, Debug, Deserialize)]
pub struct LegacySwitchJournal {
    pub id: String,
    pub phase: String,
    pub candidate: Profile,
    #[serde(default)]
    pub candidate_is_new: bool,
    #[serde(default)]
    pub staged_profile_id: Option<String>,
    #[serde(default)]
    pub source_profile_id: Option<String>,
    #[serde(default)]
    pub source_profile_ids: Vec<String>,
    #[serde(default)]
    pub retired_credentials: Vec<PendingRevocation>,
}
impl Store {
    pub fn system() -> Result<Self> {
        let root = std::env::var_os("TRADEFLOW_CONNECT_DATA_DIR")
            .map(PathBuf::from)
            .unwrap_or(
                dirs::data_local_dir()
                    .context("LOCAL_DATA_UNAVAILABLE")?
                    .join("com.tradeflow.connect"),
            );
        Self::at(root)
    }
    pub fn at(root: PathBuf) -> Result<Self> {
        private_dir(&root)?;
        Ok(Self { root })
    }
    fn path(&self, id: &str) -> Result<PathBuf> {
        Uuid::parse_str(id).context("INVALID_PROFILE_ID")?;
        Ok(self.root.join(format!("{id}.json")))
    }
    pub fn save(&self, profile: &Profile) -> Result<()> {
        atomic_write(&self.path(&profile.id)?, &serde_json::to_vec(profile)?)
    }
    pub fn load(&self, id: &str) -> Result<Profile> {
        let path = self.path(id)?;
        reject_symlink(&path)?;
        serde_json::from_slice(&fs::read(path).context("PROFILE_NOT_FOUND")?)
            .context("INVALID_PROFILE")
    }
    pub fn remove(&self, id: &str) -> Result<()> {
        let path = self.path(id)?;
        reject_symlink(&path)?;
        fs::remove_file(path).context("PROFILE_REMOVE_FAILED")
    }
    pub fn pending_revocations(&self) -> Result<Vec<PendingRevocation>> {
        let path = self.root.join("pending-revocations.json");
        reject_symlink(&path)?;
        match fs::read(path) {
            Ok(bytes) => serde_json::from_slice(&bytes).context("INVALID_PENDING_REVOCATIONS"),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(Vec::new()),
            Err(error) => Err(error.into()),
        }
    }
    pub fn save_pending_revocations(&self, values: &[PendingRevocation]) -> Result<()> {
        atomic_write(
            &self.root.join("pending-revocations.json"),
            &serde_json::to_vec(values)?,
        )
    }
    pub fn queue_revocation(&self, value: PendingRevocation) -> Result<()> {
        let mut values = self.pending_revocations()?;
        if let Some(existing) = values.iter_mut().find(|entry| {
            entry.base_url == value.base_url && entry.connection_id == value.connection_id
        }) {
            existing.last_error = value.last_error;
        } else {
            values.push(value);
        }
        self.save_pending_revocations(&values)
    }
    pub fn settings(&self) -> Result<Settings> {
        let path = self.root.join("settings.json");
        reject_symlink(&path)?;
        match fs::read(path) {
            Ok(bytes) => {
                let settings: Settings =
                    serde_json::from_slice(&bytes).context("INVALID_SETTINGS")?;
                if !matches!(settings.language.as_str(), "system" | "zh" | "en") {
                    anyhow::bail!("INVALID_LANGUAGE");
                }
                Ok(settings)
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(Settings {
                language: "system".into(),
            }),
            Err(error) => Err(error.into()),
        }
    }
    pub fn save_settings(&self, settings: &Settings) -> Result<()> {
        if !matches!(settings.language.as_str(), "system" | "zh" | "en") {
            anyhow::bail!("INVALID_LANGUAGE");
        }
        atomic_write(
            &self.root.join("settings.json"),
            &serde_json::to_vec(settings)?,
        )
    }
    fn operations_dir(&self) -> Result<PathBuf> {
        let path = self.root.join("operations");
        private_dir(&path)?;
        Ok(path)
    }
    pub fn legacy_journals(&self) -> Result<Vec<LegacySwitchJournal>> {
        let directory = self.operations_dir()?;
        let mut values = Vec::new();
        for entry in fs::read_dir(directory)? {
            let path = entry?.path();
            if path
                .extension()
                .is_some_and(|extension| extension == "json")
            {
                reject_symlink(&path)?;
                match serde_json::from_slice(&fs::read(&path)?) {
                    Ok(journal) => values.push(journal),
                    Err(_) => {
                        // An unreadable journal cannot be replayed safely; keep it for inspection.
                        private_dir(&self.root.join("unreadable-operations"))?;
                        let name = path
                            .file_name()
                            .context("INVALID_STORAGE_PATH")?
                            .to_os_string();
                        let target = self.root.join("unreadable-operations").join(name);
                        let _ = fs::rename(&path, target);
                    }
                }
            }
        }
        Ok(values)
    }
    pub fn remove_legacy_journal(&self, id: &str) -> Result<()> {
        Uuid::parse_str(id).context("INVALID_OPERATION_ID")?;
        let path = self.operations_dir()?.join(format!("{id}.json"));
        reject_symlink(&path)?;
        match fs::remove_file(path) {
            Ok(()) => Ok(()),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(error) => Err(error.into()),
        }
    }
    pub fn profiles(&self) -> Result<Vec<Profile>> {
        let mut profiles = vec![];
        for entry in fs::read_dir(&self.root)? {
            let path = entry?.path();
            if path.extension().is_some_and(|ext| ext == "json")
                && path
                    .file_stem()
                    .and_then(|v| v.to_str())
                    .is_some_and(|v| Uuid::parse_str(v).is_ok())
            {
                profiles.push(self.load(path.file_stem().unwrap().to_str().unwrap())?);
            }
        }
        Ok(profiles)
    }
    pub fn device_id(&self) -> Result<String> {
        let path = self.root.join("device-id");
        reject_symlink(&path)?;
        if path.exists() {
            let id = fs::read_to_string(path)?;
            Uuid::parse_str(&id).context("INVALID_DEVICE_ID")?;
            return Ok(id);
        }
        let id = Uuid::new_v4().to_string();
        atomic_write(&path, id.as_bytes())?;
        Ok(id)
    }
}
pub fn reject_symlink(path: &Path) -> Result<()> {
    for component in path.ancestors() {
        if fs::symlink_metadata(component).is_ok_and(|m| m.file_type().is_symlink()) {
            bail!("SYMLINK_PATH_REJECTED");
        }
    }
    Ok(())
}
pub fn private_dir(path: &Path) -> Result<()> {
    reject_symlink(path)?;
    fs::create_dir_all(path)?;
    restrict(path, true)
}
fn restrict(path: &Path, directory: bool) -> Result<()> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(
            path,
            fs::Permissions::from_mode(if directory { 0o700 } else { 0o600 }),
        )?;
    }
    #[cfg(windows)]
    crate::windows_acl::restrict(path, directory)?;

    Ok(())
}
pub fn atomic_write(path: &Path, bytes: &[u8]) -> Result<()> {
    reject_symlink(path)?;
    fs::create_dir_all(path.parent().context("INVALID_STORAGE_PATH")?)?;
    let temp = path.with_extension(format!("{}.tmp", Uuid::new_v4()));
    let result = (|| {
        let mut options = fs::OpenOptions::new();
        options.write(true).create_new(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        let mut file = options.open(&temp)?;
        restrict(&temp, false)?;
        file.write_all(bytes)?;
        file.sync_all()?;
        drop(file);
        #[cfg(not(windows))]
        fs::rename(&temp, path)?;
        #[cfg(windows)]
        {
            use std::os::windows::ffi::OsStrExt;
            use windows_sys::Win32::Storage::FileSystem::{
                MOVEFILE_REPLACE_EXISTING, MOVEFILE_WRITE_THROUGH, MoveFileExW,
            };
            let from: Vec<u16> = temp.as_os_str().encode_wide().chain(Some(0)).collect();
            let to: Vec<u16> = path.as_os_str().encode_wide().chain(Some(0)).collect();
            if unsafe {
                MoveFileExW(
                    from.as_ptr(),
                    to.as_ptr(),
                    MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH,
                )
            } == 0
            {
                return Err(std::io::Error::last_os_error().into());
            }
        }
        restrict(path, false)?;
        Ok(())
    })();
    if result.is_err() {
        let _ = fs::remove_file(temp);
    }
    result
}
