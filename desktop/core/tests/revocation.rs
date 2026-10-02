use serde_json::json;
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::TcpListener,
};
use tradeflow_connect::api::Session;

async fn start_response(status: u16, body: &'static str) -> Session {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    tokio::spawn(async move {
        let (mut stream, _) = listener.accept().await.unwrap();
        let mut request = [0_u8; 4096];
        let _ = stream.read(&mut request).await.unwrap();
        let reason = if status == 404 { "Not Found" } else { "OK" };
        let response = format!(
            "HTTP/1.1 {status} {reason}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
            body.len()
        );
        stream.write_all(response.as_bytes()).await.unwrap();
    });
    Session {
        base_url: format!("http://{address}"),
        jwt: "fixture-jwt".into(),
        user: json!({"username":"fixture-user"}),
    }
}

#[tokio::test]
async fn explicit_connection_not_found_is_idempotent() {
    let session = start_response(404, r#"{"code":"CONNECTION_NOT_FOUND"}"#).await;
    let id = uuid::Uuid::new_v4().to_string();
    assert!(session.revoke(&id).await.is_ok());
}

#[tokio::test]
async fn generic_not_found_remains_an_error() {
    let session = start_response(404, r#"{"error":"not found"}"#).await;
    let id = uuid::Uuid::new_v4().to_string();
    let error = session.revoke(&id).await.unwrap_err();
    assert_eq!(error.to_string(), "HTTP_404");
}
