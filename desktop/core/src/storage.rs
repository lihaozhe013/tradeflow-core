use anyhow::{Context, Result, bail};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    fs,
    io::Write,
    path::{Path, PathBuf},
};
use uuid::Uuid;

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Client {
    Opencode,
    Workbuddy,
}
impl Client {
    pub fn name(&self) -> &'static str {
        match self {
            Self::Opencode => "opencode",
            Self::Workbuddy => "workbuddy",
        }
    }
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Profile {
    pub id: String,
    pub connection_id: String,
    pub owner_username: String,
    pub client: Client,
    pub base_url: String,
    pub token: String,
    pub tools: Vec<String>,
    pub expires_at: String,
    pub config_path: PathBuf,
    pub helper_path: PathBuf,
    pub mode: String,
    #[serde(default)]
    pub pending_cleanup: Vec<String>,
}
impl Profile {
    pub fn server_name(&self) -> String {
        format!("tradeflow_{}", self.id.replace('-', ""))
    }
    pub fn summary(&self) -> Value {
        serde_json::json!({"id":self.id,"client":self.client,"ownerUsername":self.owner_username,"serverName":self.server_name(),"baseUrl":self.base_url,"tools":self.tools,"expiresAt":self.expires_at,"configPath":self.config_path,"mode":self.mode,"pendingCleanup":self.pending_cleanup})
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
    pub client: Client,
    pub connection_id: String,
    pub expires_at: Option<String>,
    pub last_error: Option<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Settings {
    pub language: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SwitchJournal {
    pub id: String,
    pub phase: String,
    pub candidate: Profile,
    #[serde(default = "default_candidate_is_new")]
    pub candidate_is_new: bool,
    #[serde(default)]
    pub staged_profile_id: Option<String>,
    pub source_profile_id: Option<String>,
    #[serde(default)]
    pub source_profile_ids: Vec<String>,
    pub retired_credentials: Vec<PendingRevocation>,
    pub config_path: PathBuf,
    pub config_before: Option<String>,
    pub config_after: String,
    #[serde(default)]
    pub config_final: String,
}
fn default_candidate_is_new() -> bool {
    true
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
    pub fn save_switch_journal(&self, journal: &SwitchJournal) -> Result<()> {
        Uuid::parse_str(&journal.id).context("INVALID_OPERATION_ID")?;
        atomic_write(
            &self.operations_dir()?.join(format!("{}.json", journal.id)),
            &serde_json::to_vec(journal)?,
        )
    }
    pub fn switch_journals(&self) -> Result<Vec<SwitchJournal>> {
        let directory = self.operations_dir()?;
        let mut values = Vec::new();
        for entry in fs::read_dir(directory)? {
            let path = entry?.path();
            if path
                .extension()
                .is_some_and(|extension| extension == "json")
            {
                reject_symlink(&path)?;
                values.push(serde_json::from_slice(&fs::read(path)?)?);
            }
        }
        Ok(values)
    }
    pub fn remove_switch_journal(&self, id: &str) -> Result<()> {
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
