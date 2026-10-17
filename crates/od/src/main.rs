//! `od` — the Pitch Studio server.

mod agent;
mod api;
mod config;
mod content;
mod db;
mod events;
mod export;
mod files;
mod markers;
mod prompt;
mod runs;
mod state;
mod tools;
mod util;

use std::path::PathBuf;
use std::sync::Arc;

use anyhow::{Context, Result};
use clap::{Parser, Subcommand};
use tower_http::services::{ServeDir, ServeFile};

use crate::config::{Config, ModelSettings};
use crate::state::AppState;

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
    let cli = Cli::parse();
    let args = match cli.command {
        Some(Command::Serve(a)) => a,
        None => match Cli::parse_from(["od", "serve"]).command {
            Some(Command::Serve(a)) => a,
            None => unreachable!(),
        },
    };
    let data_dir = absolute(&args.data_dir)?;
    std::fs::create_dir_all(&data_dir)?;

    // goose keeps config and discovers skills under HOME; give it a home of
    // its own inside the data dir so the host's files never leak into a run.
    // Set before any thread starts.
    let goose_home = data_dir.join("goose").join("home");
    std::fs::create_dir_all(&goose_home)?;
    unsafe {
        std::env::set_var("HOME", &goose_home);
        std::env::set_var("GOOSE_PATH_ROOT", data_dir.join("goose"));
        std::env::set_var("GOOSE_DISABLE_KEYRING", "1");
        std::env::set_var("GOOSE_TELEMETRY_ENABLED", "false");
    }

    tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()?
        .block_on(serve(args, data_dir))
}

fn absolute(p: &std::path::Path) -> Result<PathBuf> {
    Ok(if p.is_absolute() {
        p.to_path_buf()
    } else {
        std::env::current_dir()?.join(p)
    })
}

async fn serve(args: ServeArgs, data_dir: PathBuf) -> Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "od=info,goose=warn,tower_http=warn".into()),
        )
        .init();

    let content_dir = absolute(&args.content_dir)?;
    let web_dir = absolute(&args.web_dir)?;
    let config = Arc::new(Config {
        port: args.port,
        preview_port: args.preview_port.unwrap_or(args.port + 1),
        preview_origin: args.preview_origin.clone().filter(|o| !o.is_empty()),
        data_dir: data_dir.clone(),
        web_dir: web_dir.is_dir().then_some(web_dir.clone()),
        model: ModelSettings::from_env()?,
    });
    std::fs::create_dir_all(config.projects_dir())?;
    std::fs::create_dir_all(config.runs_dir())?;

    let db = db::open(&data_dir).await.context("opening the database")?;
    let library = Arc::new(content::Library::load(&content_dir)?);
    let events = Arc::new(events::ProjectEvents::default());
    let scopes = Arc::new(tools::Scopes::default());
    let tools = Arc::new(tools::OdTools::new(scopes.clone(), library.clone(), events.clone()));
    let harness = Arc::new(agent::Harness::new(
        &config.goose_dir(),
        config.model.clone(),
        tools,
        scopes,
    ));
    let state = AppState {
        config: config.clone(),
        db,
        library,
        harness,
        runs: Arc::new(runs::Runs::new(config.runs_dir())),
        events,
    };

    let preview = api::preview_router(state.clone());
    let mut app = api::router(state);
    if let Some(web) = &config.web_dir {
        let spa = ServeDir::new(web).fallback(ServeFile::new(web.join("index.html")));
        app = app.fallback_service(spa);
    }

    let addr = std::net::SocketAddr::new(args.host, config.port);
    let listener = tokio::net::TcpListener::bind(addr).await?;
    tracing::info!(
        "Pitch Studio on http://{addr}  (model {} via {})",
        config.model.default_model,
        config.model.base_url
    );
    let preview_addr = std::net::SocketAddr::new(args.host, config.preview_port);
    let preview_listener = tokio::net::TcpListener::bind(preview_addr)
        .await
        .with_context(|| format!("binding the preview origin on {preview_addr}"))?;
    tracing::info!("previews on http://{preview_addr}");
    tokio::try_join!(
        async { axum::serve(listener, app).await },
        async { axum::serve(preview_listener, preview).await },
    )?;
    Ok(())
}
