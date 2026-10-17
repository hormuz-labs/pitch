//! `od` — the Pitch Studio server.

use std::path::PathBuf;

use anyhow::{Context, Result};
use clap::{Parser, Subcommand};
use od::server;

#[derive(Parser)]
#[command(name = "od", version, about = "Pitch Studio server")]
struct Cli {
    #[command(subcommand)]
    command: Option<Command>,
}

#[derive(Subcommand)]
enum Command {
    /// Run the studio server (the default).
    Serve(ServeArgs),
}

#[derive(clap::Args)]
struct ServeArgs {
    #[arg(long, env = "OD_PORT", default_value_t = 7456)]
    port: u16,
    /// Port of the preview origin; defaults to the port after `port`.
    #[arg(long, env = "OD_PREVIEW_PORT")]
    preview_port: Option<u16>,
    /// Public origin of the preview server, when it has its own host.
    #[arg(long, env = "OD_PREVIEW_ORIGIN")]
    preview_origin: Option<String>,
    /// Interface to listen on; use 0.0.0.0 inside a container.
    #[arg(long, env = "OD_HOST", default_value = "127.0.0.1")]
    host: std::net::IpAddr,
    /// Where projects, runs and the database live.
    #[arg(long, env = "OD_DATA_DIR", default_value = ".od")]
    data_dir: PathBuf,
    /// The bundled library: skills, design systems, templates.
    #[arg(long, env = "OD_CONTENT_DIR", default_value = "content")]
    content_dir: PathBuf,
    /// The built studio (web/dist). Served at / when present.
    #[arg(long, env = "OD_WEB_DIR", default_value = "web/dist")]
    web_dir: PathBuf,
}

fn main() -> Result<()> {
    let args = match Cli::parse().command {
        Some(Command::Serve(a)) => a,
        None => match Cli::parse_from(["od", "serve"]).command {
            Some(Command::Serve(a)) => a,
            None => unreachable!(),
        },
    };
    let data_dir = absolute(&args.data_dir)?;
    std::fs::create_dir_all(&data_dir)?;
    server::isolate_agent_home(&data_dir)?;

    tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()?
        .block_on(async move {
            tracing_subscriber::fmt()
                .with_env_filter(
                    tracing_subscriber::EnvFilter::try_from_default_env()
                        .unwrap_or_else(|_| "od=info,goose=warn,tower_http=warn".into()),
                )
                .init();
            let addr = std::net::SocketAddr::new(args.host, args.port);
            let preview_addr = std::net::SocketAddr::new(args.host, args.preview_port.unwrap_or(args.port + 1));
            let listener = tokio::net::TcpListener::bind(addr).await.with_context(|| format!("binding {addr}"))?;
            let preview = tokio::net::TcpListener::bind(preview_addr)
                .await
                .with_context(|| format!("binding the preview origin on {preview_addr}"))?;
            server::run(
                server::Options {
                    data_dir,
                    content_dir: absolute(&args.content_dir)?,
                    web_dir: Some(absolute(&args.web_dir)?),
                    preview_origin: args.preview_origin,
                },
                listener,
                preview,
            )
            .await
        })
}

fn absolute(p: &std::path::Path) -> Result<PathBuf> {
    Ok(if p.is_absolute() { p.to_path_buf() } else { std::env::current_dir()?.join(p) })
}
