//! The harness: one goose `Agent` serving every conversation. Each
//! conversation is a goose session whose working directory is the project
//! folder; a run is one `reply` on that session.

use std::collections::HashSet;
use std::path::Path;
use std::sync::{Arc, Mutex};

use anyhow::{Context, Result};
use futures::StreamExt;
use goose::agents::{Agent, AgentConfig, AgentEvent, ExtensionConfig, GoosePlatform, SessionConfig};
use goose::config::{GooseMode, PermissionManager};
use goose::conversation::message::{Message, MessageContent};
use goose::providers::base::Provider;
use goose::session::{SessionManager, SessionType};
use goose_providers::anthropic::{ANTHROPIC_API_VERSION, AnthropicProviderBuilder};
use goose_providers::api_client::{ApiClient, AuthMethod};
use goose_providers::model::ModelConfig;
use goose_providers::openai::OpenAiProviderBuilder;
use serde_json::{Value, json};

use crate::config::{ModelSettings, Protocol};
use crate::markers::{Marker, MarkerScanner, strip_host_markers};
use crate::runs::Run;
use crate::state::AppState;
use crate::tools::{EXTENSION, OdTools, Scopes, SessionScope};
use crate::util::{new_turn_key, now_ms};
use crate::{db, files, prompt};

pub struct Harness {
    agent: Arc<Agent>,
    sessions: Arc<SessionManager>,
    pub scopes: Arc<Scopes>,
    tools: Arc<OdTools>,
    attached: Mutex<HashSet<String>>,
    model: ModelSettings,
}

impl Harness {
    pub fn new(goose_dir: &Path, model: ModelSettings, tools: Arc<OdTools>, scopes: Arc<Scopes>) -> Self {
        let sessions = Arc::new(SessionManager::new(goose_dir.join("data")));
        let permissions = Arc::new(PermissionManager::new(goose_dir.join("permissions")));
        let agent = Agent::with_config(AgentConfig::new(
            sessions.clone(),
            permissions,
            None,
            true,
            GoosePlatform::GooseDesktop,
        ));
        Self {
            agent,
            sessions,
            scopes,
            tools,
            attached: Mutex::new(HashSet::new()),
            model,
        }
    }

    pub fn models(&self) -> &ModelSettings {
        &self.model
    }

    fn provider(&self) -> Result<Arc<dyn Provider>> {
        let m = &self.model;
        if m.base_url.is_empty() {
            anyhow::bail!("No model endpoint is configured. Set OD_MODEL_BASE_URL (the model proxy), OD_MODEL and OD_MODEL_API_KEY, then restart the server.");
        }
        Ok(match m.protocol {
            Protocol::OpenAi | Protocol::Gemini => {
                let auth = if m.api_key.is_empty() {
                    AuthMethod::NoAuth
                } else {
                    AuthMethod::BearerToken(m.api_key.clone())
                };
                let client = ApiClient::new_with_tls(m.base_url.clone(), auth, None)?;
                Arc::new(
                    OpenAiProviderBuilder::new(client)
                        .base_path(m.chat_path.clone())
                        .name("openai")
                        .skip_canonical_filtering(true)
                        .build(),
                )
            }
            Protocol::Anthropic => {
                let client = ApiClient::new_with_tls(
                    m.base_url.clone(),
                    AuthMethod::ApiKey {
                        header_name: "x-api-key".into(),
                        key: m.api_key.clone(),
                    },
                    None,
                )?
                .with_header("anthropic-version", ANTHROPIC_API_VERSION)?;
                Arc::new(
                    AnthropicProviderBuilder::new(client)
                        .skip_canonical_filtering(true)
                        .build(),
                )
            }
        })
    }

    /// The goose session for a conversation, created on first use.
    async fn session_for(&self, state: &AppState, conversation_id: &str, root: &Path, name: &str) -> Result<String> {
        if let Some(id) = db::agent_session(&state.db, conversation_id).await? {
            if self.sessions.get_session(&id, false).await.is_ok() {
                return Ok(id);
            }
        }
        let session = self
            .sessions
            .create_session(root.to_path_buf(), name.to_string(), SessionType::User, GooseMode::Auto)
            .await?;
        db::set_agent_session(&state.db, conversation_id, &session.id).await?;
        Ok(session.id)
    }

    async fn prepare(&self, session_id: &str, model: &str, system_prompt: String) -> Result<()> {
        let config = ModelConfig::new(model)
            .with_context_limit(Some(self.model.context_limit))
            .with_max_tokens(Some(self.model.max_tokens));
        self.agent
            .update_provider(self.provider()?, config, session_id)
            .await?;
        self.sessions
            .update(session_id)
            .system_prompt_override(Some(prompt::as_literal_template(&system_prompt)))
            .apply()
            .await?;
        let first = self.attached.lock().unwrap().insert(session_id.to_string());
        if first {
            self.agent
                .extension_manager
                .add_client(
                    session_id,
                    ExtensionConfig::Builtin {
                        name: EXTENSION.into(),
                        description: "Project tools".into(),
                        display_name: Some("Studio".into()),
                        timeout: Some(300),
                        bundled: Some(true),
                        available_tools: vec![],
                    },
                    self.tools.clone(),
                    None,
                )
                .await;
        }
        Ok(())
    }
}

pub struct TurnRequest {
    pub project_id: String,
    pub conversation_id: String,
    pub user_message_id: String,
    pub assistant_message_id: String,
    pub text: String,
    pub attachments: Vec<String>,
    pub model: Option<String>,
    pub skill_id: Option<String>,
    pub design_system_id: Option<String>,
    pub session_mode: Option<String>,
    pub locale: Option<String>,
}

/// Run one turn to completion, emitting run events on `run`.
/// Both messages are saved before anything can fail, so a failed turn still
/// shows the user what they asked and why it did not run.
pub async fn execute(state: AppState, run: Arc<Run>, req: TurnRequest) {
    let started_at = now_ms();
    let mut assistant = db::ChatMessage {
        id: req.assistant_message_id.clone(),
        role: "assistant".into(),
        run_id: Some(run.status.lock().unwrap().id.clone()),
        run_status: Some("running".into()),
        started_at: Some(started_at),
        created_at: started_at + 1,
        ..Default::default()
    };
    let user = db::ChatMessage {
        id: req.user_message_id.clone(),
        role: "user".into(),
        content: req.text.clone(),
        attachments: req
            .attachments
            .iter()
            .map(|p| json!({ "path": p, "name": Path::new(p).file_name().map(|n| n.to_string_lossy().to_string()) }))
            .collect(),
        created_at: started_at,
        ..Default::default()
    };
    let saved = async {
        db::upsert_message(&state.db, &req.conversation_id, &user).await?;
        db::upsert_message(&state.db, &req.conversation_id, &assistant).await?;
        db::touch_project(&state.db, &req.project_id).await
    }
    .await;
    let result = match saved {
        Ok(()) => execute_inner(&state, &run, &req, &mut assistant).await,
        Err(e) => Err(e),
    };
    if let Err(err) = result {
        let message = format!("{err:#}");
        tracing::warn!(error = %message, "run failed");
        let status = if run.cancel.is_cancelled() { "canceled" } else { "failed" };
        assistant.events.push(json!({ "kind": "status", "label": "error", "detail": message }));
        assistant.run_status = Some(status.into());
        assistant.ended_at = Some(now_ms());
        let _ = db::upsert_message(&state.db, &req.conversation_id, &assistant).await;
        run.emit("error", json!({ "message": message }));
        run.set_status(status, Some(message));
        run.emit(
            "end",
            json!({ "status": status, "code": 1, "terminalAt": now_ms(), "artifactCount": 0, "artifactPaths": [] }),
        );
    }
}

async fn execute_inner(
    state: &AppState,
    run: &Arc<Run>,
    req: &TurnRequest,
    assistant: &mut db::ChatMessage,
) -> Result<()> {
    let harness = &state.harness;
    let project = db::get_project(&state.db, &req.project_id)
        .await?
        .context("project not found")?;
    let conversation = db::get_conversation(&state.db, &req.conversation_id)
        .await?
        .context("conversation not found")?;
    let root = state.project_dir(&project.id);
    tokio::fs::create_dir_all(&root).await?;

    let library = state.library.clone();
    let skill_id = req.skill_id.clone().or(project.skill_id.clone());
    let skill = skill_id.as_deref().and_then(|id| library.skills.get(id));
    let ds_id = req
        .design_system_id
        .clone()
        .or(project.design_system_id.clone());
    let design_system = ds_id.as_deref().and_then(|id| library.design_systems.get(id));
    if let Some(skill) = skill {
        stage_skill(&root, &skill.dir, &skill.id).await?;
    }

    let session_mode = req
        .session_mode
        .clone()
        .unwrap_or_else(|| conversation.session_mode.clone());
    let system = prompt::system_prompt(&prompt::PromptInputs {
        project: &project,
        session_mode: &session_mode,
        skill,
        design_system,
        library: &library,
        locale: req.locale.as_deref(),
    });

    let session_id = harness
        .session_for(state, &conversation.id, &root, &project.name)
        .await?;
    harness.scopes.set(
        &session_id,
        SessionScope {
            project_id: project.id.clone(),
            root: root.clone(),
            design_system: design_system.map(|d| d.id.clone()),
        },
    );
    let model = req
        .model
        .clone()
        .filter(|m| !m.is_empty())
        .unwrap_or_else(|| harness.model.default_model.clone());
    if model.is_empty() {
        anyhow::bail!("No model is configured. Set OD_MODEL (and OD_MODELS for the picker), then restart the server.");
    }
    harness.prepare(&session_id, &model, system).await?;

    let key = new_turn_key();
    let before = files::snapshot(&root);
    let listing = files::list(&root);
    let want_title = conversation.title.is_none();
    let mut text = prompt::turn_preamble(&key, &listing, want_title);
    text.push_str(&req.text);
    if !req.attachments.is_empty() {
        text.push_str("\n\nAttached files (project-relative paths):\n");
        for a in &req.attachments {
            text.push_str(&format!("- `{a}`\n"));
        }
    }

    run.set_status("running", None);
    run.emit(
        "start",
        json!({ "runId": run.status.lock().unwrap().id, "projectId": project.id, "model": model, "protocolVersion": 1 }),
    );
    run.emit("agent", json!({ "type": "done_key", "key": key }));
    state.events.publish(&project.id, "run-started", json!({ "conversationId": conversation.id }));

    let mut scanner = MarkerScanner::new(&key);
    let mut full_text = String::new();
    let mut events: Vec<Value> = vec![json!({ "kind": "done_key", "key": key })];
    let mut usage = json!(null);

    let stream = harness
        .agent
        .reply(
            Message::user().with_text(text),
            SessionConfig {
                id: session_id.clone(),
                schedule_id: None,
                max_turns: Some(80),
            },
            Some(run.cancel.clone()),
        )
        .await?;
    futures::pin_mut!(stream);
    let mut stream_error: Option<String> = None;
    while let Some(item) = stream.next().await {
        let ev = match item {
            Ok(ev) => ev,
            Err(err) => {
                stream_error = Some(format!("{err:#}"));
                break;
            }
        };
        match ev {
            AgentEvent::Message(m) => {
                for c in &m.content {
                    match c {
                        MessageContent::Text(t) if m.role == rmcp::model::Role::Assistant => {
                            if t.text.is_empty() {
                                continue;
                            }
                            full_text.push_str(&t.text);
                            push_text(&mut events, "text", &t.text);
                            run.emit("agent", json!({ "type": "text_delta", "delta": t.text }));
                            for marker in scanner.scan(&full_text) {
                                on_marker(state, run, &conversation.id, &project.id, marker, &mut events).await;
                            }
                        }
                        MessageContent::Thinking(th) => {
                            push_text(&mut events, "thinking", &th.thinking);
                            run.emit("agent", json!({ "type": "thinking_delta", "delta": th.thinking }));
                        }
                        MessageContent::ToolRequest(r) => {
                            let (name, input) = match &r.tool_call {
                                Ok(call) => (
                                    tool_name(&call.name),
                                    call.arguments.clone().map(Value::Object).unwrap_or(json!({})),
                                ),
                                Err(e) => ("invalid_tool_call".to_string(), json!({ "error": e.to_string() })),
                            };
                            let started = now_ms();
                            events.push(json!({ "kind": "tool_use", "id": r.id, "name": name, "input": input, "startedAt": started }));
                            run.emit("agent", json!({ "type": "tool_use", "id": r.id, "name": name, "input": input, "startedAt": started }));
                        }
                        MessageContent::ToolResponse(r) => {
                            let (content, is_error) = match &r.tool_result {
                                Ok(res) => (tool_output(res), res.is_error.unwrap_or(false)),
                                Err(e) => (e.message.to_string(), true),
                            };
                            let done = now_ms();
                            events.push(json!({ "kind": "tool_result", "toolUseId": r.id, "content": content, "isError": is_error, "completedAt": done }));
                            run.emit("agent", json!({ "type": "tool_result", "toolUseId": r.id, "content": content, "isError": is_error, "completedAt": done }));
                        }
                        MessageContent::SystemNotification(n) => {
                            run.emit("agent", json!({ "type": "status", "label": n.msg }));
                        }
                        MessageContent::Error(e) => {
                            events.push(json!({ "kind": "status", "label": "error", "detail": e.message }));
                            run.emit("agent", json!({ "type": "status", "label": "error", "detail": e.message }));
                        }
                        _ => {}
                    }
                }
            }
            AgentEvent::Usage(u) => {
                usage = json!({
                    "input_tokens": u.usage.input_tokens,
                    "output_tokens": u.usage.output_tokens,
                    "cost": u.cost,
                    "model": u.model,
                });
                run.emit("agent", json!({ "type": "usage", "usage": usage }));
            }
            _ => {}
        }
    }

    let after = files::snapshot(&root);
    let mut produced: Vec<String> = after
        .iter()
        .filter(|(path, meta)| before.get(*path) != Some(meta))
        .map(|(path, _)| path.clone())
        .collect();
    produced.sort();
    let produced_files: Vec<Value> = produced
        .iter()
        .filter_map(|p| files::describe(&root.canonicalize().ok()?, &root.canonicalize().ok()?.join(p)))
        .map(|f| serde_json::to_value(f).unwrap_or(Value::Null))
        .collect();

    let status = if run.cancel.is_cancelled() {
        "canceled"
    } else if stream_error.is_some() {
        "failed"
    } else {
        "succeeded"
    };
    if let Some(err) = &stream_error {
        events.push(json!({ "kind": "status", "label": "error", "detail": err }));
        run.emit("error", json!({ "message": err }));
    }
    if !usage.is_null() {
        events.push(json!({ "kind": "usage", "usage": usage }));
    }
    assistant.content = strip_host_markers(&full_text);
    assistant.events = events;
    assistant.produced_files = produced_files;
    assistant.run_status = Some(status.to_string());
    assistant.ended_at = Some(now_ms());
    db::upsert_message(&state.db, &conversation.id, assistant).await?;
    db::touch_project(&state.db, &project.id).await?;

    run.set_status(status, stream_error.clone());
    run.emit(
        "end",
        json!({
            "status": status,
            "code": if status == "succeeded" { 0 } else { 1 },
            "terminalAt": now_ms(),
            "artifactCount": produced.len(),
            "artifactPaths": produced,
        }),
    );
    state.events.publish(&project.id, "run-ended", json!({ "conversationId": conversation.id, "status": status }));
    Ok(())
}

/// Append streamed text to the last event of the same kind, so persisted
/// messages hold one text event per stretch instead of one per token.
fn push_text(events: &mut Vec<Value>, kind: &str, delta: &str) {
    if let Some(last) = events.last_mut() {
        if last.get("kind").and_then(Value::as_str) == Some(kind) {
            if let Some(Value::String(s)) = last.get_mut("text") {
                s.push_str(delta);
                return;
            }
        }
    }
    events.push(json!({ "kind": kind, "text": delta }));
}

async fn on_marker(
    state: &AppState,
    run: &Run,
    conversation_id: &str,
    project_id: &str,
    marker: Marker,
    events: &mut Vec<Value>,
) {
    match marker {
        Marker::Title(title) => {
            let _ = db::update_conversation(&state.db, conversation_id, Some(&title), None).await;
            events.push(json!({ "kind": "conversation_title", "title": title }));
            run.emit("agent", json!({ "type": "conversation_title", "title": title }));
            state.events.publish(project_id, "conversation-title", json!({ "conversationId": conversation_id, "title": title }));
        }
        Marker::NextSteps(list) => {
            events.retain(|e| e.get("kind").and_then(Value::as_str) != Some("next_steps"));
            events.push(json!({ "kind": "next_steps", "suggestions": list }));
            run.emit("agent", json!({ "type": "next_steps", "suggestions": list }));
        }
        Marker::Focus(f) => {
            events.push(json!({ "kind": "artifact_focus", "open": f.open, "show": f.show }));
            run.emit("agent", json!({ "type": "artifact_focus", "open": f.open, "show": f.show }));
        }
    }
}

/// `od__write_file` → `write_file`.
fn tool_name(raw: &str) -> String {
    raw.split_once("__")
        .map(|(_, n)| n.to_string())
        .unwrap_or_else(|| raw.to_string())
}

fn tool_output(res: &rmcp::model::CallToolResult) -> String {
    let mut out = String::new();
    for block in &res.content {
        if let Some(t) = block.as_text() {
            if !out.is_empty() {
                out.push('\n');
            }
            out.push_str(&t.text);
        }
    }
    if out.len() > 4000 {
        let mut cut = 4000;
        while !out.is_char_boundary(cut) {
            cut -= 1;
        }
        out.truncate(cut);
        out.push('…');
    }
    out
}

/// Copy a skill's folder into `<project>/.od-skills/<id>/` so the agent can
/// read its templates and references with ordinary file tools.
async fn stage_skill(root: &Path, skill_dir: &Path, id: &str) -> Result<()> {
    let target = root.join(".od-skills").join(id);
    if target.join("SKILL.md").is_file() {
        return Ok(());
    }
    let skill_dir = skill_dir.to_path_buf();
    tokio::task::spawn_blocking(move || -> Result<()> {
        for entry in walkdir::WalkDir::new(&skill_dir).into_iter().filter_map(|e| e.ok()) {
            let rel = entry.path().strip_prefix(&skill_dir)?;
            let dest = target.join(rel);
            if entry.file_type().is_dir() {
                std::fs::create_dir_all(&dest)?;
            } else if entry.file_type().is_file() {
                if let Some(parent) = dest.parent() {
                    std::fs::create_dir_all(parent)?;
                }
                std::fs::copy(entry.path(), &dest)?;
            }
        }
        Ok(())
    })
    .await??;
    Ok(())
}
