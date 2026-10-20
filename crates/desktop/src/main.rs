//! Pitch Studio as a desktop app: the studio server runs inside this process
//! on loopback ports chosen at startup, and one window shows it.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::path::{Path, PathBuf};

use anyhow::{Context, Result};
use tauri::webview::{DownloadEvent, NewWindowResponse};
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_opener::OpenerExt;

const IDENTIFIER: &str = "co.trypitch.studio";

fn main() {
    if let Err(err) = run() {
        eprintln!("Pitch Studio failed to start: {err:#}");
        std::process::exit(1);
    }
}

fn run() -> Result<()> {
    // Resolve the user's folders before the agent's HOME is redirected.
    let data_dir = dirs::data_dir()
        .context("no application-data folder")?
        .join(IDENTIFIER);
    let downloads = dirs::download_dir().unwrap_or_else(|| data_dir.join("downloads"));
    std::fs::create_dir_all(&data_dir)?;
    init_logging(&data_dir);
    od::server::isolate_agent_home(&data_dir)?;

    // Bind before the window exists so its first request is already queued.
    let studio = std::net::TcpListener::bind("127.0.0.1:0")?;
    let preview = std::net::TcpListener::bind("127.0.0.1:0")?;
    studio.set_nonblocking(true)?;
    preview.set_nonblocking(true)?;
    let port = studio.local_addr()?.port();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(move |app| {
            let resources = app.path().resource_dir().ok();
            let content_dir = locate(resources.as_deref(), "content", "../../content");
            let web_dir = locate(resources.as_deref(), "web", "../../web/dist");
            tracing::info!(?content_dir, ?web_dir, ?data_dir, "starting the studio");

            let opts = od::server::Options {
                data_dir: data_dir.clone(),
                content_dir,
                web_dir: Some(web_dir),
                preview_origin: None,
            };
            tauri::async_runtime::spawn(async move {
                let serve = async {
                    let studio = tokio::net::TcpListener::from_std(studio)?;
                    let preview = tokio::net::TcpListener::from_std(preview)?;
                    od::server::run(opts, studio, preview).await
                };
                if let Err(err) = serve.await {
                    tracing::error!("the studio server stopped: {err:#}");
                }
            });

            let origin = format!("http://127.0.0.1:{port}");
            let handle = app.handle().clone();
            WebviewWindowBuilder::new(app, "main", WebviewUrl::External(origin.parse()?))
                .title("Pitch Studio")
                .inner_size(1440.0, 900.0)
                .min_inner_size(960.0, 640.0)
                // Navigation is not intercepted: previews live on a second
                // loopback origin, and agent-written pages may embed anything.
                // Links that ask for a new window open in the system browser.
                .on_new_window(move |url, _features| {
                    let _ = handle.opener().open_url(url.as_str(), None::<&str>);
                    NewWindowResponse::Deny
                })
                // Exports and file downloads land in the Downloads folder.
                .on_download(move |_webview, event| {
                    if let DownloadEvent::Requested { destination, .. } = event {
                        let name = destination
                            .file_name()
                            .map(|n| n.to_owned())
                            .unwrap_or_else(|| "download".into());
                        *destination = unique_path(&downloads, &name);
                    }
                    true
                })
                .build()?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .context("running the app")?;
    Ok(())
}

/// A bundled resource folder, or the repository's copy when running from
/// a development build.
fn locate(resources: Option<&Path>, bundled: &str, dev: &str) -> PathBuf {
    if let Some(dir) = resources.map(|r| r.join(bundled)).filter(|d| d.is_dir()) {
        return dir;
    }
    Path::new(env!("CARGO_MANIFEST_DIR")).join(dev)
}

fn unique_path(dir: &Path, name: &std::ffi::OsStr) -> PathBuf {
    let first = dir.join(name);
    if !first.exists() {
        return first;
    }
    let p = Path::new(name);
    let stem = p.file_stem().map(|s| s.to_string_lossy().to_string()).unwrap_or_default();
    let ext = p.extension().map(|e| format!(".{}", e.to_string_lossy())).unwrap_or_default();
    (1..)
        .map(|i| dir.join(format!("{stem} ({i}){ext}")))
        .find(|c| !c.exists())
        .unwrap()
}

fn init_logging(data_dir: &Path) {
    let filter = tracing_subscriber::EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| "od=info,pitch_studio=info,goose=warn".into());
    let log = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(data_dir.join("studio.log"));
    match log {
        Ok(file) => tracing_subscriber::fmt()
            .with_env_filter(filter)
            .with_ansi(false)
            .with_writer(std::sync::Mutex::new(file))
            .init(),
        Err(_) => tracing_subscriber::fmt().with_env_filter(filter).init(),
    }
}
