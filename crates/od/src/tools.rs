//! The agent's tools, served in-process to goose as one extension (`od`).
//!
//! Every file tool is confined to the project folder of the session that
//! calls it; nothing here runs a shell.

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use async_trait::async_trait;
use goose::agents::ToolCallContext;
use goose::agents::mcp_client::{Error as McpError, McpClientTrait};
use rmcp::model::{
    CallToolResult, ContentBlock, ErrorData, Implementation, InitializeResult, JsonObject,
    ListToolsResult, ServerCapabilities, Tool,
};
use schemars::JsonSchema;
use serde::Deserialize;
use serde_json::{Value, json};
use tokio_util::sync::CancellationToken;

use crate::content::Library;
use crate::events::ProjectEvents;
use crate::files;

pub const EXTENSION: &str = "od";

/// What a goose session is allowed to touch.
#[derive(Clone)]
pub struct SessionScope {
    pub project_id: String,
    pub root: PathBuf,
    pub design_system: Option<String>,
}

#[derive(Default)]
pub struct Scopes(Mutex<HashMap<String, SessionScope>>);

impl Scopes {
    pub fn set(&self, session_id: &str, scope: SessionScope) {
        self.0.lock().unwrap().insert(session_id.to_string(), scope);
    }

    fn get(&self, session_id: &str) -> Option<SessionScope> {
        self.0.lock().unwrap().get(session_id).cloned()
    }
}

pub struct OdTools {
    info: InitializeResult,
    scopes: Arc<Scopes>,
    library: Arc<Library>,
    events: Arc<ProjectEvents>,
    http: reqwest::Client,
}

#[derive(Deserialize, JsonSchema)]
struct ReadArgs {
    /// Project-relative path.
    path: String,
    /// First line to return (1-based).
    offset: Option<usize>,
    /// Maximum number of lines.
    limit: Option<usize>,
}

#[derive(Deserialize, JsonSchema)]
struct WriteArgs {
    /// Project-relative path; parent folders are created.
    path: String,
    /// The complete file content.
    content: String,
}

#[derive(Deserialize, JsonSchema)]
struct EditArgs {
    /// Project-relative path of an existing file.
    path: String,
    /// Exact text to replace; must occur once unless replace_all is set.
    old_string: String,
    new_string: String,
    #[serde(default)]
    replace_all: bool,
}

#[derive(Deserialize, JsonSchema)]
struct PathArgs {
    /// Project-relative path.
    path: String,
}

#[derive(Deserialize, JsonSchema)]
struct ListArgs {
    /// Folder to list, relative to the project root. Omit for the whole project.
    path: Option<String>,
}

#[derive(Deserialize, JsonSchema)]
struct SearchArgs {
    /// Regular expression.
    pattern: String,
    /// Folder or file to search, relative to the project root.
    path: Option<String>,
}

#[derive(Deserialize, JsonSchema)]
struct TodoItem {
    content: String,
    /// pending | in_progress | completed
    status: String,
}

#[derive(Deserialize, JsonSchema)]
struct TodoArgs {
    /// The whole list, in order.
    todos: Vec<TodoItem>,
}

#[derive(Deserialize, JsonSchema)]
struct DirectionArgs {
    /// A direction id from the direction library index.
    id: String,
}

#[derive(Deserialize, JsonSchema)]
struct FetchArgs {
    /// An http(s) URL.
    url: String,
}

#[derive(Deserialize, JsonSchema)]
struct DownloadArgs {
    /// An http(s) URL of an image, font or other asset.
    url: String,
    /// Project-relative path to save it to, e.g. `assets/hero.jpg`.
    path: String,
}

fn schema<T: JsonSchema>() -> Arc<JsonObject> {
    let value = serde_json::to_value(schemars::schema_for!(T)).unwrap_or(json!({}));
    Arc::new(value.as_object().cloned().unwrap_or_default())
}

fn text(s: impl Into<String>) -> Result<CallToolResult, McpError> {
    Ok(CallToolResult::success(vec![ContentBlock::text(s.into())]))
}

fn fail(s: impl Into<String>) -> Result<CallToolResult, McpError> {
    Ok(CallToolResult::error(vec![ContentBlock::text(s.into())]))
}

fn parse<T: for<'de> Deserialize<'de>>(args: Option<JsonObject>) -> Result<T, String> {
    serde_json::from_value(Value::Object(args.unwrap_or_default()))
        .map_err(|e| format!("invalid arguments: {e}"))
}

impl OdTools {
    pub fn new(scopes: Arc<Scopes>, library: Arc<Library>, events: Arc<ProjectEvents>) -> Self {
        let info = InitializeResult::new(ServerCapabilities::builder().enable_tools().build())
            .with_server_info(Implementation::new(
                EXTENSION.to_string(),
                env!("CARGO_PKG_VERSION").to_string(),
            ));
        let http = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(30))
            .redirect(reqwest::redirect::Policy::limited(5))
            .user_agent("Mozilla/5.0 (compatible; PitchStudio)")
            .build()
            .expect("http client");
        Self {
            info,
            scopes,
            library,
            events,
            http,
        }
    }

    fn tools() -> Vec<Tool> {
        vec![
            Tool::new("read_file", "Read a project file. Text files return their lines; binary files return their size and type.", schema::<ReadArgs>()),
            Tool::new("write_file", "Create or overwrite a project file with complete content.", schema::<WriteArgs>()),
            Tool::new("edit_file", "Replace exact text in an existing project file.", schema::<EditArgs>()),
            Tool::new("delete_file", "Delete a project file.", schema::<PathArgs>()),
            Tool::new("list_files", "List project files with size and kind.", schema::<ListArgs>()),
            Tool::new("search_files", "Search project text files with a regular expression; returns path:line: text.", schema::<SearchArgs>()),
            Tool::new("todo_write", "Replace the visible task list. Call it with the whole list whenever progress changes.", schema::<TodoArgs>()),
            Tool::new("directions", "Print the full specification (palette, fonts, posture) of a visual direction from the direction library.", schema::<DirectionArgs>()),
            Tool::new("design_system_read", "Read a file from the active design system's pull layer.", schema::<PathArgs>()),
            Tool::new("web_fetch", "Fetch a public web page and return its readable text and the image URLs it references.", schema::<FetchArgs>()),
            Tool::new("download_asset", "Download a public asset (image, font, video) into the project so it can be referenced with a relative path.", schema::<DownloadArgs>()),
        ]
    }

    fn scope(&self, ctx: &ToolCallContext) -> Result<SessionScope, String> {
        self.scopes
            .get(&ctx.session_id)
            .ok_or_else(|| "no project is attached to this session".to_string())
    }

    fn changed(&self, scope: &SessionScope, path: &str, kind: &str) {
        self.events.file_changed(&scope.project_id, path, kind);
    }

    async fn dispatch(&self, ctx: &ToolCallContext, name: &str, args: Option<JsonObject>) -> Result<String, String> {
        match name {
            "read_file" => {
                let a: ReadArgs = parse(args)?;
                let scope = self.scope(ctx)?;
                let path = files::resolve(&scope.root, &a.path).map_err(|e| e.to_string())?;
                let bytes = tokio::fs::read(&path).await.map_err(|e| format!("{}: {e}", a.path))?;
                match String::from_utf8(bytes) {
                    Ok(s) => {
                        let start = a.offset.unwrap_or(1).max(1) - 1;
                        let limit = a.limit.unwrap_or(2000);
                        let lines: Vec<&str> = s.lines().collect();
                        let total = lines.len();
                        let body: Vec<String> = lines
                            .iter()
                            .enumerate()
                            .skip(start)
                            .take(limit)
                            .map(|(i, l)| format!("{:>5}\t{l}", i + 1))
                            .collect();
                        let mut out = body.join("\n");
                        if start + limit < total {
                            out.push_str(&format!("\n… {} more lines (use offset)", total - start - limit));
                        }
                        Ok(out)
                    }
                    Err(e) => Ok(format!(
                        "{} is a binary file ({} bytes, {})",
                        a.path,
                        e.as_bytes().len(),
                        mime_guess::from_path(&path).first_or_octet_stream()
                    )),
                }
            }
            "write_file" => {
                let a: WriteArgs = parse(args)?;
                let scope = self.scope(ctx)?;
                guard_writable(&a.path)?;
                let path = files::resolve(&scope.root, &a.path).map_err(|e| e.to_string())?;
                let existed = path.exists();
                if let Some(parent) = path.parent() {
                    tokio::fs::create_dir_all(parent).await.map_err(|e| e.to_string())?;
                }
                tokio::fs::write(&path, &a.content).await.map_err(|e| e.to_string())?;
                self.changed(&scope, &a.path, if existed { "change" } else { "add" });
                Ok(format!("Wrote {} ({} lines)", a.path, a.content.lines().count()))
            }
            "edit_file" => {
                let a: EditArgs = parse(args)?;
                let scope = self.scope(ctx)?;
                guard_writable(&a.path)?;
                let path = files::resolve(&scope.root, &a.path).map_err(|e| e.to_string())?;
                let current = tokio::fs::read_to_string(&path).await.map_err(|e| format!("{}: {e}", a.path))?;
                let count = current.matches(&a.old_string).count();
                if count == 0 {
                    return Err(format!("old_string not found in {}", a.path));
                }
                if count > 1 && !a.replace_all {
                    return Err(format!("old_string occurs {count} times in {}; add context or set replace_all", a.path));
                }
                let next = if a.replace_all {
                    current.replace(&a.old_string, &a.new_string)
                } else {
                    current.replacen(&a.old_string, &a.new_string, 1)
                };
                tokio::fs::write(&path, &next).await.map_err(|e| e.to_string())?;
                self.changed(&scope, &a.path, "change");
                Ok(format!("Edited {} ({} replacement{})", a.path, if a.replace_all { count } else { 1 }, if a.replace_all && count > 1 { "s" } else { "" }))
            }
            "delete_file" => {
                let a: PathArgs = parse(args)?;
                let scope = self.scope(ctx)?;
                guard_writable(&a.path)?;
                let path = files::resolve(&scope.root, &a.path).map_err(|e| e.to_string())?;
                tokio::fs::remove_file(&path).await.map_err(|e| e.to_string())?;
                self.changed(&scope, &a.path, "unlink");
                Ok(format!("Deleted {}", a.path))
            }
            "list_files" => {
                let a: ListArgs = parse(args)?;
                let scope = self.scope(ctx)?;
                let prefix = a.path.unwrap_or_default();
                let listed: Vec<String> = files::list(&scope.root)
                    .into_iter()
                    .filter(|f| prefix.is_empty() || f.path.starts_with(prefix.trim_end_matches('/')))
                    .map(|f| format!("{}\t{}\t{} bytes", f.path, f.kind, f.size))
                    .collect();
                let mut out = if listed.is_empty() { "No files.".to_string() } else { listed.join("\n") };
                let skills = scope.root.join(".od-skills");
                if prefix.starts_with(".od-skills") && skills.is_dir() {
                    out = walkdir::WalkDir::new(&skills)
                        .into_iter()
                        .filter_map(|e| e.ok())
                        .filter(|e| e.file_type().is_file())
                        .filter_map(|e| e.path().strip_prefix(&scope.root).ok().map(|p| p.display().to_string()))
                        .collect::<Vec<_>>()
                        .join("\n");
                }
                Ok(out)
            }
            "search_files" => {
                let a: SearchArgs = parse(args)?;
                let scope = self.scope(ctx)?;
                let re = regex::Regex::new(&a.pattern).map_err(|e| e.to_string())?;
                let base = match &a.path {
                    Some(p) => files::resolve(&scope.root, p).map_err(|e| e.to_string())?,
                    None => scope.root.clone(),
                };
                let root = scope.root.canonicalize().map_err(|e| e.to_string())?;
                let mut hits = Vec::new();
                for entry in walkdir::WalkDir::new(&base).into_iter().filter_map(|e| e.ok()) {
                    if !entry.file_type().is_file() || entry.metadata().map(|m| m.len() > 2_000_000).unwrap_or(true) {
                        continue;
                    }
                    let Ok(body) = std::fs::read_to_string(entry.path()) else { continue };
                    let rel = entry.path().strip_prefix(&root).unwrap_or(entry.path()).display().to_string();
                    if rel.split('/').any(|s| s == "node_modules" || s == ".git") {
                        continue;
                    }
                    for (i, line) in body.lines().enumerate() {
                        if re.is_match(line) {
                            let line: String = line.chars().take(240).collect();
                            hits.push(format!("{rel}:{}: {line}", i + 1));
                            if hits.len() >= 200 {
                                break;
                            }
                        }
                    }
                    if hits.len() >= 200 {
                        break;
                    }
                }
                Ok(if hits.is_empty() { "No matches.".to_string() } else { hits.join("\n") })
            }
            "todo_write" => {
                let a: TodoArgs = parse(args)?;
                let done = a.todos.iter().filter(|t| t.status == "completed").count();
                let lines: Vec<String> = a
                    .todos
                    .iter()
                    .map(|t| format!("[{}] {}", match t.status.as_str() { "completed" => "x", "in_progress" => "~", _ => " " }, t.content))
                    .collect();
                Ok(format!("Task list updated ({done}/{} done):\n{}", a.todos.len(), lines.join("\n")))
            }
            "directions" => {
                let a: DirectionArgs = parse(args)?;
                direction_spec(&a.id).ok_or_else(|| format!("unknown direction id: {}", a.id))
            }
            "design_system_read" => {
                let a: PathArgs = parse(args)?;
                let scope = self.scope(ctx)?;
                let ds_id = scope.design_system.ok_or("no design system is active in this project")?;
                let ds = self.library.design_systems.get(&ds_id).ok_or("design system not found")?;
                let path = files::resolve(&ds.dir, &a.path).map_err(|e| e.to_string())?;
                let body = tokio::fs::read_to_string(&path).await.map_err(|e| format!("{}: {e}", a.path))?;
                Ok(truncate(body, 120_000))
            }
            "web_fetch" => {
                let a: FetchArgs = parse(args)?;
                let url = public_url(&a.url).await?;
                let resp = self.http.get(url).send().await.map_err(|e| e.to_string())?;
                let status = resp.status();
                let ctype = resp.headers().get("content-type").and_then(|v| v.to_str().ok()).unwrap_or("").to_string();
                let body = resp.text().await.map_err(|e| e.to_string())?;
                if !status.is_success() {
                    return Err(format!("HTTP {status}"));
                }
                if ctype.contains("html") {
                    Ok(truncate(readable_html(&body, &a.url), 60_000))
                } else {
                    Ok(truncate(body, 60_000))
                }
            }
            "download_asset" => {
                let a: DownloadArgs = parse(args)?;
                let scope = self.scope(ctx)?;
                guard_writable(&a.path)?;
                let url = public_url(&a.url).await?;
                let resp = self.http.get(url).send().await.map_err(|e| e.to_string())?;
                if !resp.status().is_success() {
                    return Err(format!("HTTP {}", resp.status()));
                }
                let ctype = resp.headers().get("content-type").and_then(|v| v.to_str().ok()).unwrap_or("").to_string();
                let bytes = resp.bytes().await.map_err(|e| e.to_string())?;
                if bytes.len() > 50 * 1024 * 1024 {
                    return Err("asset is larger than 50 MB".into());
                }
                let path = files::resolve(&scope.root, &a.path).map_err(|e| e.to_string())?;
                if let Some(parent) = path.parent() {
                    tokio::fs::create_dir_all(parent).await.map_err(|e| e.to_string())?;
                }
                tokio::fs::write(&path, &bytes).await.map_err(|e| e.to_string())?;
                self.changed(&scope, &a.path, "add");
                let dims = imagesize::blob_size(&bytes).map(|s| format!(", {}×{} px", s.width, s.height)).unwrap_or_default();
                Ok(format!("Saved {} ({} bytes, {ctype}{dims})", a.path, bytes.len()))
            }
            other => Err(format!("unknown tool {other}")),
        }
    }
}

fn guard_writable(rel: &str) -> Result<(), String> {
    let first = rel.trim_start_matches("./").split('/').next().unwrap_or("");
    if first.starts_with('.') {
        return Err(format!("{rel} is inside a reserved folder; skills and host files are read-only"));
    }
    Ok(())
}

fn truncate(mut s: String, max: usize) -> String {
    if s.len() > max {
        let mut cut = max;
        while !s.is_char_boundary(cut) {
            cut -= 1;
        }
        s.truncate(cut);
        s.push_str("\n… (truncated)");
    }
    s
}

pub fn direction_spec(id: &str) -> Option<String> {
    let specs: serde_json::Map<String, Value> = serde_json::from_str(crate::prompt::DIRECTIONS_JSON).ok()?;
    specs.get(id.trim()).and_then(Value::as_str).map(str::to_string)
}

/// Refuse URLs that resolve to loopback, private or link-local addresses.
async fn public_url(raw: &str) -> Result<reqwest::Url, String> {
    let url = reqwest::Url::parse(raw).map_err(|e| format!("bad URL: {e}"))?;
    if !matches!(url.scheme(), "http" | "https") {
        return Err("only http and https URLs can be fetched".into());
    }
    let host = url.host_str().ok_or("URL has no host")?.to_string();
    let port = url.port_or_known_default().unwrap_or(443);
    let addrs = tokio::net::lookup_host((host.as_str(), port)).await.map_err(|e| format!("cannot resolve {host}: {e}"))?;
    for addr in addrs {
        let ip = addr.ip();
        let private = match ip {
            std::net::IpAddr::V4(v4) => {
                v4.is_loopback() || v4.is_private() || v4.is_link_local() || v4.is_unspecified()
                    || v4.is_broadcast() || (v4.octets()[0] == 100 && (v4.octets()[1] & 0xc0) == 64)
                    || v4.octets()[0] == 169
            }
            std::net::IpAddr::V6(v6) => {
                v6.is_loopback() || v6.is_unspecified() || (v6.segments()[0] & 0xfe00) == 0xfc00
                    || (v6.segments()[0] & 0xffc0) == 0xfe80
            }
        };
        if private {
            return Err(format!("{host} resolves to a private address"));
        }
    }
    Ok(url)
}

/// Strip an HTML page down to its text plus the images it references.
fn readable_html(html: &str, base: &str) -> String {
    static SCRIPT: std::sync::LazyLock<regex::Regex> = std::sync::LazyLock::new(|| {
        regex::Regex::new(r"(?is)<(script|style|noscript|svg)[^>]*>.*?</(script|style|noscript|svg)>").unwrap()
    });
    static TAG: std::sync::LazyLock<regex::Regex> =
        std::sync::LazyLock::new(|| regex::Regex::new(r"(?s)<[^>]+>").unwrap());
    static IMG: std::sync::LazyLock<regex::Regex> = std::sync::LazyLock::new(|| {
        regex::Regex::new(r#"(?i)<(?:img|source)[^>]+(?:src|srcset)="([^"\s]+)"#).unwrap()
    });
    static TITLE: std::sync::LazyLock<regex::Regex> =
        std::sync::LazyLock::new(|| regex::Regex::new(r"(?is)<title[^>]*>(.*?)</title>").unwrap());
    let base_url = reqwest::Url::parse(base).ok();
    let mut images: Vec<String> = IMG
        .captures_iter(html)
        .filter_map(|c| match &base_url {
            Some(b) => b.join(&c[1]).ok().map(|u| u.to_string()),
            None => Some(c[1].to_string()),
        })
        .collect();
    images.dedup();
    images.truncate(60);
    let title = TITLE.captures(html).map(|c| c[1].trim().to_string()).unwrap_or_default();
    let stripped = SCRIPT.replace_all(html, " ");
    let stripped = stripped
        .replace("</p>", "\n")
        .replace("<br>", "\n")
        .replace("</h1>", "\n")
        .replace("</h2>", "\n")
        .replace("</li>", "\n")
        .replace("</div>", "\n");
    let text = TAG.replace_all(&stripped, " ");
    let text = text
        .replace("&nbsp;", " ")
        .replace("&amp;", "&")
        .replace("&quot;", "\"")
        .replace("&#39;", "'");
    let lines: Vec<String> = text
        .lines()
        .map(|l| l.split_whitespace().collect::<Vec<_>>().join(" "))
        .filter(|l| !l.is_empty())
        .collect();
    format!(
        "Title: {title}\n\n{}\n\nImages:\n{}",
        lines.join("\n"),
        images.join("\n")
    )
}

#[async_trait]
impl McpClientTrait for OdTools {
    async fn list_tools(
        &self,
        _session_id: &str,
        _next_cursor: Option<String>,
        _cancel_token: CancellationToken,
    ) -> Result<ListToolsResult, McpError> {
        Ok(ListToolsResult::with_all_items(Self::tools()))
    }

    async fn call_tool(
        &self,
        ctx: &ToolCallContext,
        name: &str,
        arguments: Option<JsonObject>,
        cancel_token: CancellationToken,
    ) -> Result<CallToolResult, McpError> {
        let work = self.dispatch(ctx, name, arguments);
        tokio::select! {
            out = work => match out {
                Ok(s) => text(s),
                Err(e) => fail(e),
            },
            _ = cancel_token.cancelled() => Err(McpError::McpError(ErrorData::internal_error("cancelled", None))),
        }
    }

    fn get_info(&self) -> Option<&InitializeResult> {
        Some(&self.info)
    }
}
