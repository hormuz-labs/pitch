//! A project's folder: path containment, listing, and artifact inference.
//!
//! Every path that comes from a client or from the agent is relative to the
//! project root and is checked against the root's real path, so neither a
//! `..` nor a symlink can reach outside it.

use std::path::{Component, Path, PathBuf};

use anyhow::{Result, anyhow, bail};
use serde::Serialize;
use serde_json::{Value, json};

/// Directories that never show up in listings.
const IGNORED_DIRS: &[&str] = &["node_modules", ".git", "dist", "build", ".next", "target"];

/// Reject anything but a plain relative path.
pub fn clean_relative(rel: &str) -> Result<PathBuf> {
    if rel.contains('\0') {
        bail!("path contains NUL");
    }
    let rel = rel.trim_start_matches("./");
    let path = Path::new(rel);
    let mut out = PathBuf::new();
    for comp in path.components() {
        match comp {
            Component::Normal(c) => out.push(c),
            Component::CurDir => {}
            _ => bail!("path must stay inside the project: {rel}"),
        }
    }
    if out.as_os_str().is_empty() {
        bail!("empty path");
    }
    Ok(out)
}

/// Resolve `rel` under `root`, following symlinks, and require the result to
/// stay inside `root`. Works for paths that do not exist yet (for writes) by
/// resolving the deepest existing ancestor.
pub fn resolve(root: &Path, rel: &str) -> Result<PathBuf> {
    let rel = clean_relative(rel)?;
    let root_real = root.canonicalize()?;
    let joined = root_real.join(&rel);
    let mut existing = joined.as_path();
    let mut tail = Vec::new();
    while !existing.exists() {
        tail.push(
            existing
                .file_name()
                .ok_or_else(|| anyhow!("bad path"))?
                .to_owned(),
        );
        existing = existing.parent().ok_or_else(|| anyhow!("bad path"))?;
    }
    let mut real = existing.canonicalize()?;
    if !real.starts_with(&root_real) {
        bail!("path escapes the project: {}", rel.display());
    }
    for part in tail.into_iter().rev() {
        real.push(part);
    }
    Ok(real)
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectFile {
    pub name: String,
    pub path: String,
    pub size: u64,
    pub mtime: i64,
    pub kind: &'static str,
    pub mime: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub artifact_manifest: Option<Value>,
}

pub fn kind_for(path: &str) -> &'static str {
    let lower = path.to_ascii_lowercase();
    let ext = lower.rsplit('.').next().unwrap_or("");
    if lower.ends_with(".sketch.json") {
        return "sketch";
    }
    match ext {
        "html" | "htm" => "html",
        "svg" => "sketch",
        "png" | "jpg" | "jpeg" | "gif" | "webp" | "avif" | "bmp" | "ico" => "image",
        "mp4" | "webm" | "mov" | "m4v" => "video",
        "mp3" | "wav" | "ogg" | "m4a" | "aac" | "flac" => "audio",
        "pdf" => "pdf",
        "md" | "markdown" | "txt" | "rtf" => "text",
        "docx" | "doc" | "odt" => "document",
        "pptx" | "ppt" | "key" => "presentation",
        "xlsx" | "xls" | "csv" | "tsv" => "spreadsheet",
        "js" | "mjs" | "ts" | "tsx" | "jsx" | "css" | "json" | "py" | "rs" | "go" | "sh"
        | "yaml" | "yml" | "toml" | "xml" => "code",
        _ => "binary",
    }
}

/// The manifest a file would have if the agent never wrote one.
pub fn infer_manifest(path: &str) -> Option<Value> {
    let lower = path.to_ascii_lowercase();
    let title = Path::new(path)
        .file_stem()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_default();
    if lower.ends_with(".html") || lower.ends_with(".htm") {
        let deck = ["deck", "slides", "pitch"].iter().any(|w| lower.contains(w));
        let (kind, renderer) = if deck { ("deck", "deck-html") } else { ("html", "html") };
        return Some(json!({
            "version": 1, "kind": kind, "renderer": renderer, "title": title, "entry": path,
            "exports": ["html", "pdf", "zip"], "metadata": {"inferred": true}
        }));
    }
    if lower.ends_with(".md") {
        return Some(json!({
            "version": 1, "kind": "markdown-document", "renderer": "markdown", "title": title,
            "entry": path, "exports": ["md", "html", "pdf", "zip"], "metadata": {"inferred": true}
        }));
    }
    if lower.ends_with(".svg") {
        return Some(json!({
            "version": 1, "kind": "svg", "renderer": "svg", "title": title, "entry": path,
            "exports": ["svg", "zip"], "metadata": {"inferred": true}
        }));
    }
    None
}

fn is_hidden(rel: &Path) -> bool {
    rel.components().any(|c| {
        let s = c.as_os_str().to_string_lossy();
        s.starts_with('.') || IGNORED_DIRS.contains(&s.as_ref())
    })
}

pub fn describe(root: &Path, abs: &Path) -> Option<ProjectFile> {
    let rel = abs.strip_prefix(root).ok()?;
    let meta = std::fs::metadata(abs).ok()?;
    let path = rel.to_string_lossy().replace('\\', "/");
    let manifest = std::fs::read_to_string(format!("{}.artifact.json", abs.display()))
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .or_else(|| infer_manifest(&path));
    Some(ProjectFile {
        name: abs.file_name()?.to_string_lossy().to_string(),
        kind: kind_for(&path),
        mime: mime_guess::from_path(abs)
            .first_or_octet_stream()
            .essence_str()
            .to_string(),
        size: meta.len(),
        mtime: meta
            .modified()
            .ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as i64)
            .unwrap_or(0),
        artifact_manifest: manifest,
        path,
    })
}

/// Every visible file in the project, newest first.
pub fn list(root: &Path) -> Vec<ProjectFile> {
    let mut out: Vec<ProjectFile> = walkdir::WalkDir::new(root)
        .into_iter()
        .filter_entry(|e| {
            e.path()
                .strip_prefix(root)
                .map(|rel| rel.as_os_str().is_empty() || !is_hidden(rel))
                .unwrap_or(false)
        })
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_file())
        .filter(|e| !e.path().to_string_lossy().ends_with(".artifact.json"))
        .filter_map(|e| describe(root, e.path()))
        .collect();
    out.sort_by(|a, b| b.mtime.cmp(&a.mtime).then(a.path.cmp(&b.path)));
    out
}

/// Size + mtime for every visible file: used to tell what a run changed.
pub fn snapshot(root: &Path) -> std::collections::HashMap<String, (u64, i64)> {
    list(root)
        .into_iter()
        .map(|f| (f.path, (f.size, f.mtime)))
        .collect()
}

/// Clean a user-supplied file name segment by segment: letters and digits
/// stay, whitespace becomes `-`, anything else `_`.
pub fn sanitize_name(name: &str) -> String {
    name.split('/')
        .filter(|s| !s.is_empty() && *s != "." && *s != "..")
        .map(|seg| {
            seg.chars()
                .map(|c| {
                    if c.is_alphanumeric() || matches!(c, '.' | '-' | '_') {
                        c
                    } else if c.is_whitespace() {
                        '-'
                    } else {
                        '_'
                    }
                })
                .collect::<String>()
        })
        .collect::<Vec<_>>()
        .join("/")
}
