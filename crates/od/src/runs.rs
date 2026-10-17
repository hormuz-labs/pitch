//! Runs: one agent turn each. A run lives in memory while it streams and is
//! journaled to `<data>/runs/<id>/events.jsonl` so a client can replay it
//! after reconnecting, or after the server restarts.

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use serde::Serialize;
use serde_json::Value;
use tokio::io::AsyncWriteExt;
use tokio::sync::broadcast;
use tokio_util::sync::CancellationToken;

use crate::util::now_ms;

#[derive(Clone, Debug, Serialize)]
pub struct RunEvent {
    pub id: u64,
    pub event: String,
    pub data: Value,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RunStatus {
    pub id: String,
    pub project_id: String,
    pub conversation_id: String,
    pub assistant_message_id: String,
    pub status: String,
    pub created_at: i64,
    pub updated_at: i64,
    pub terminal_at: Option<i64>,
    pub error: Option<String>,
}

pub struct Run {
    pub status: Mutex<RunStatus>,
    events: Mutex<Vec<RunEvent>>,
    tx: broadcast::Sender<RunEvent>,
    pub cancel: CancellationToken,
    journal: Mutex<Option<tokio::sync::mpsc::UnboundedSender<String>>>,
}

impl Run {
    pub fn emit(&self, event: &str, data: Value) {
        let ev = {
            let mut events = self.events.lock().unwrap();
            let ev = RunEvent {
                id: events.len() as u64 + 1,
                event: event.to_string(),
                data,
            };
            events.push(ev.clone());
            ev
        };
        if let Some(journal) = self.journal.lock().unwrap().as_ref() {
            if let Ok(line) = serde_json::to_string(&ev) {
                let _ = journal.send(line);
            }
        }
        let _ = self.tx.send(ev);
    }

    /// Events after `after`, plus a live receiver for the rest. Subscribing
    /// before copying the backlog means nothing falls in the gap; the caller
    /// skips ids it has already seen.
    pub fn subscribe(&self, after: u64) -> (Vec<RunEvent>, broadcast::Receiver<RunEvent>, bool) {
        let rx = self.tx.subscribe();
        let backlog = self
            .events
            .lock()
            .unwrap()
            .iter()
            .filter(|e| e.id > after)
            .cloned()
            .collect();
        (backlog, rx, self.is_terminal())
    }

    pub fn is_terminal(&self) -> bool {
        self.status.lock().unwrap().terminal_at.is_some()
    }

    pub fn set_status(&self, status: &str, error: Option<String>) {
        let mut s = self.status.lock().unwrap();
        s.status = status.to_string();
        s.updated_at = now_ms();
        if matches!(status, "succeeded" | "failed" | "canceled") {
            s.terminal_at = Some(now_ms());
            *self.journal.lock().unwrap() = None;
        }
        if error.is_some() {
            s.error = error;
        }
    }
}

pub struct Runs {
    dir: PathBuf,
    runs: Mutex<HashMap<String, Arc<Run>>>,
}

impl Runs {
    pub fn new(dir: PathBuf) -> Self {
        Self {
            dir,
            runs: Mutex::new(HashMap::new()),
        }
    }

    pub fn create(&self, status: RunStatus) -> Arc<Run> {
        let dir = self.dir.join(&status.id);
        let (jtx, mut jrx) = tokio::sync::mpsc::unbounded_channel::<String>();
        let state_path = dir.join("state.json");
        let initial_state = serde_json::to_string(&status).unwrap_or_default();
        tokio::spawn(async move {
            if tokio::fs::create_dir_all(&dir).await.is_err() {
                return;
            }
            let _ = tokio::fs::write(&state_path, initial_state).await;
            let Ok(mut file) = tokio::fs::OpenOptions::new()
                .create(true)
                .append(true)
                .open(dir.join("events.jsonl"))
                .await
            else {
                return;
            };
            while let Some(line) = jrx.recv().await {
                let _ = file.write_all(line.as_bytes()).await;
                let _ = file.write_all(b"\n").await;
            }
        });
        let run = Arc::new(Run {
            status: Mutex::new(status.clone()),
            events: Mutex::new(Vec::new()),
            tx: broadcast::channel(1024).0,
            cancel: CancellationToken::new(),
            journal: Mutex::new(Some(jtx)),
        });
        self.runs
            .lock()
            .unwrap()
            .insert(status.id.clone(), run.clone());
        run
    }

    /// A live run, or a finished one reloaded from its journal.
    pub fn get(&self, id: &str) -> Option<Arc<Run>> {
        if let Some(run) = self.runs.lock().unwrap().get(id) {
            return Some(run.clone());
        }
        if !crate::util::is_safe_id(id) {
            return None;
        }
        let dir = self.dir.join(id);
        let status: RunStatus = serde_json::from_str::<Value>(
            &std::fs::read_to_string(dir.join("state.json")).ok()?,
        )
        .ok()
        .and_then(|v| {
            Some(RunStatus {
                id: v.get("id")?.as_str()?.to_string(),
                project_id: v.get("projectId")?.as_str()?.to_string(),
                conversation_id: v.get("conversationId")?.as_str()?.to_string(),
                assistant_message_id: v.get("assistantMessageId")?.as_str()?.to_string(),
                status: "succeeded".to_string(),
                created_at: v.get("createdAt")?.as_i64()?,
                updated_at: v.get("updatedAt")?.as_i64()?,
                terminal_at: Some(v.get("updatedAt")?.as_i64()?),
                error: None,
            })
        })?;
        let events: Vec<RunEvent> = std::fs::read_to_string(dir.join("events.jsonl"))
            .unwrap_or_default()
            .lines()
            .filter_map(|l| serde_json::from_str::<Value>(l).ok())
            .filter_map(|v| {
                Some(RunEvent {
                    id: v.get("id")?.as_u64()?,
                    event: v.get("event")?.as_str()?.to_string(),
                    data: v.get("data")?.clone(),
                })
            })
            .collect();
        let mut status = status;
        if let Some(end) = events.iter().rev().find(|e| e.event == "end") {
            if let Some(s) = end.data.get("status").and_then(Value::as_str) {
                status.status = s.to_string();
            }
        } else {
            status.status = "failed".to_string();
            status.error = Some("the server restarted during this run".to_string());
        }
        Some(Arc::new(Run {
            status: Mutex::new(status),
            events: Mutex::new(events),
            tx: broadcast::channel(1).0,
            cancel: CancellationToken::new(),
            journal: Mutex::new(None),
        }))
    }

    pub fn list(&self, project_id: Option<&str>, conversation_id: Option<&str>) -> Vec<RunStatus> {
        let mut out: Vec<RunStatus> = self
            .runs
            .lock()
            .unwrap()
            .values()
            .map(|r| r.status.lock().unwrap().clone())
            .filter(|s| project_id.is_none_or(|p| s.project_id == p))
            .filter(|s| conversation_id.is_none_or(|c| s.conversation_id == c))
            .collect();
        out.sort_by_key(|s| std::cmp::Reverse(s.created_at));
        out
    }

    pub fn active_for_conversation(&self, conversation_id: &str) -> Option<Arc<Run>> {
        self.runs
            .lock()
            .unwrap()
            .values()
            .find(|r| {
                let s = r.status.lock().unwrap();
                s.conversation_id == conversation_id && s.terminal_at.is_none()
            })
            .cloned()
    }

    pub fn cancel_project(&self, project_id: &str) {
        for run in self.runs.lock().unwrap().values() {
            if run.status.lock().unwrap().project_id == project_id {
                run.cancel.cancel();
            }
        }
    }
}
