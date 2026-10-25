use clap::{Parser, Subcommand};
use tradeflow_connect::{
    connection,
    diagnostics::{Action, Operation, Stage},
    mcp,
    storage::Store,
};

#[derive(Parser)]
#[command(
    version,
    about = "TradeFlow MCP bridge, diagnostics and connection descriptor"
)]
struct Args {
    #[command(subcommand)]
    command: Commands,
}
#[derive(Subcommand)]
enum Commands {
    /// Run the stdio MCP bridge for one local connection profile.
    Serve {
        #[arg(long)]
        profile: String,
    },
    /// Probe the remote MCP service and report a redacted JSON result.
    Doctor {
        #[arg(long)]
        profile: String,
        /// Accepted for compatibility. Output is always redacted JSON.
        #[arg(long)]
        json: bool,
    },
    /// Print the redacted launch descriptor for a local connection profile.
    Describe {
        #[arg(long)]
        profile: String,
        /// Accepted for compatibility. Output is always redacted JSON.
        #[arg(long)]
        json: bool,
    },
}
fn main() {
    // Command parsing and the connection state machines use more stack in debug builds than the
    // Windows main thread provides. Run everything on an explicitly sized worker thread.
    let worker = std::thread::Builder::new()
        .name("tradeflow-connect".into())
        .stack_size(8 * 1024 * 1024)
        .spawn(|| {
            let runtime = tokio::runtime::Builder::new_multi_thread()
                .enable_all()
                .build()
                .expect("tokio runtime");
            runtime.block_on(run());
        })
        .expect("worker thread");
    if worker.join().is_err() {
        std::process::exit(1);
    }
}
async fn run() {
    tradeflow_connect::diagnostics::install_panic_logging();
    let args = Args::parse();
    let serving = matches!(&args.command, Commands::Serve { .. });
    let describing = matches!(&args.command, Commands::Describe { .. });
    if describing {
        let Commands::Describe { profile, .. } = &args.command else {
            unreachable!();
        };
        let result = Store::system().and_then(|store| connection::describe(&store, profile));
        match result {
            Ok(value) => println!("{value}"),
            Err(error) => {
                println!(
                    "{}",
                    serde_json::json!({"errorCode":connection::safe_code(&error)})
                );
                std::process::exit(1);
            }
        }
        return;
    }
    let action = match &args.command {
        Commands::Doctor { .. } => Action::Doctor,
        Commands::Serve { .. } => Action::Bridge,
        Commands::Describe { .. } => unreachable!(),
    };
    let store = match Store::system() {
        Ok(store) => store,
        Err(error) => {
            let code = connection::safe_code(&error);
            if serving {
                eprintln!("{code}");
            } else {
                println!(
                    "{}",
                    serde_json::json!({"errorCode":code,"serviceVerified":false})
                );
            }
            std::process::exit(1);
        }
    };
    let profile_id = match &args.command {
        Commands::Doctor { profile, .. } | Commands::Serve { profile } => profile,
        Commands::Describe { .. } => unreachable!(),
    };
    let profile = store.load(profile_id).ok();
    let operation = Operation::new(
        &store,
        action,
        profile.as_ref().map(|p| p.client.clone()),
        profile.as_ref().map(|p| p.base_url.as_str()),
        None,
    );
    let mut failed_diagnostic = None;
    let (result, report) = operation
        .run(async {
            tradeflow_connect::diagnostics::sync_step(Stage::Recovery, || {
                connection::recover_operations(&store)
            })?;
            match args.command {
                Commands::Doctor { profile, .. } => {
                    let value = connection::doctor(&store, &profile).await?;
                    if let Some(code) = value["errorCode"].as_str() {
                        let code = code.to_owned();
                        failed_diagnostic = Some(value);
                        anyhow::bail!("{code}");
                    }
                    Ok(value)
                }
                Commands::Serve { profile } => {
                    mcp::serve(store.load(&profile)?).await?;
                    Ok(serde_json::Value::Null)
                }
                Commands::Describe { .. } => unreachable!(),
            }
        })
        .await;
    match result {
        Ok(mut value) => {
            if !serving {
                if let Some(object) = value.as_object_mut() {
                    object.insert("operation".into(), serde_json::to_value(&report).unwrap());
                }
                println!("{value}");
            }
        }
        Err(error) => {
            let code = connection::safe_code(&error);
            if serving {
                eprintln!("{code}");
            } else {
                let mut value = failed_diagnostic.unwrap_or_else(
                    || serde_json::json!({"errorCode":code,"serviceVerified":false}),
                );
                value["operation"] = serde_json::to_value(report).unwrap();
                println!("{value}");
            }
            std::process::exit(1);
        }
    }
}
