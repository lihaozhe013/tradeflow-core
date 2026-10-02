use tradeflow_connect::{
    api,
    diagnostics::{self, Action, Operation, Stage},
    storage::{Store, atomic_write},
};
#[tokio::test]
async fn reports_survive_restart_and_export_without_credentials_or_raw_errors() {
    let dir = tempfile::tempdir().unwrap();
    let store = Store::at(dir.path().to_owned()).unwrap();
    let operation = Operation::new(
        &store,
        Action::Login,
        None,
        Some("https://user:secret@example.com/private?token=secret"),
        None,
    );
    let (result, report) = operation
        .run(diagnostics::step(Stage::Login, async {
            Err::<(), _>(anyhow::anyhow!("PRIVATE_PASSWORD"))
        }))
        .await;
    assert!(result.is_err());
    assert_eq!(report.error_code.as_deref(), Some("OPERATION_FAILED"));
    let reopened = Store::at(dir.path().to_owned()).unwrap();
    let path = dir.path().join("report.json");
    diagnostics::export(&reopened, &path).unwrap();
    let text = std::fs::read_to_string(&path).unwrap();
    assert!(text.contains("https://example.com"));
    assert!(!text.contains("secret"));
    assert!(!text.contains("PRIVATE_PASSWORD"));
    assert!(!text.contains("/private"));
    assert_eq!(diagnostics::recent(&reopened).unwrap().len(), 3);
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        assert_eq!(
            std::fs::metadata(path).unwrap().permissions().mode() & 0o777,
            0o600
        );
    }
}
#[tokio::test]
async fn log_rotation_bounds_disk_use_and_preserves_recent_events() {
    let dir = tempfile::tempdir().unwrap();
    let store = Store::at(dir.path().to_owned()).unwrap();
    let operation = Operation::new(&store, Action::Doctor, None, None, None);
    operation.run(async { Ok(()) }).await.0.unwrap();
    let directory = store.root.join("logs");
    for _ in 0..4 {
        atomic_write(
            &directory.join("operations.jsonl"),
            &vec![b' '; 5 * 1024 * 1024],
        )
        .unwrap();
        operation.run(async { Ok(()) }).await.0.unwrap();
    }
    let files: Vec<_> = std::fs::read_dir(&directory)
        .unwrap()
        .flatten()
        .filter(|file| file.path().extension().is_some_and(|ext| ext == "jsonl"))
        .collect();
    assert_eq!(files.len(), 3);
    assert!(
        files
            .iter()
            .all(|file| file.metadata().unwrap().len() <= 5 * 1024 * 1024)
    );
    assert_eq!(diagnostics::recent(&store).unwrap().len(), 1);
}
#[tokio::test]
async fn login_and_http_errors_are_reported_at_the_correct_stage() {
    let dir = tempfile::tempdir().unwrap();
    let store = Store::at(dir.path().to_owned()).unwrap();
    for code in [
        "HTTP_401",
        "HTTP_403",
        "HTTP_429",
        "TLS_ERROR",
        "NETWORK_TIMEOUT",
    ] {
        let operation = Operation::new(&store, Action::Login, None, None, None);
        let (_, report) = operation
            .run(diagnostics::step(Stage::Login, async {
                Err::<(), _>(anyhow::anyhow!(code))
            }))
            .await;
        let value = serde_json::to_value(report).unwrap();
        assert_eq!(value["failedStage"], "login");
        assert_eq!(value["errorCode"], code);
    }
    let operation = Operation::new(&store, Action::Login, None, None, None);
    let (_, report) = operation
        .run(api::login(
            "http://remote.example.com",
            "fixture-user",
            "fixture-password",
        ))
        .await;
    assert_eq!(
        report.error_code.as_deref(),
        Some("HTTPS_OR_LOOPBACK_ORIGIN_REQUIRED")
    );
    assert_eq!(
        serde_json::to_value(report).unwrap()["failedStage"],
        "login"
    );
}

#[test]
fn mcp_errors_do_not_confuse_url_ports_with_http_status_codes() {
    use tradeflow_connect::mcp::classify;
    assert_eq!(
        classify("connection refused for http://localhost:40491/mcp"),
        "NETWORK_CONNECTION_FAILED"
    );
    assert_eq!(
        classify("HTTP status client error (403 Forbidden) for url http://localhost:40101"),
        "HTTP_403"
    );
    assert_eq!(
        classify("connection failed: protocol version is unsupported"),
        "HOST_COMPATIBILITY"
    );
    assert_eq!(
        classify("HTTP status server error (503 Service Unavailable)"),
        "HTTP_503"
    );
}
