//! The REST + SSE API: projects, conversations, messages, runs, files,
//! preview, export and the content library.

use std::convert::Infallible;
use std::path::Path as FsPath;
use std::time::Duration;

use axum::body::Body;
use axum::extract::{Multipart, Path, Query, Request, State};
use axum::http::{HeaderMap, HeaderValue, StatusCode, header};
use axum::middleware::Next;
use axum::response::sse::{Event, KeepAlive, Sse};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use futures::Stream;
use serde::Deserialize;
use serde_json::{Value, json};

use crate::agent::{self, TurnRequest};
use crate::db::{self, Conversation, Project};
use crate::export;
use crate::files;
use crate::runs::RunStatus;
use crate::state::AppState;
use crate::util::{is_safe_id, new_id, now_ms};

pub struct ApiError(StatusCode, String, &'static str);

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        (
            self.0,
            Json(json!({ "error": { "code": self.2, "message": self.1 } })),
        )
            .into_response()
    }
}

impl From<anyhow::Error> for ApiError {
    fn from(e: anyhow::Error) -> Self {
        ApiError(StatusCode::INTERNAL_SERVER_ERROR, format!("{e:#}"), "INTERNAL")
    }
}

impl From<sqlx::Error> for ApiError {
    fn from(e: sqlx::Error) -> Self {
        ApiError(StatusCode::INTERNAL_SERVER_ERROR, e.to_string(), "INTERNAL")
    }
}

type ApiResult<T> = Result<T, ApiError>;

fn not_found(what: &str) -> ApiError {
    ApiError(StatusCode::NOT_FOUND, format!("{what} not found"), "NOT_FOUND")
}

fn bad_request(msg: impl Into<String>) -> ApiError {
    ApiError(StatusCode::BAD_REQUEST, msg.into(), "BAD_REQUEST")
}

pub fn router(state: AppState) -> Router {
    let api = Router::new()
        .route("/health", get(|| async { Json(json!({ "ok": true })) }))
        .route("/version", get(|| async { Json(json!({ "version": env!("CARGO_PKG_VERSION") })) }))
        .route("/config", get(get_config))
        .route("/settings", get(get_settings).put(put_settings))
        .route("/settings/models", post(list_provider_models))
        .route("/skills", get(list_skills))
        .route("/skills/{id}", get(get_skill))
        .route("/skills/{id}/example", get(skill_example))
        .route("/skills/{id}/files/{*path}", get(skill_file))
        .route("/design-systems", get(list_design_systems))
        .route("/design-systems/{id}", get(get_design_system))
        .route("/design-systems/{id}/files/{*path}", get(design_system_file))
        .route("/craft", get(list_craft))
        .route("/prompt-templates", get(list_prompt_templates))
        .route("/projects", get(list_projects).post(create_project))
        .route("/projects/{id}", get(get_project).patch(patch_project).delete(delete_project))
        .route("/projects/{id}/events", get(project_events))
        .route("/projects/{id}/conversations", get(list_conversations).post(create_conversation))
        .route("/projects/{id}/conversations/{cid}", axum::routing::patch(patch_conversation).delete(delete_conversation))
        .route("/projects/{id}/conversations/{cid}/messages", get(list_messages))
        .route("/projects/{id}/files", get(list_files).post(write_file))
        .route("/projects/{id}/files/{*path}", get(raw_file).delete(delete_file))
        .route("/projects/{id}/raw/{*path}", get(raw_file))
        .route("/projects/{id}/upload", post(upload))
        .route("/projects/{id}/archive", get(archive))
        .route("/projects/{id}/export/html", post(export_html))
        .route("/runs", get(list_runs).post(create_run))
        .route("/runs/{id}", get(get_run))
        .route("/runs/{id}/events", get(run_events))
        .route("/runs/{id}/cancel", post(cancel_run))
        .layer(axum::extract::DefaultBodyLimit::max(64 * 1024 * 1024))
        .layer(axum::middleware::from_fn(require_token));
    Router::new().nest("/api", api).with_state(state)
}

/// The preview origin: project files, skill examples and design-system files,
/// read-only, on a port of their own. A different origin is what isolates
/// agent-written HTML from the studio, so these responses carry no sandbox
/// CSP and the studio may frame them with `allow-same-origin`.
pub fn preview_router(state: AppState) -> Router {
    Router::new()
        .route("/p/{id}/{*path}", get(preview_project_file))
        .route("/skills/{id}/example", get(preview_skill_example))
        .route("/skills/{id}/files/{*path}", get(preview_skill_file))
        .route("/design-systems/{id}/files/{*path}", get(preview_design_system_file))
        .layer(axum::middleware::from_fn(require_token))
        .with_state(state)
}

async fn preview_project_file(State(s): State<AppState>, Path((id, path)): Path<(String, String)>, headers: HeaderMap) -> ApiResult<Response> {
    load_project(&s, &id).await?;
    serve_file(&s.project_dir(&id), &path, &headers, false).await
}

async fn preview_skill_example(State(s): State<AppState>, Path(id): Path<String>) -> ApiResult<Response> {
    let skill = s.library.skills.get(&id).ok_or_else(|| not_found("skill"))?;
    let path = s.library.skill_example(skill).ok_or_else(|| not_found("example"))?;
    let rel = path
        .strip_prefix(&skill.dir)
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_default();
    let html = tokio::fs::read_to_string(&path).await.map_err(|_| not_found("example"))?;
    Ok(html_with_base(&html, &format!("/skills/{id}/files/{}", parent_dir(&rel)), false))
}

async fn preview_skill_file(State(s): State<AppState>, Path((id, path)): Path<(String, String)>, headers: HeaderMap) -> ApiResult<Response> {
    let skill = s.library.skills.get(&id).ok_or_else(|| not_found("skill"))?;
    serve_file(&skill.dir, &path, &headers, false).await
}

async fn preview_design_system_file(State(s): State<AppState>, Path((id, path)): Path<(String, String)>, headers: HeaderMap) -> ApiResult<Response> {
    let ds = s.library.design_systems.get(&id).ok_or_else(|| not_found("design system"))?;
    serve_file(&ds.dir, &path, &headers, false).await
}

/// When `OD_API_TOKEN` is set, every API call needs it as a bearer token
/// (or `?token=` for EventSource, iframes and downloads).
async fn require_token(req: Request, next: Next) -> Response {
    let Ok(expected) = std::env::var("OD_API_TOKEN") else {
        return next.run(req).await;
    };
    if expected.is_empty() || req.uri().path().ends_with("/health") {
        return next.run(req).await;
    }
    let bearer = req
        .headers()
        .get(header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "))
        .map(str::to_string);
    let query = req.uri().query().and_then(|q| {
        q.split('&')
            .find_map(|kv| kv.strip_prefix("token=").map(str::to_string))
    });
    if bearer.as_deref() == Some(expected.as_str()) || query.as_deref() == Some(expected.as_str()) {
        next.run(req).await
    } else {
        ApiError(StatusCode::UNAUTHORIZED, "missing or wrong API token".into(), "UNAUTHORIZED").into_response()
    }
}

async fn get_config(State(s): State<AppState>) -> Json<Value> {
    let m = s.harness.models();
    Json(json!({
        "models": m.models,
        "defaultModel": m.default_model,
        "previewPort": s.config.preview_port,
        "previewOrigin": s.config.preview_origin,
    }))
}

// ---------- settings ----------

fn settings_json(s: &AppState) -> Value {
    let stored = crate::config::load_stored(&s.config.data_dir);
    let m = s.harness.models();
    json!({
        "protocol": m.protocol,
        "baseUrl": stored.base_url.unwrap_or_default(),
        "effectiveBaseUrl": m.base_url,
        "model": m.default_model,
        "models": m.models,
        "hasKey": !m.api_key.is_empty(),
    })
}

async fn get_settings(State(s): State<AppState>) -> Json<Value> {
    Json(settings_json(&s))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PutSettings {
    protocol: crate::config::Protocol,
    base_url: Option<String>,
    model: String,
    #[serde(default)]
    models: Vec<String>,
    /// Omit to keep the saved key; "" clears it.
    api_key: Option<String>,
}

async fn put_settings(State(s): State<AppState>, Json(body): Json<PutSettings>) -> ApiResult<Json<Value>> {
    let stored = crate::config::StoredModel {
        protocol: Some(body.protocol),
        base_url: body.base_url.map(|b| b.trim().to_string()).filter(|b| !b.is_empty()),
        model: Some(body.model.trim().to_string()).filter(|m| !m.is_empty()),
        models: body.models.into_iter().map(|m| m.trim().to_string()).filter(|m| !m.is_empty()).collect(),
    };
    crate::config::save_stored(&s.config.data_dir, &stored, body.api_key.as_deref())?;
    s.harness.set_models(crate::config::ModelSettings::load(&s.config.data_dir)?);
    Ok(Json(settings_json(&s)))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ModelsQuery {
    protocol: crate::config::Protocol,
    base_url: Option<String>,
    api_key: Option<String>,
}

/// Ask the provider which models it offers, for the settings picker. Uses the
/// key in the request, or the saved one.
async fn list_provider_models(State(s): State<AppState>, Json(q): Json<ModelsQuery>) -> ApiResult<Json<Value>> {
    use crate::config::Protocol;
    let saved = s.harness.models();
    let key = q.api_key.filter(|k| !k.is_empty()).unwrap_or(saved.api_key);
    let base = q
        .base_url
        .map(|b| b.trim().trim_end_matches('/').to_string())
        .filter(|b| !b.is_empty())
        .unwrap_or_else(|| match q.protocol {
            Protocol::Gemini => "https://generativelanguage.googleapis.com/v1beta/openai".into(),
            Protocol::Anthropic => "https://api.anthropic.com".into(),
            Protocol::OpenAi => saved.base_url.clone(),
        });
    if base.is_empty() {
        return Err(bad_request("enter the endpoint's base URL first"));
    }
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(15))
        .build()
        .map_err(anyhow::Error::from)?;
    let req = match q.protocol {
        Protocol::Gemini => client.get(format!("{base}/models")).bearer_auth(&key),
        Protocol::OpenAi => client.get(format!("{base}/v1/models")).bearer_auth(&key),
        Protocol::Anthropic => client
            .get(format!("{base}/v1/models"))
            .header("x-api-key", &key)
            .header("anthropic-version", "2023-06-01"),
    };
    let resp = req.send().await.map_err(|e| bad_request(format!("could not reach the provider: {e}")))?;
    let status = resp.status();
    let body: Value = resp.json().await.unwrap_or(Value::Null);
    if !status.is_success() {
        let msg = body
            .pointer("/error/message")
            .or_else(|| body.pointer("/0/error/message"))
            .and_then(Value::as_str)
            .unwrap_or("request failed");
        return Err(bad_request(format!("provider said {status}: {msg}")));
    }
    let mut ids: Vec<String> = body
        .get("data")
        .and_then(Value::as_array)
        .map(|list| {
            list.iter()
                .filter_map(|m| m.get("id").and_then(Value::as_str))
                .map(|id| id.trim_start_matches("models/").to_string())
                .collect()
        })
        .unwrap_or_default();
    ids.sort();
    ids.dedup();
    Ok(Json(json!({ "models": ids })))
}

// ---------- content library ----------

async fn list_skills(State(s): State<AppState>) -> Json<Value> {
    let skills: Vec<&crate::content::Skill> = s.library.skills.values().collect();
    Json(json!({ "skills": skills }))
}

async fn get_skill(State(s): State<AppState>, Path(id): Path<String>) -> ApiResult<Json<Value>> {
    let skill = s.library.skills.get(&id).ok_or_else(|| not_found("skill"))?;
    let mut v = serde_json::to_value(skill).unwrap_or(json!({}));
    v["body"] = json!(skill.body);
    v["hasExample"] = json!(s.library.skill_example(skill).is_some());
    Ok(Json(json!({ "skill": v })))
}

async fn skill_example(State(s): State<AppState>, Path(id): Path<String>) -> ApiResult<Response> {
    let skill = s.library.skills.get(&id).ok_or_else(|| not_found("skill"))?;
    let path = s.library.skill_example(skill).ok_or_else(|| not_found("example"))?;
    let rel = path
        .strip_prefix(&skill.dir)
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_default();
    let base = format!("/api/skills/{id}/files/{}", parent_dir(&rel));
    let html = tokio::fs::read_to_string(&path).await.map_err(|_| not_found("example"))?;
    Ok(html_with_base(&html, &base, true))
}

async fn skill_file(State(s): State<AppState>, Path((id, path)): Path<(String, String)>) -> ApiResult<Response> {
    let skill = s.library.skills.get(&id).ok_or_else(|| not_found("skill"))?;
    serve_file(&skill.dir, &path, &HeaderMap::new(), true).await
}

async fn list_design_systems(State(s): State<AppState>) -> Json<Value> {
    let list: Vec<&crate::content::DesignSystem> = s.library.design_systems.values().collect();
    Json(json!({ "designSystems": list }))
}

async fn get_design_system(State(s): State<AppState>, Path(id): Path<String>) -> ApiResult<Json<Value>> {
    let ds = s.library.design_systems.get(&id).ok_or_else(|| not_found("design system"))?;
    let mut v = serde_json::to_value(ds).unwrap_or(json!({}));
    v["designMd"] = json!(ds.design_md());
    v["tokensCss"] = json!(ds.tokens_css());
    v["manifest"] = ds.manifest.clone();
    Ok(Json(json!({ "designSystem": v })))
}

async fn design_system_file(State(s): State<AppState>, Path((id, path)): Path<(String, String)>) -> ApiResult<Response> {
    let ds = s.library.design_systems.get(&id).ok_or_else(|| not_found("design system"))?;
    serve_file(&ds.dir, &path, &HeaderMap::new(), true).await
}

async fn list_craft(State(s): State<AppState>) -> Json<Value> {
    let craft: Vec<&String> = s.library.craft.keys().collect();
    Json(json!({ "craft": craft }))
}

async fn list_prompt_templates(State(s): State<AppState>) -> Json<Value> {
    Json(json!({ "promptTemplates": s.library.prompt_templates }))
}

// ---------- projects ----------

async fn project_status(s: &AppState, p: &Project) -> Value {
    let latest = s.runs.list(Some(&p.id), None).into_iter().next();
    match latest {
        Some(r) => json!({ "value": r.status, "updatedAt": r.updated_at, "runId": r.id }),
        None => json!({ "value": "not_started" }),
    }
}

async fn project_json(s: &AppState, p: &Project) -> Value {
    let mut v = serde_json::to_value(p).unwrap_or(json!({}));
    v["status"] = project_status(s, p).await;
    v
}

async fn list_projects(State(s): State<AppState>) -> ApiResult<Json<Value>> {
    let projects = db::list_projects(&s.db).await?;
    let mut out = Vec::with_capacity(projects.len());
    for p in &projects {
        out.push(project_json(&s, p).await);
    }
    Ok(Json(json!({ "projects": out })))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateProject {
    id: Option<String>,
    name: Option<String>,
    skill_id: Option<String>,
    design_system_id: Option<String>,
    pending_prompt: Option<String>,
    metadata: Option<Value>,
    custom_instructions: Option<String>,
    session_mode: Option<String>,
}

async fn create_project(State(s): State<AppState>, Json(body): Json<CreateProject>) -> ApiResult<Json<Value>> {
    let id = body.id.unwrap_or_else(new_id);
    if !is_safe_id(&id) {
        return Err(bad_request("project id must match [A-Za-z0-9._-]{1,128}"));
    }
    if db::get_project(&s.db, &id).await?.is_some() {
        return Err(ApiError(StatusCode::CONFLICT, "project exists".into(), "CONFLICT"));
    }
    let now = now_ms();
    let name = body
        .name
        .filter(|n| !n.trim().is_empty())
        .or_else(|| body.pending_prompt.as_deref().map(summarize_name))
        .unwrap_or_else(|| "Untitled".to_string());
    let project = Project {
        id: id.clone(),
        name,
        skill_id: body.skill_id,
        design_system_id: body.design_system_id,
        pending_prompt: body.pending_prompt,
        metadata: body.metadata.unwrap_or(json!({ "kind": "prototype" })),
        custom_instructions: body.custom_instructions,
        created_at: now,
        updated_at: now,
    };
    tokio::fs::create_dir_all(s.project_dir(&id)).await.map_err(anyhow::Error::from)?;
    db::insert_project(&s.db, &project).await?;
    let conversation = Conversation {
        id: new_id(),
        project_id: id.clone(),
        title: None,
        session_mode: body.session_mode.unwrap_or_else(|| "design".into()),
        created_at: now,
        updated_at: now,
        message_count: 0,
    };
    db::insert_conversation(&s.db, &conversation).await?;
    Ok(Json(json!({ "project": project_json(&s, &project).await, "conversationId": conversation.id })))
}

/// A project name from the first prompt: its first few words.
fn summarize_name(prompt: &str) -> String {
    let words: Vec<&str> = prompt.split_whitespace().take(6).collect();
    let mut name = words.join(" ");
    if name.chars().count() > 48 {
        name = name.chars().take(48).collect::<String>() + "…";
    }
    if name.is_empty() { "Untitled".into() } else { name }
}

async fn load_project(s: &AppState, id: &str) -> ApiResult<Project> {
    db::get_project(&s.db, id).await?.ok_or_else(|| not_found("project"))
}

async fn get_project(State(s): State<AppState>, Path(id): Path<String>) -> ApiResult<Json<Value>> {
    let p = load_project(&s, &id).await?;
    Ok(Json(json!({ "project": project_json(&s, &p).await })))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PatchProject {
    name: Option<String>,
    #[serde(default, with = "double_option")]
    skill_id: Option<Option<String>>,
    #[serde(default, with = "double_option")]
    design_system_id: Option<Option<String>>,
    #[serde(default, with = "double_option")]
    pending_prompt: Option<Option<String>>,
    metadata: Option<Value>,
    #[serde(default, with = "double_option")]
    custom_instructions: Option<Option<String>>,
}

mod double_option {
    use serde::{Deserialize, Deserializer};
    pub fn deserialize<'de, D, T>(d: D) -> Result<Option<Option<T>>, D::Error>
    where
        D: Deserializer<'de>,
        T: Deserialize<'de>,
    {
        Option::<T>::deserialize(d).map(Some)
    }
}

async fn patch_project(State(s): State<AppState>, Path(id): Path<String>, Json(body): Json<PatchProject>) -> ApiResult<Json<Value>> {
    let mut p = load_project(&s, &id).await?;
    if let Some(name) = body.name {
        p.name = name;
    }
    if let Some(v) = body.skill_id {
        p.skill_id = v;
    }
    if let Some(v) = body.design_system_id {
        p.design_system_id = v;
    }
    if let Some(v) = body.pending_prompt {
        p.pending_prompt = v;
    }
    if let Some(Value::Object(patch)) = body.metadata {
        if let Value::Object(meta) = &mut p.metadata {
            for (k, v) in patch {
                meta.insert(k, v);
            }
        }
    }
    if let Some(v) = body.custom_instructions {
        p.custom_instructions = v;
    }
    p.updated_at = now_ms();
    db::update_project(&s.db, &p).await?;
    Ok(Json(json!({ "project": project_json(&s, &p).await })))
}

async fn delete_project(State(s): State<AppState>, Path(id): Path<String>) -> ApiResult<Json<Value>> {
    load_project(&s, &id).await?;
    s.runs.cancel_project(&id);
    db::delete_project(&s.db, &id).await?;
    let dir = s.project_dir(&id);
    if dir.starts_with(s.config.projects_dir()) && dir != s.config.projects_dir() {
        let _ = tokio::fs::remove_dir_all(dir).await;
    }
    Ok(Json(json!({ "ok": true })))
}

async fn project_events(
    State(s): State<AppState>,
    Path(id): Path<String>,
) -> ApiResult<Sse<impl Stream<Item = Result<Event, Infallible>>>> {
    load_project(&s, &id).await?;
    let mut rx = s.events.subscribe(&id);
    let ready = json!({ "projectId": id });
    let stream = async_stream::stream! {
        yield Ok(Event::default().event("ready").data(ready.to_string()));
        loop {
            match rx.recv().await {
                Ok((event, data)) => yield Ok(Event::default().event(event).data(data.to_string())),
                Err(tokio::sync::broadcast::error::RecvError::Lagged(_)) => continue,
                Err(_) => break,
            }
        }
    };
    Ok(Sse::new(stream).keep_alive(KeepAlive::new().interval(Duration::from_secs(20))))
}

// ---------- conversations ----------

async fn list_conversations(State(s): State<AppState>, Path(id): Path<String>) -> ApiResult<Json<Value>> {
    load_project(&s, &id).await?;
    let list = db::list_conversations(&s.db, &id).await?;
    Ok(Json(json!({ "conversations": list })))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateConversation {
    title: Option<String>,
    session_mode: Option<String>,
}

async fn create_conversation(State(s): State<AppState>, Path(id): Path<String>, Json(body): Json<CreateConversation>) -> ApiResult<Json<Value>> {
    load_project(&s, &id).await?;
    let now = now_ms();
    let c = Conversation {
        id: new_id(),
        project_id: id,
        title: body.title,
        session_mode: body.session_mode.unwrap_or_else(|| "design".into()),
        created_at: now,
        updated_at: now,
        message_count: 0,
    };
    db::insert_conversation(&s.db, &c).await?;
    Ok(Json(json!({ "conversation": c })))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PatchConversation {
    title: Option<String>,
    session_mode: Option<String>,
}

async fn patch_conversation(State(s): State<AppState>, Path((_id, cid)): Path<(String, String)>, Json(body): Json<PatchConversation>) -> ApiResult<Json<Value>> {
    db::update_conversation(&s.db, &cid, body.title.as_deref(), body.session_mode.as_deref()).await?;
    let c = db::get_conversation(&s.db, &cid).await?.ok_or_else(|| not_found("conversation"))?;
    Ok(Json(json!({ "conversation": c })))
}

async fn delete_conversation(State(s): State<AppState>, Path((_id, cid)): Path<(String, String)>) -> ApiResult<Json<Value>> {
    db::delete_conversation(&s.db, &cid).await?;
    Ok(Json(json!({ "ok": true })))
}

async fn list_messages(State(s): State<AppState>, Path((_id, cid)): Path<(String, String)>) -> ApiResult<Json<Value>> {
    let messages = db::list_messages(&s.db, &cid).await?;
    Ok(Json(json!({ "messages": messages })))
}

// ---------- files ----------

async fn list_files(State(s): State<AppState>, Path(id): Path<String>) -> ApiResult<Json<Value>> {
    load_project(&s, &id).await?;
    let root = s.project_dir(&id);
    tokio::fs::create_dir_all(&root).await.map_err(anyhow::Error::from)?;
    let root = root.canonicalize().map_err(anyhow::Error::from)?;
    let list = tokio::task::spawn_blocking(move || files::list(&root))
        .await
        .map_err(anyhow::Error::from)?;
    Ok(Json(json!({ "files": list })))
}

async fn raw_file(State(s): State<AppState>, Path((id, path)): Path<(String, String)>, headers: HeaderMap) -> ApiResult<Response> {
    load_project(&s, &id).await?;
    serve_file(&s.project_dir(&id), &path, &headers, true).await
}

#[derive(Deserialize)]
struct WriteFile {
    name: String,
    content: String,
    encoding: Option<String>,
}

async fn write_file(State(s): State<AppState>, Path(id): Path<String>, Json(body): Json<WriteFile>) -> ApiResult<Json<Value>> {
    load_project(&s, &id).await?;
    let name = files::sanitize_name(&body.name);
    let bytes = match body.encoding.as_deref() {
        Some("base64") => {
            use base64::Engine;
            base64::engine::general_purpose::STANDARD
                .decode(body.content.as_bytes())
                .map_err(|e| bad_request(e.to_string()))?
        }
        _ => body.content.into_bytes(),
    };
    let file = save(&s, &id, &name, &bytes).await?;
    Ok(Json(json!({ "file": file })))
}

async fn save(s: &AppState, id: &str, name: &str, bytes: &[u8]) -> ApiResult<files::ProjectFile> {
    if name.split('/').any(|seg| seg.starts_with('.')) {
        return Err(bad_request("hidden paths are reserved"));
    }
    let root = s.project_dir(id);
    tokio::fs::create_dir_all(&root).await.map_err(anyhow::Error::from)?;
    let path = files::resolve(&root, name).map_err(|e| bad_request(e.to_string()))?;
    let existed = path.exists();
    if let Some(parent) = path.parent() {
        tokio::fs::create_dir_all(parent).await.map_err(anyhow::Error::from)?;
    }
    tokio::fs::write(&path, bytes).await.map_err(anyhow::Error::from)?;
    s.events.file_changed(id, name, if existed { "change" } else { "add" });
    let root = root.canonicalize().map_err(anyhow::Error::from)?;
    files::describe(&root, &path).ok_or_else(|| not_found("file"))
}

async fn upload(State(s): State<AppState>, Path(id): Path<String>, mut form: Multipart) -> ApiResult<Json<Value>> {
    load_project(&s, &id).await?;
    let mut dir = String::new();
    let mut saved = Vec::new();
    while let Some(field) = form.next_field().await.map_err(|e| bad_request(e.to_string()))? {
        match field.name() {
            Some("dir") => dir = files::sanitize_name(&field.text().await.unwrap_or_default()),
            Some("files") | Some("file") => {
                let name = files::sanitize_name(field.file_name().unwrap_or("upload"));
                let bytes = field.bytes().await.map_err(|e| bad_request(e.to_string()))?;
                let rel = if dir.is_empty() { name } else { format!("{dir}/{name}") };
                saved.push(save(&s, &id, &rel, &bytes).await?);
                if saved.len() >= 12 {
                    break;
                }
            }
            _ => {}
        }
    }
    Ok(Json(json!({ "files": saved })))
}

async fn delete_file(State(s): State<AppState>, Path((id, path)): Path<(String, String)>) -> ApiResult<Json<Value>> {
    load_project(&s, &id).await?;
    if path.split('/').any(|seg| seg.starts_with('.')) {
        return Err(bad_request("hidden paths are reserved"));
    }
    let abs = files::resolve(&s.project_dir(&id), &path).map_err(|e| bad_request(e.to_string()))?;
    tokio::fs::remove_file(&abs).await.map_err(|_| not_found("file"))?;
    s.events.file_changed(&id, &path, "unlink");
    Ok(Json(json!({ "ok": true })))
}

/// Serve a file from `root`. HTML is sent with a sandbox CSP so a preview
/// can never act with the studio's origin even if opened directly.
async fn serve_file(root: &FsPath, rel: &str, headers: &HeaderMap, sandbox: bool) -> ApiResult<Response> {
    let path = files::resolve(root, rel).map_err(|e| bad_request(e.to_string()))?;
    if !path.is_file() {
        return Err(not_found("file"));
    }
    let bytes = tokio::fs::read(&path).await.map_err(|_| not_found("file"))?;
    let mime = mime_guess::from_path(&path).first_or_octet_stream();
    let total = bytes.len() as u64;
    let mut resp_headers = HeaderMap::new();
    resp_headers.insert(header::CONTENT_TYPE, HeaderValue::from_str(mime.as_ref()).unwrap_or(HeaderValue::from_static("application/octet-stream")));
    resp_headers.insert(header::CACHE_CONTROL, HeaderValue::from_static("no-cache"));
    resp_headers.insert(header::ACCEPT_RANGES, HeaderValue::from_static("bytes"));
    resp_headers.insert("access-control-allow-origin", HeaderValue::from_static("*"));
    if sandbox && mime.essence_str() == "text/html" {
        resp_headers.insert(
            "content-security-policy",
            HeaderValue::from_static("sandbox allow-scripts allow-popups allow-forms allow-modals allow-downloads"),
        );
    }
    if let Some(range) = headers.get(header::RANGE).and_then(|v| v.to_str().ok()) {
        if let Some((start, end)) = parse_range(range, total) {
            let slice = bytes[start as usize..=end as usize].to_vec();
            resp_headers.insert(header::CONTENT_RANGE, HeaderValue::from_str(&format!("bytes {start}-{end}/{total}")).unwrap());
            return Ok((StatusCode::PARTIAL_CONTENT, resp_headers, Body::from(slice)).into_response());
        }
    }
    Ok((StatusCode::OK, resp_headers, Body::from(bytes)).into_response())
}

fn parse_range(range: &str, total: u64) -> Option<(u64, u64)> {
    let spec = range.strip_prefix("bytes=")?;
    let (a, b) = spec.split_once('-')?;
    if total == 0 {
        return None;
    }
    let (start, end) = if a.is_empty() {
        let n: u64 = b.parse().ok()?;
        (total.saturating_sub(n), total - 1)
    } else {
        let start: u64 = a.parse().ok()?;
        let end = if b.is_empty() { total - 1 } else { b.parse::<u64>().ok()?.min(total - 1) };
        (start, end)
    };
    (start <= end).then_some((start, end))
}

fn parent_dir(rel: &str) -> String {
    match rel.rsplit_once('/') {
        Some((dir, _)) => format!("{dir}/"),
        None => String::new(),
    }
}

/// Insert a `<base href>` so a page's relative assets resolve under `base`.
fn html_with_base(html: &str, base: &str, sandbox: bool) -> Response {
    let tag = format!("<base href=\"{base}\">");
    let out = if let Some(pos) = html.to_ascii_lowercase().find("<head") {
        let close = html[pos..].find('>').map(|i| pos + i + 1).unwrap_or(pos);
        format!("{}{tag}{}", &html[..close], &html[close..])
    } else {
        format!("{tag}{html}")
    };
    let mut resp = ([(header::CONTENT_TYPE, "text/html; charset=utf-8")], out).into_response();
    if sandbox {
        resp.headers_mut().insert(
            "content-security-policy",
            HeaderValue::from_static("sandbox allow-scripts allow-popups"),
        );
    }
    resp
}

async fn archive(State(s): State<AppState>, Path(id): Path<String>) -> ApiResult<Response> {
    let p = load_project(&s, &id).await?;
    let root = s.project_dir(&id).canonicalize().map_err(anyhow::Error::from)?;
    let bytes = tokio::task::spawn_blocking(move || export::zip_project(&root))
        .await
        .map_err(anyhow::Error::from)??;
    let name = format!("{}.zip", files::sanitize_name(&p.name));
    Ok((
        [
            (header::CONTENT_TYPE, "application/zip".to_string()),
            (header::CONTENT_DISPOSITION, format!("attachment; filename=\"{name}\"")),
        ],
        bytes,
    )
        .into_response())
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ExportHtml {
    file_name: String,
}

async fn export_html(State(s): State<AppState>, Path(id): Path<String>, Json(body): Json<ExportHtml>) -> ApiResult<Response> {
    load_project(&s, &id).await?;
    let root = s.project_dir(&id).canonicalize().map_err(anyhow::Error::from)?;
    let file = body.file_name.clone();
    let html = tokio::task::spawn_blocking(move || export::standalone_html(&root, &file))
        .await
        .map_err(anyhow::Error::from)?
        .map_err(|e| bad_request(format!("{e:#}")))?;
    let name = FsPath::new(&body.file_name)
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "export.html".into());
    Ok((
        [
            (header::CONTENT_TYPE, "text/html; charset=utf-8".to_string()),
            (header::CONTENT_DISPOSITION, format!("attachment; filename=\"{name}\"")),
            (header::HeaderName::from_static("content-security-policy"), "sandbox allow-scripts".to_string()),
        ],
        html,
    )
        .into_response())
}

// ---------- runs ----------

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateRun {
    project_id: String,
    conversation_id: String,
    message: String,
    user_message_id: Option<String>,
    assistant_message_id: Option<String>,
    #[serde(default)]
    attachments: Vec<String>,
    model: Option<String>,
    skill_id: Option<String>,
    design_system_id: Option<String>,
    session_mode: Option<String>,
    locale: Option<String>,
}

async fn create_run(State(s): State<AppState>, Json(body): Json<CreateRun>) -> ApiResult<(StatusCode, Json<Value>)> {
    load_project(&s, &body.project_id).await?;
    let conversation = db::get_conversation(&s.db, &body.conversation_id)
        .await?
        .filter(|c| c.project_id == body.project_id)
        .ok_or_else(|| ApiError(StatusCode::NOT_FOUND, "conversation not found".into(), "CONVERSATION_NOT_FOUND"))?;
    if s.runs.active_for_conversation(&conversation.id).is_some() {
        return Err(ApiError(StatusCode::CONFLICT, "a run is already active in this conversation".into(), "RUN_ACTIVE"));
    }
    if body.message.trim().is_empty() {
        return Err(bad_request("message is empty"));
    }
    let now = now_ms();
    let run_id = format!("run-{}", new_id());
    let assistant_message_id = body.assistant_message_id.unwrap_or_else(new_id);
    let run = s.runs.create(RunStatus {
        id: run_id.clone(),
        project_id: body.project_id.clone(),
        conversation_id: conversation.id.clone(),
        assistant_message_id: assistant_message_id.clone(),
        status: "queued".into(),
        created_at: now,
        updated_at: now,
        terminal_at: None,
        error: None,
    });
    let req = TurnRequest {
        project_id: body.project_id,
        conversation_id: conversation.id.clone(),
        user_message_id: body.user_message_id.unwrap_or_else(new_id),
        assistant_message_id: assistant_message_id.clone(),
        text: body.message,
        attachments: body.attachments,
        model: body.model,
        skill_id: body.skill_id,
        design_system_id: body.design_system_id,
        session_mode: body.session_mode,
        locale: body.locale,
    };
    tokio::spawn(agent::execute(s.clone(), run, req));
    Ok((
        StatusCode::ACCEPTED,
        Json(json!({ "runId": run_id, "conversationId": conversation.id, "assistantMessageId": assistant_message_id })),
    ))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RunQuery {
    project_id: Option<String>,
    conversation_id: Option<String>,
    status: Option<String>,
}

async fn list_runs(State(s): State<AppState>, Query(q): Query<RunQuery>) -> Json<Value> {
    let runs: Vec<RunStatus> = s
        .runs
        .list(q.project_id.as_deref(), q.conversation_id.as_deref())
        .into_iter()
        .filter(|r| match q.status.as_deref() {
            Some("active") => r.terminal_at.is_none(),
            Some(st) => r.status == st,
            None => true,
        })
        .collect();
    Json(json!({ "runs": runs }))
}

async fn get_run(State(s): State<AppState>, Path(id): Path<String>) -> ApiResult<Json<Value>> {
    let run = s.runs.get(&id).ok_or_else(|| not_found("run"))?;
    let status = run.status.lock().unwrap().clone();
    Ok(Json(serde_json::to_value(status).unwrap_or(json!({}))))
}

#[derive(Deserialize)]
struct AfterQuery {
    after: Option<u64>,
}

async fn run_events(
    State(s): State<AppState>,
    Path(id): Path<String>,
    Query(q): Query<AfterQuery>,
    headers: HeaderMap,
) -> ApiResult<Sse<impl Stream<Item = Result<Event, Infallible>>>> {
    let run = s.runs.get(&id).ok_or_else(|| not_found("run"))?;
    let after = headers
        .get("last-event-id")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.parse().ok())
        .or(q.after)
        .unwrap_or(0);
    let (backlog, mut rx, terminal) = run.subscribe(after);
    let stream = async_stream::stream! {
        let mut last = after;
        for ev in backlog {
            last = ev.id;
            let end = ev.event == "end";
            yield Ok(Event::default().id(ev.id.to_string()).event(ev.event).data(ev.data.to_string()));
            if end { return; }
        }
        if terminal { return; }
        loop {
            match rx.recv().await {
                Ok(ev) => {
                    if ev.id <= last { continue; }
                    last = ev.id;
                    let end = ev.event == "end";
                    yield Ok(Event::default().id(ev.id.to_string()).event(ev.event).data(ev.data.to_string()));
                    if end { break; }
                }
                Err(tokio::sync::broadcast::error::RecvError::Lagged(_)) => continue,
                Err(_) => break,
            }
        }
    };
    Ok(Sse::new(stream).keep_alive(KeepAlive::new().interval(Duration::from_secs(20))))
}

async fn cancel_run(State(s): State<AppState>, Path(id): Path<String>) -> ApiResult<Json<Value>> {
    let run = s.runs.get(&id).ok_or_else(|| not_found("run"))?;
    run.cancel.cancel();
    Ok(Json(json!({ "ok": true })))
}
