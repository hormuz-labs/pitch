//! Start the studio: the API + studio origin and the preview origin.

use std::path::{Path, PathBuf};
use std::sync::Arc;

use anyhow::{Context, Result};
use tokio::net::TcpListener;
use tower_http::services::{ServeDir, ServeFile};

use crate::config::{Config, ModelSettings};
use crate::state::AppState;
use crate::{agent, api, content, db, events, runs, tools};

pub struct Options {
    /// Where projects, runs, settings and the database live.
    pub data_dir: PathBuf,
    /// The bundled library: skills, design systems, templates.
    pub content_dir: PathBuf,
    /// The built studio; served at `/` when present.
    pub web_dir: Option<PathBuf>,
    /// Public origin of the preview server when it has its own host.
    pub preview_origin: Option<String>,
}

/// goose keeps config and discovers skills under HOME; give it a home of its
/// own inside the data dir so the host's files never leak into a run.
///
/// Call this before any other thread starts: it changes process-wide
/// environment variables.
pub fn isolate_agent_home(data_dir: &Path) -> Result<()> {
    let goose_home = data_dir.join("goose").join("home");
    std::fs::create_dir_all(&goose_home)?;
    // SAFETY: called at startup, before the runtime or any thread exists.
    unsafe {
        std::env::set_var("HOME", &goose_home);
        std::env::set_var("GOOSE_PATH_ROOT", data_dir.join("goose"));
        std::env::set_var("GOOSE_DISABLE_KEYRING", "1");
        std::env::set_var("GOOSE_TELEMETRY_ENABLED", "false");
    }
    Ok(())
}

/// Serve until either listener fails. `listener` carries the studio and the
/// API; `preview_listener` the agent-written files.
pub async fn run(opts: Options, listener: TcpListener, preview_listener: TcpListener) -> Result<()> {
    let addr = listener.local_addr()?;
    let preview_addr = preview_listener.local_addr()?;
    let config = Arc::new(Config {
        port: addr.port(),
        preview_port: preview_addr.port(),
        preview_origin: opts.preview_origin.filter(|o| !o.is_empty()),
        data_dir: opts.data_dir.clone(),
        web_dir: opts.web_dir.filter(|w| w.is_dir()),
    });
    std::fs::create_dir_all(config.projects_dir())?;
    std::fs::create_dir_all(config.runs_dir())?;
    let model = ModelSettings::load(&opts.data_dir)?;

    let db = db::open(&opts.data_dir).await.context("opening the database")?;
    let library = Arc::new(content::Library::load(&opts.content_dir)?);
    let events = Arc::new(events::ProjectEvents::default());
    let scopes = Arc::new(tools::Scopes::default());
    let tools = Arc::new(tools::OdTools::new(scopes.clone(), library.clone(), events.clone()));
    tracing::info!(
        "Pitch Studio on http://{addr}, previews on http://{preview_addr} (model {} via {})",
        if model.default_model.is_empty() { "not set" } else { &model.default_model },
        if model.base_url.is_empty() { "-" } else { &model.base_url },
    );
    let harness = Arc::new(agent::Harness::new(&config.goose_dir(), model, tools, scopes));
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
    tokio::try_join!(
        async { axum::serve(listener, app).await },
        async { axum::serve(preview_listener, preview).await },
    )?;
    Ok(())
}
