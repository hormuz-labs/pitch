//! Process configuration: where data and content live, and which model
//! endpoint the agent talks to.
//!
//! Model settings come from `<data>/settings.json` (written by the settings
//! screen) with the key in `<data>/secrets/model.key`; anything not saved
//! there falls back to the `OD_MODEL_*` environment variables.

use std::path::{Path, PathBuf};

use anyhow::{Result, bail};
use serde::{Deserialize, Serialize};

/// Wire format of the model endpoint.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Protocol {
    #[serde(rename = "openai")]
    OpenAi,
    Anthropic,
    /// Google's OpenAI-compatible Gemini endpoint.
    Gemini,
}

impl Protocol {
    fn parse(s: &str) -> Result<Self> {
        Ok(match s {
            "openai" => Protocol::OpenAi,
            "anthropic" => Protocol::Anthropic,
            "gemini" => Protocol::Gemini,
            other => bail!("model protocol must be openai, anthropic or gemini, not {other}"),
        })
    }
}

const GEMINI_BASE: &str = "https://generativelanguage.googleapis.com/v1beta/openai";

#[derive(Clone, Debug)]
pub struct ModelSettings {
    pub protocol: Protocol,
    /// Base URL of the endpoint, e.g. `https://models.internal` (no `/v1`).
    pub base_url: String,
    /// Path of the chat endpoint under `base_url` (OpenAI-style protocols).
    pub chat_path: String,
    pub api_key: String,
    /// Model used when a run does not name one.
    pub default_model: String,
    /// Models offered in the picker.
    pub models: Vec<String>,
    pub context_limit: usize,
    pub max_tokens: i32,
}

/// What the settings screen saves. The key is stored separately.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StoredModel {
    pub protocol: Option<Protocol>,
    pub base_url: Option<String>,
    pub model: Option<String>,
    #[serde(default)]
    pub models: Vec<String>,
}

#[derive(Clone, Debug)]
pub struct Config {
    pub port: u16,
    /// Port of the preview origin (agent-written files).
    pub preview_port: u16,
    /// Public origin of the preview server when it sits behind its own host
    /// (e.g. `https://preview.example.com`); the studio otherwise uses
    /// its own hostname with `preview_port`.
    pub preview_origin: Option<String>,
    pub data_dir: PathBuf,
    pub web_dir: Option<PathBuf>,
}

impl Config {
    pub fn projects_dir(&self) -> PathBuf {
        self.data_dir.join("projects")
    }

    pub fn runs_dir(&self) -> PathBuf {
        self.data_dir.join("runs")
    }

    pub fn goose_dir(&self) -> PathBuf {
        self.data_dir.join("goose")
    }
}

fn settings_path(data_dir: &Path) -> PathBuf {
    data_dir.join("settings.json")
}

fn key_path(data_dir: &Path) -> PathBuf {
    data_dir.join("secrets").join("model.key")
}

pub fn load_stored(data_dir: &Path) -> StoredModel {
    std::fs::read_to_string(settings_path(data_dir))
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

/// Save the settings screen's choices. `api_key: Some("")` clears the key;
/// `None` keeps the current one.
pub fn save_stored(data_dir: &Path, stored: &StoredModel, api_key: Option<&str>) -> Result<()> {
    std::fs::create_dir_all(data_dir)?;
    std::fs::write(settings_path(data_dir), serde_json::to_string_pretty(stored)?)?;
    if let Some(key) = api_key {
        let path = key_path(data_dir);
        if key.is_empty() {
            let _ = std::fs::remove_file(&path);
        } else {
            write_private(&path, key.trim())?;
        }
    }
    Ok(())
}

#[cfg(unix)]
fn write_private(path: &Path, contents: &str) -> Result<()> {
    use std::io::Write;
    use std::os::unix::fs::{OpenOptionsExt, PermissionsExt};
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir)?;
        std::fs::set_permissions(dir, std::fs::Permissions::from_mode(0o700))?;
    }
    let mut f = std::fs::OpenOptions::new()
        .create(true)
        .write(true)
        .truncate(true)
        .mode(0o600)
        .open(path)?;
    f.write_all(contents.as_bytes())?;
    Ok(())
}

#[cfg(not(unix))]
fn write_private(path: &Path, contents: &str) -> Result<()> {
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir)?;
    }
    std::fs::write(path, contents)?;
    Ok(())
}

impl ModelSettings {
    /// Saved settings first, then the environment.
    pub fn load(data_dir: &Path) -> Result<Self> {
        let stored = load_stored(data_dir);
        let env = |k: &str| std::env::var(k).ok().filter(|v| !v.is_empty());

        let protocol = match stored.protocol {
            Some(p) => p,
            None => match env("OD_MODEL_PROTOCOL") {
                Some(p) => Protocol::parse(&p)?,
                None => Protocol::OpenAi,
            },
        };
        let mut base_url = stored
            .base_url
            .clone()
            .filter(|b| !b.is_empty())
            .or_else(|| env("OD_MODEL_BASE_URL"))
            .unwrap_or_default();
        let mut api_key = std::fs::read_to_string(key_path(data_dir))
            .ok()
            .map(|k| k.trim().to_string())
            .filter(|k| !k.is_empty())
            .or_else(|| env("OD_MODEL_API_KEY"))
            .or_else(|| {
                env("OD_MODEL_API_KEY_FILE")
                    .and_then(|p| std::fs::read_to_string(p).ok())
                    .map(|k| k.trim().to_string())
            })
            .unwrap_or_default();
        let mut chat_path = "v1/chat/completions".to_string();
        if protocol == Protocol::Gemini {
            if base_url.is_empty() {
                base_url = GEMINI_BASE.into();
            }
            if api_key.is_empty() {
                api_key = env("GEMINI_API_KEY").unwrap_or_default();
            }
            chat_path = "chat/completions".into();
        }
        if let Some(path) = env("OD_MODEL_CHAT_PATH") {
            chat_path = path.trim_start_matches('/').to_string();
        }

        let default_model = stored
            .model
            .clone()
            .filter(|m| !m.is_empty())
            .or_else(|| env("OD_MODEL"))
            .unwrap_or_default();
        let mut models: Vec<String> = if stored.models.is_empty() {
            env("OD_MODELS")
                .unwrap_or_default()
                .split(',')
                .map(|m| m.trim().to_string())
                .filter(|m| !m.is_empty())
                .collect()
        } else {
            stored.models.clone()
        };
        if !default_model.is_empty() && !models.contains(&default_model) {
            models.insert(0, default_model.clone());
        }
        Ok(Self {
            protocol,
            base_url: base_url.trim_end_matches('/').to_string(),
            chat_path,
            api_key,
            default_model,
            models,
            context_limit: env_num("OD_MODEL_CONTEXT_LIMIT", 200_000),
            max_tokens: env_num("OD_MODEL_MAX_TOKENS", 32_000) as i32,
        })
    }
}

fn env_num(name: &str, default: usize) -> usize {
    std::env::var(name)
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(default)
}
