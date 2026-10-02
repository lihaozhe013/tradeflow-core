use clap::{Parser, Subcommand};
use tradeflow_connect::{
    connection,
    diagnostics::{Action, Operation, Stage},
    mcp,
    storage::{Client, Store},
};

#[derive(Parser)]
#[command(version, about = "TradeFlow MCP diagnostics, repair and stdio bridge")]
struct Args {
    #[command(subcommand)]
    command: Commands,
}
#[derive(Subcommand)]
enum Commands {
    Doctor {
        #[arg(long)]
        profile: String,
        #[arg(long)]
        client: String,
        #[arg(long)]
        json: bool,
    },
    Repair {
        #[arg(long)]
        profile: String,
        #[arg(long)]
        client: String,
        #[arg(long, default_value = "auto")]
        mode: String,
        #[arg(long)]
        json: bool,
    },
    Serve {
        #[arg(long)]
        profile: String,
    },
}
fn client(value: &str) -> anyhow::Result<Client> {
    match value {
        "opencode" => Ok(Client::Opencode),
        "workbuddy" => Ok(Client::Workbuddy),
        _ => anyhow::bail!("INVALID_CLIENT"),
    }
}
#[tokio::main]
async fn main() {
    let args = Args::parse();
    let serving = matches!(&args.command, Commands::Serve { .. });
    let action = match &args.command {
        Commands::Doctor { .. } => Action::Doctor,
        Commands::Repair { .. } => Action::Repair,
        Commands::Serve { .. } => Action::Bridge,
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
        Commands::Doctor { profile, .. }
        | Commands::Repair { profile, .. }
        | Commands::Serve { profile } => profile,
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
                connection::recover_switches(&store)
            })?;
            let cwd = std::env::current_dir()?;
            match args.command {
                Commands::Doctor {
                    profile,
                    client: target,
                    ..
                } => {
                    let value =
                        connection::doctor(&store, &profile, client(&target)?, &cwd).await?;
                    if let Some(code) = value["errorCode"].as_str() {
                        let code = code.to_owned();
                        failed_diagnostic = Some(value);
                        anyhow::bail!("{code}");
                    }
                    Ok(value)
                }
                Commands::Repair {
                    profile,
                    client: target,
                    mode,
                    ..
                } => connection::repair(&store, &profile, client(&target)?, &mode, &cwd).await,
                Commands::Serve { profile } => {
                    mcp::serve(store.load(&profile)?).await?;
                    Ok(serde_json::Value::Null)
                }
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
