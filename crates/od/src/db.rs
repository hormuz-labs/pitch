//! SQLite registry: projects, conversations, messages and the goose session
//! that backs each conversation. Files live on disk; the database only
//! records what a project is called and what was said in it.

use std::path::Path;
use std::str::FromStr;

use anyhow::Result;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::sqlite::{SqliteConnectOptions, SqliteJournalMode, SqlitePoolOptions};
use sqlx::{Row, SqlitePool};

use crate::util::now_ms;

const SCHEMA: &str = r#"
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  skill_id TEXT,
  design_system_id TEXT,
  pending_prompt TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  custom_instructions TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT,
  session_mode TEXT NOT NULL DEFAULT 'design',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS conversations_project ON conversations(project_id, updated_at DESC);
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  events_json TEXT NOT NULL DEFAULT '[]',
  attachments_json TEXT NOT NULL DEFAULT '[]',
  produced_files_json TEXT NOT NULL DEFAULT '[]',
  run_id TEXT,
  run_status TEXT,
  started_at INTEGER,
  ended_at INTEGER,
  position INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS messages_conversation ON messages(conversation_id, position);
CREATE TABLE IF NOT EXISTS agent_sessions (
  conversation_id TEXT PRIMARY KEY REFERENCES conversations(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
"#;

pub async fn open(data_dir: &Path) -> Result<SqlitePool> {
    let url = format!("sqlite://{}", data_dir.join("app.sqlite").display());
    let options = SqliteConnectOptions::from_str(&url)?
        .create_if_missing(true)
        .journal_mode(SqliteJournalMode::Wal)
        .foreign_keys(true);
    let pool = SqlitePoolOptions::new()
        .max_connections(8)
        .connect_with(options)
        .await?;
    sqlx::raw_sql(SCHEMA).execute(&pool).await?;
    Ok(pool)
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    pub id: String,
    pub name: String,
    pub skill_id: Option<String>,
    pub design_system_id: Option<String>,
    pub pending_prompt: Option<String>,
    pub metadata: Value,
    pub custom_instructions: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

impl Project {
    pub fn kind(&self) -> &str {
        self.metadata
            .get("kind")
            .and_then(Value::as_str)
            .unwrap_or("prototype")
    }
}

fn project_from_row(row: &sqlx::sqlite::SqliteRow) -> Project {
    let metadata: String = row.get("metadata_json");
    Project {
        id: row.get("id"),
        name: row.get("name"),
        skill_id: row.get("skill_id"),
        design_system_id: row.get("design_system_id"),
        pending_prompt: row.get("pending_prompt"),
        metadata: serde_json::from_str(&metadata).unwrap_or(Value::Object(Default::default())),
        custom_instructions: row.get("custom_instructions"),
        created_at: row.get("created_at"),
        updated_at: row.get("updated_at"),
    }
}

pub async fn list_projects(db: &SqlitePool) -> Result<Vec<Project>> {
    let rows = sqlx::query("SELECT * FROM projects ORDER BY updated_at DESC")
        .fetch_all(db)
        .await?;
    Ok(rows.iter().map(project_from_row).collect())
}

pub async fn get_project(db: &SqlitePool, id: &str) -> Result<Option<Project>> {
    let row = sqlx::query("SELECT * FROM projects WHERE id = ?")
        .bind(id)
        .fetch_optional(db)
        .await?;
    Ok(row.as_ref().map(project_from_row))
}

pub async fn insert_project(db: &SqlitePool, p: &Project) -> Result<()> {
    sqlx::query(
        "INSERT INTO projects (id, name, skill_id, design_system_id, pending_prompt, metadata_json,
           custom_instructions, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&p.id)
    .bind(&p.name)
    .bind(&p.skill_id)
    .bind(&p.design_system_id)
    .bind(&p.pending_prompt)
    .bind(p.metadata.to_string())
    .bind(&p.custom_instructions)
    .bind(p.created_at)
    .bind(p.updated_at)
    .execute(db)
    .await?;
    Ok(())
}

pub async fn update_project(db: &SqlitePool, p: &Project) -> Result<()> {
    sqlx::query(
        "UPDATE projects SET name = ?, skill_id = ?, design_system_id = ?, pending_prompt = ?,
           metadata_json = ?, custom_instructions = ?, updated_at = ? WHERE id = ?",
    )
    .bind(&p.name)
    .bind(&p.skill_id)
    .bind(&p.design_system_id)
    .bind(&p.pending_prompt)
    .bind(p.metadata.to_string())
    .bind(&p.custom_instructions)
    .bind(p.updated_at)
    .bind(&p.id)
    .execute(db)
    .await?;
    Ok(())
}

pub async fn touch_project(db: &SqlitePool, id: &str) -> Result<()> {
    sqlx::query("UPDATE projects SET updated_at = ? WHERE id = ?")
        .bind(now_ms())
        .bind(id)
        .execute(db)
        .await?;
    Ok(())
}

pub async fn delete_project(db: &SqlitePool, id: &str) -> Result<()> {
    sqlx::query("DELETE FROM projects WHERE id = ?")
        .bind(id)
        .execute(db)
        .await?;
    Ok(())
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Conversation {
    pub id: String,
    pub project_id: String,
    pub title: Option<String>,
    pub session_mode: String,
    pub created_at: i64,
    pub updated_at: i64,
    #[serde(default)]
    pub message_count: i64,
}

fn conversation_from_row(row: &sqlx::sqlite::SqliteRow) -> Conversation {
    Conversation {
        id: row.get("id"),
        project_id: row.get("project_id"),
        title: row.get("title"),
        session_mode: row.get("session_mode"),
        created_at: row.get("created_at"),
        updated_at: row.get("updated_at"),
        message_count: row.try_get("message_count").unwrap_or(0),
    }
}

pub async fn list_conversations(db: &SqlitePool, project_id: &str) -> Result<Vec<Conversation>> {
    let rows = sqlx::query(
        "SELECT c.*, (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id) AS message_count
         FROM conversations c WHERE c.project_id = ? ORDER BY c.updated_at DESC",
    )
    .bind(project_id)
    .fetch_all(db)
    .await?;
    Ok(rows.iter().map(conversation_from_row).collect())
}

pub async fn get_conversation(db: &SqlitePool, id: &str) -> Result<Option<Conversation>> {
    let row = sqlx::query("SELECT * FROM conversations WHERE id = ?")
        .bind(id)
        .fetch_optional(db)
        .await?;
    Ok(row.as_ref().map(conversation_from_row))
}

pub async fn insert_conversation(db: &SqlitePool, c: &Conversation) -> Result<()> {
    sqlx::query(
        "INSERT INTO conversations (id, project_id, title, session_mode, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(&c.id)
    .bind(&c.project_id)
    .bind(&c.title)
    .bind(&c.session_mode)
    .bind(c.created_at)
    .bind(c.updated_at)
    .execute(db)
    .await?;
    Ok(())
}

pub async fn update_conversation(
    db: &SqlitePool,
    id: &str,
    title: Option<&str>,
    session_mode: Option<&str>,
) -> Result<()> {
    sqlx::query(
        "UPDATE conversations SET title = COALESCE(?, title), session_mode = COALESCE(?, session_mode),
           updated_at = ? WHERE id = ?",
    )
    .bind(title)
    .bind(session_mode)
    .bind(now_ms())
    .bind(id)
    .execute(db)
    .await?;
    Ok(())
}

pub async fn delete_conversation(db: &SqlitePool, id: &str) -> Result<()> {
    sqlx::query("DELETE FROM conversations WHERE id = ?")
        .bind(id)
        .execute(db)
        .await?;
    Ok(())
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatMessage {
    pub id: String,
    pub role: String,
    #[serde(default)]
    pub content: String,
    #[serde(default)]
    pub events: Vec<Value>,
    #[serde(default)]
    pub attachments: Vec<Value>,
    #[serde(default)]
    pub produced_files: Vec<Value>,
    pub run_id: Option<String>,
    pub run_status: Option<String>,
    pub started_at: Option<i64>,
    pub ended_at: Option<i64>,
    #[serde(default)]
    pub created_at: i64,
}

fn json_list(row: &sqlx::sqlite::SqliteRow, col: &str) -> Vec<Value> {
    let raw: String = row.get(col);
    serde_json::from_str(&raw).unwrap_or_default()
}

pub async fn list_messages(db: &SqlitePool, conversation_id: &str) -> Result<Vec<ChatMessage>> {
    let rows = sqlx::query("SELECT * FROM messages WHERE conversation_id = ? ORDER BY position")
        .bind(conversation_id)
        .fetch_all(db)
        .await?;
    Ok(rows
        .iter()
        .map(|row| ChatMessage {
            id: row.get("id"),
            role: row.get("role"),
            content: row.get("content"),
            events: json_list(row, "events_json"),
            attachments: json_list(row, "attachments_json"),
            produced_files: json_list(row, "produced_files_json"),
            run_id: row.get("run_id"),
            run_status: row.get("run_status"),
            started_at: row.get("started_at"),
            ended_at: row.get("ended_at"),
            created_at: row.get("created_at"),
        })
        .collect())
}

/// Insert or replace a message, keeping its position when it already exists.
pub async fn upsert_message(db: &SqlitePool, conversation_id: &str, m: &ChatMessage) -> Result<()> {
    let created_at = if m.created_at > 0 { m.created_at } else { now_ms() };
    sqlx::query(
        "INSERT INTO messages (id, conversation_id, role, content, events_json, attachments_json,
           produced_files_json, run_id, run_status, started_at, ended_at, position, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
           (SELECT COALESCE(MAX(position), -1) + 1 FROM messages WHERE conversation_id = ?), ?)
         ON CONFLICT(id) DO UPDATE SET content = excluded.content, events_json = excluded.events_json,
           attachments_json = excluded.attachments_json, produced_files_json = excluded.produced_files_json,
           run_id = excluded.run_id, run_status = excluded.run_status, started_at = excluded.started_at,
           ended_at = excluded.ended_at",
    )
    .bind(&m.id)
    .bind(conversation_id)
    .bind(&m.role)
    .bind(&m.content)
    .bind(Value::Array(m.events.clone()).to_string())
    .bind(Value::Array(m.attachments.clone()).to_string())
    .bind(Value::Array(m.produced_files.clone()).to_string())
    .bind(&m.run_id)
    .bind(&m.run_status)
    .bind(m.started_at)
    .bind(m.ended_at)
    .bind(conversation_id)
    .bind(created_at)
    .execute(db)
    .await?;
    sqlx::query("UPDATE conversations SET updated_at = ? WHERE id = ?")
        .bind(now_ms())
        .bind(conversation_id)
        .execute(db)
        .await?;
    Ok(())
}

pub async fn agent_session(db: &SqlitePool, conversation_id: &str) -> Result<Option<String>> {
    let row = sqlx::query("SELECT session_id FROM agent_sessions WHERE conversation_id = ?")
        .bind(conversation_id)
        .fetch_optional(db)
        .await?;
    Ok(row.map(|r| r.get("session_id")))
}

pub async fn set_agent_session(db: &SqlitePool, conversation_id: &str, session_id: &str) -> Result<()> {
    sqlx::query(
        "INSERT INTO agent_sessions (conversation_id, session_id, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(conversation_id) DO UPDATE SET session_id = excluded.session_id,
           updated_at = excluded.updated_at",
    )
    .bind(conversation_id)
    .bind(session_id)
    .bind(now_ms())
    .execute(db)
    .await?;
    Ok(())
}
