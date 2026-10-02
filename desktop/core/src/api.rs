use crate::diagnostics::{self, Stage};
use anyhow::{Context, Result, bail};
use reqwest::{Client, Url};
use serde_json::{Value, json};
use std::time::Duration;

#[derive(Clone)]
pub struct Session {
    pub base_url: String,
    pub jwt: String,
    pub user: Value,
}
pub fn normalize_url(input: &str) -> Result<String> {
    let url = Url::parse(input.trim()).context("INVALID_SERVER_URL")?;
    let local = matches!(
        url.host_str(),
        Some("localhost" | "127.0.0.1" | "[::1]" | "::1")
    );
    if (url.scheme() != "https" && !(url.scheme() == "http" && local))
        || !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
        || url.path() != "/"
    {
        bail!("HTTPS_OR_LOOPBACK_ORIGIN_REQUIRED");
    }
    Ok(url.as_str().trim_end_matches('/').to_owned())
}
pub fn http_client() -> Result<Client> {
    Ok(Client::builder()
        .timeout(Duration::from_secs(25))
        .redirect(reqwest::redirect::Policy::none())
        .build()?)
}
async fn decode(response: reqwest::Response) -> Result<Value> {
    let code = response.status().as_u16();
    if !(200..300).contains(&code) {
        let body = response.json::<Value>().await.unwrap_or(Value::Null);
        match body["code"].as_str() {
            Some("AUTH_DISABLED" | "MCP_DISABLED" | "ROLE_NOT_SUPPORTED" | "ACCOUNT_DISABLED") => {
                bail!("{}", body["code"].as_str().unwrap())
            }
            _ => bail!("HTTP_{code}"),
        }
    }
    if code == 204 {
        return Ok(Value::Null);
    }
    response.json().await.context("INVALID_SERVER_RESPONSE")
}
pub fn network_error(error: reqwest::Error) -> anyhow::Error {
    let code = if error.is_timeout() {
        "NETWORK_TIMEOUT"
    } else {
        let mut text = error.to_string().to_ascii_lowercase();
        let mut cause = std::error::Error::source(&error);
        while let Some(value) = cause {
            text.push_str(&value.to_string().to_ascii_lowercase());
            cause = value.source();
        }
        if text.contains("certificate") || text.contains("tls") {
            "TLS_ERROR"
        } else if error.is_connect() {
            "NETWORK_CONNECTION_FAILED"
        } else {
            "NETWORK_ERROR"
        }
    };
    anyhow::anyhow!(code)
}
pub async fn login(base_url: &str, username: &str, password: &str) -> Result<Session> {
    diagnostics::step(Stage::Login, login_inner(base_url, username, password)).await
}
async fn login_inner(base_url: &str, username: &str, password: &str) -> Result<Session> {
    if username.trim().is_empty() || password.is_empty() {
        bail!("LOGIN_FIELDS_REQUIRED");
    }
    let base_url = normalize_url(base_url)?;
    let value = decode(
        http_client()?
            .post(format!("{base_url}/api/auth/login"))
            .json(&json!({"username":username,"password":password}))
            .send()
            .await
            .map_err(network_error)?,
    )
    .await?;
    let jwt = value["token"]
        .as_str()
        .context("LOGIN_TOKEN_MISSING")?
        .to_owned();
    if value["user"]["username"].as_str().is_none()
        || !matches!(
            value["user"]["role"].as_str(),
            Some("reader" | "editor" | "superuser")
        )
    {
        bail!("INVALID_SERVER_RESPONSE");
    }
    Ok(Session {
        base_url,
        jwt,
        user: value["user"].clone(),
    })
}
impl Session {
    pub async fn capabilities(&self) -> Result<Value> {
        diagnostics::step(Stage::Capabilities, self.capabilities_inner()).await
    }
    async fn capabilities_inner(&self) -> Result<Value> {
        let data = self.get("/api/mcp/capabilities").await?;
        if data["data"]["version"] != 1 || data["data"]["endpointPath"] != "/mcp" {
            bail!("BACKEND_UPGRADE_REQUIRED");
        }
        if data["data"]["enabled"].as_bool().is_none()
            || !data["data"]["allowedTools"]
                .as_array()
                .is_some_and(|values| values.iter().all(|value| value.as_str().is_some()))
        {
            bail!("INVALID_SERVER_RESPONSE");
        }
        Ok(data["data"].clone())
    }
    pub async fn get(&self, path: &str) -> Result<Value> {
        decode(
            http_client()?
                .get(format!("{}{path}", self.base_url))
                .bearer_auth(&self.jwt)
                .send()
                .await
                .map_err(network_error)?,
        )
        .await
    }
    pub async fn issue(&self, client: &str, device_id: &str) -> Result<Value> {
        let value = decode(
            http_client()?
                .post(format!("{}/api/mcp/connections", self.base_url))
                .bearer_auth(&self.jwt)
                .json(&json!({"client":client,"deviceId":device_id}))
                .send()
                .await
                .map_err(network_error)?,
        )
        .await?;
        let data = &value["data"];
        if !data["id"]
            .as_str()
            .is_some_and(|id| uuid::Uuid::parse_str(id).is_ok())
            || !data["token"]
                .as_str()
                .is_some_and(|token| token.starts_with("tfmcp_") && token.len() <= 512)
            || !data["expiresAt"]
                .as_str()
                .is_some_and(|date| chrono::DateTime::parse_from_rfc3339(date).is_ok())
            || !data["tools"].as_array().is_some_and(|tools| {
                !tools.is_empty()
                    && tools.iter().all(|tool| {
                        matches!(
                            tool.as_str(),
                            Some(
                                "search_partners"
                                    | "search_products"
                                    | "get_inventory"
                                    | "list_transactions"
                                    | "get_receivables"
                                    | "get_payables"
                                    | "get_analysis"
                            )
                        )
                    })
            })
        {
            bail!("INVALID_SERVER_RESPONSE");
        }
        Ok(data.clone())
    }
    pub async fn revoke(&self, id: &str) -> Result<()> {
        uuid::Uuid::parse_str(id).context("INVALID_CONNECTION_ID")?;
        let response = http_client()?
            .delete(format!("{}/api/mcp/connections/{id}", self.base_url))
            .bearer_auth(&self.jwt)
            .send()
            .await
            .map_err(network_error)?;
        if response.status().is_success() {
            return Ok(());
        }
        let status = response.status().as_u16();
        let body = response.json::<Value>().await.unwrap_or(Value::Null);
        if status == 404 && body["code"] == "CONNECTION_NOT_FOUND" {
            return Ok(());
        }
        bail!("HTTP_{status}")
    }
}
