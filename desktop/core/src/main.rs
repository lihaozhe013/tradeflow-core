use clap::{Parser, Subcommand};
use tradeflow_connect::{
    connection, mcp,
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
    let result: anyhow::Result<serde_json::Value> = async {
        let store = Store::system()?;
        let cwd = std::env::current_dir()?;
        match args.command {
            Commands::Doctor {
                profile,
                client: target,
                ..
            } => connection::doctor(&store, &profile, client(&target)?, &cwd).await,
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
    }
    .await;
    match result {
        Ok(value) => {
            if !serving {
                println!("{value}");
            }
        }
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
    }
}
