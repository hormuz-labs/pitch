//! Process configuration: where data and content live, and which model
//! endpoint the agent talks to.

use std::path::PathBuf;

use anyhow::{Result, bail};

/// Wire format of the model endpoint. Both are served by the model proxy.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Protocol {
    OpenAi,
    Anthropic,
    /// Google's OpenAI-compatible Gemini endpoint.
    Gemini,
}

#[derive(Clone, Debug)]
pub struct ModelSettings {
    pub protocol: Protocol,
    /// Base URL of the proxy, e.g. `https://models.internal` (no `/v1`).
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
    pub model: ModelSettings,
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

impl ModelSettings {
    pub fn from_env() -> Result<Self> {
        let protocol = match std::env::var("OD_MODEL_PROTOCOL").as_deref() {
            Ok("anthropic") => Protocol::Anthropic,
            Ok("gemini") => Protocol::Gemini,
            Ok("openai") | Err(_) => Protocol::OpenAi,
            Ok(other) => bail!("OD_MODEL_PROTOCOL must be openai, anthropic or gemini, not {other}"),
        };
        // Both may be empty: the studio still serves, and a run explains
        // what is missing.
        let mut base_url = std::env::var("OD_MODEL_BASE_URL").unwrap_or_default();
        let mut api_key = std::env::var("OD_MODEL_API_KEY").unwrap_or_default();
        if api_key.is_empty() {
            if let Ok(path) = std::env::var("OD_MODEL_API_KEY_FILE") {
                api_key = std::fs::read_to_string(&path)
                    .map_err(|e| anyhow::anyhow!("cannot read OD_MODEL_API_KEY_FILE {path}: {e}"))?
                    .trim()
                    .to_string();
            }
        }
        let mut chat_path = "v1/chat/completions".to_string();
        if protocol == Protocol::Gemini {
            if base_url.is_empty() {
                base_url = "https://generativelanguage.googleapis.com/v1beta/openai".into();
            }
            if api_key.is_empty() {
                api_key = std::env::var("GEMINI_API_KEY").unwrap_or_default();
            }
            chat_path = "chat/completions".into();
        }
        if let Ok(path) = std::env::var("OD_MODEL_CHAT_PATH") {
            chat_path = path.trim_start_matches('/').to_string();
        }
        let default_model = std::env::var("OD_MODEL").unwrap_or_default();
        let mut models: Vec<String> = std::env::var("OD_MODELS")
            .unwrap_or_default()
            .split(',')
            .map(|m| m.trim().to_string())
            .filter(|m| !m.is_empty())
            .collect();
        if !default_model.is_empty() && !models.contains(&default_model) {
            models.insert(0, default_model.clone());
        }
        let context_limit = env_num("OD_MODEL_CONTEXT_LIMIT", 200_000);
        let max_tokens = env_num("OD_MODEL_MAX_TOKENS", 32_000) as i32;
        Ok(Self {
            protocol,
            base_url: base_url.trim_end_matches('/').to_string(),
            chat_path,
            api_key,
            default_model,
            models,
            context_limit,
            max_tokens,
        })
    }
}

fn env_num(name: &str, default: usize) -> usize {
    std::env::var(name)
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(default)
}
