use serde_json::{Value, json};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::TcpListener,
};
use tradeflow_connect::api;

async fn fixture(responses: Vec<(u16, Value)>) -> (String, tokio::task::JoinHandle<Vec<Value>>) {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let url = format!("http://{}", listener.local_addr().unwrap());
    let task = tokio::spawn(async move {
        let mut requests = Vec::new();
        for (status, body) in responses {
            let (mut socket, _) = listener.accept().await.unwrap();
            let mut bytes = Vec::new();
            let body_offset = loop {
                let mut chunk = [0; 1024];
                let count = socket.read(&mut chunk).await.unwrap();
                assert!(count > 0);
                bytes.extend_from_slice(&chunk[..count]);
                if let Some(end) = bytes.windows(4).position(|value| value == b"\r\n\r\n") {
                    break end + 4;
                }
            };
            let headers = String::from_utf8(bytes[..body_offset].to_vec()).unwrap();
            let length: usize = headers
                .lines()
                .find_map(|line| {
                    line.to_ascii_lowercase()
                        .strip_prefix("content-length:")
                        .map(|value| value.trim().parse().unwrap())
                })
                .unwrap();
            while bytes.len() < body_offset + length {
                let mut chunk = [0; 1024];
                let count = socket.read(&mut chunk).await.unwrap();
                assert!(count > 0);
                bytes.extend_from_slice(&chunk[..count]);
            }
            requests.push(json!({"line": headers.lines().next(), "body": serde_json::from_slice::<Value>(&bytes[body_offset..body_offset + length]).unwrap()}));
            let text = if status == 204 {
                String::new()
            } else {
                body.to_string()
            };
            socket.write_all(format!("HTTP/1.1 {status} OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{text}", text.len()).as_bytes()).await.unwrap();
        }
        requests
    });
    (url, task)
}

#[tokio::test]
async fn app_login_refresh_and_logout_use_separate_endpoints_and_no_mcp_token() {
    let refresh = format!("tfds_{}", "a".repeat(96));
    let (url, server) = fixture(vec![
        (200, json!({"token":"short-lived-jwt", "user":{"username":"reader", "role":"reader"}, "refreshToken":refresh, "refreshExpiresAt":"2030-01-01T00:00:00Z"})),
        (200, json!({"token":"renewed-jwt", "user":{"username":"reader", "role":"editor"}})),
        (204, Value::Null),
    ]).await;
    let saved = api::remember_login(&url, "reader", "not-persisted-password")
        .await
        .unwrap();
    assert_eq!(saved.session.jwt, "short-lived-jwt");
    let session = api::refresh_login(&url, &saved.refresh_token)
        .await
        .unwrap();
    assert_eq!(session.jwt, "renewed-jwt");
    assert_eq!(session.user["role"], "editor");
    api::revoke_login(&url, &saved.refresh_token).await.unwrap();
    let requests = server.await.unwrap();
    assert_eq!(requests[0]["line"], "POST /api/auth/desktop/login HTTP/1.1");
    assert_eq!(
        requests[1]["line"],
        "POST /api/auth/desktop/refresh HTTP/1.1"
    );
    assert_eq!(
        requests[2]["line"],
        "POST /api/auth/desktop/logout HTTP/1.1"
    );
    assert_eq!(requests[1]["body"], json!({"refreshToken":refresh}));
    assert!(requests[1]["body"].get("password").is_none());
}

#[tokio::test]
async fn invalid_saved_secrets_are_rejected_before_network_use() {
    assert!(
        api::refresh_login("https://example.com", "tfmcp_not_a_login")
            .await
            .is_err()
    );
    assert!(
        api::revoke_login("https://example.com", "invalid")
            .await
            .is_err()
    );
    assert!(!api::valid_refresh_token(&format!(
        "tfds_{}",
        "z".repeat(96)
    )));
    assert!(
        api::refresh_login("http://example.com", &format!("tfds_{}", "a".repeat(96)))
            .await
            .is_err()
    );
}

#[tokio::test]
async fn old_backends_request_an_upgrade_instead_of_persisting_a_short_lived_jwt() {
    let (url, server) = fixture(vec![(404, json!({}))]).await;
    let error = api::remember_login(&url, "reader", "password")
        .await
        .err()
        .unwrap();
    assert_eq!(error.to_string(), "BACKEND_UPGRADE_REQUIRED");
    server.await.unwrap();
}
