use anyhow::{Context, Result, bail};
use serde::{Deserialize, Serialize};
use tradeflow_connect::api;

// This identity must not depend on the installed version or executable path.
const SERVICE: &str = "com.tradeflow.connect";
const ACCOUNT: &str = "desktop-login-v1";

#[derive(Clone, Serialize, Deserialize)]
pub struct SavedSession {
    pub base_url: String,
    pub refresh_token: String,
    pub expires_at: String,
}
impl SavedSession {
    fn validate(&self) -> Result<()> {
        if api::normalize_url(&self.base_url)? != self.base_url
            || !api::valid_refresh_token(&self.refresh_token)
        {
            bail!("INVALID_SAVED_SESSION");
        }
        Ok(())
    }
}
fn entry() -> Result<keyring::Entry> {
    keyring::Entry::new(SERVICE, ACCOUNT)
        .map_err(|_| anyhow::anyhow!("SESSION_STORAGE_UNAVAILABLE"))
}
pub async fn load() -> Result<Option<SavedSession>> {
    tokio::task::spawn_blocking(|| {
        let text = match entry()?.get_password() {
            Ok(value) => value,
            Err(keyring::Error::NoEntry) => return Ok(None),
            Err(_) => bail!("SESSION_STORAGE_UNAVAILABLE"),
        };
        let value: SavedSession = serde_json::from_str(&text).context("INVALID_SAVED_SESSION")?;
        value.validate()?;
        Ok(Some(value))
    })
    .await
    .context("SESSION_STORAGE_UNAVAILABLE")?
}
pub async fn save(value: SavedSession) -> Result<()> {
    tokio::task::spawn_blocking(move || {
        value.validate()?;
        entry()?
            .set_password(&serde_json::to_string(&value)?)
            .map_err(|_| anyhow::anyhow!("SESSION_STORAGE_UNAVAILABLE"))
    })
    .await
    .context("SESSION_STORAGE_UNAVAILABLE")?
}
pub async fn clear() -> Result<()> {
    tokio::task::spawn_blocking(|| match entry()?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(_) => bail!("SESSION_STORAGE_UNAVAILABLE"),
    })
    .await
    .context("SESSION_STORAGE_UNAVAILABLE")?
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn saved_login_is_version_independent_and_rejects_untrusted_values() {
        let mut value = SavedSession {
            base_url: "https://tradeflow.example.com".into(),
            refresh_token: format!("tfds_{}", "a".repeat(96)),
            expires_at: "2030-01-01T00:00:00Z".into(),
        };
        assert!(value.validate().is_ok());
        let json = serde_json::to_string(&value).unwrap();
        assert!(!json.contains("password"));
        assert!(!json.contains("jwt"));
        value.base_url = "http://untrusted.example.com".into();
        assert!(value.validate().is_err());
        value.base_url = "https://tradeflow.example.com".into();
        value.refresh_token = "tfmcp_not_a_login".into();
        assert!(value.validate().is_err());
    }
}
