//! The bundled library: skills, design templates, design systems, craft
//! notes and prompt templates. All of it is plain files under `content/`;
//! this module indexes it once at startup.

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

use anyhow::Result;
use serde::Serialize;
use serde_json::Value;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Skill {
    pub id: String,
    pub name: String,
    pub description: String,
    /// `skill` (from skills/) or `template` (from design-templates/).
    pub source: &'static str,
    pub mode: Option<String>,
    pub surface: Option<String>,
    pub scenario: Option<String>,
    pub category: Option<String>,
    pub platform: Option<String>,
    pub tags: Vec<String>,
    pub example_prompt: Option<String>,
    pub preview_entry: Option<String>,
    pub requires_design_system: bool,
    pub craft: Vec<String>,
    pub featured: bool,
    #[serde(skip)]
    pub dir: PathBuf,
    #[serde(skip)]
    pub body: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesignSystem {
    pub id: String,
    pub name: String,
    pub category: Option<String>,
    pub description: Option<String>,
    pub preview_pages: Vec<Value>,
    #[serde(skip)]
    pub dir: PathBuf,
    #[serde(skip)]
    pub manifest: Value,
}

impl DesignSystem {
    fn file(&self, key: &str, default: &str) -> Option<String> {
        let name = self
            .manifest
            .pointer(&format!("/files/{key}"))
            .and_then(Value::as_str)
            .unwrap_or(default);
        std::fs::read_to_string(self.dir.join(name)).ok()
    }

    pub fn design_md(&self) -> Option<String> {
        self.file("design", "DESIGN.md")
    }

    pub fn tokens_css(&self) -> Option<String> {
        self.file("tokens", "tokens.css")
    }

    pub fn usage_md(&self) -> Option<String> {
        let name = self
            .manifest
            .get("usage")
            .and_then(Value::as_str)
            .unwrap_or("USAGE.md");
        std::fs::read_to_string(self.dir.join(name)).ok()
    }

    pub fn components_manifest(&self) -> Option<String> {
        let name = self
            .manifest
            .get("componentsManifest")
            .and_then(Value::as_str)?;
        std::fs::read_to_string(self.dir.join(name)).ok()
    }

    pub fn import_mode(&self) -> &str {
        self.manifest
            .get("importMode")
            .and_then(Value::as_str)
            .unwrap_or("normalized")
    }

    /// Files the agent may pull on demand through the `design_system_read` tool.
    pub fn pull_index(&self) -> Vec<String> {
        let mut out = Vec::new();
        for entry in walkdir::WalkDir::new(&self.dir)
            .max_depth(3)
            .into_iter()
            .filter_map(|e| e.ok())
            .filter(|e| e.file_type().is_file())
        {
            if let Ok(rel) = entry.path().strip_prefix(&self.dir) {
                let rel = rel.to_string_lossy().to_string();
                if !rel.starts_with('.') {
                    out.push(rel);
                }
            }
        }
        out.sort();
        out
    }
}

#[derive(Clone, Debug, Serialize)]
pub struct PromptTemplate {
    pub id: String,
    pub surface: String,
    #[serde(flatten)]
    pub raw: Value,
}

#[derive(Default)]
pub struct Library {
    pub skills: BTreeMap<String, Skill>,
    pub design_systems: BTreeMap<String, DesignSystem>,
    pub craft: BTreeMap<String, String>,
    pub prompt_templates: Vec<PromptTemplate>,
}

impl Library {
    pub fn load(root: &Path) -> Result<Self> {
        let mut lib = Library::default();
        for (sub, source) in [("skills", "skill"), ("design-templates", "template")] {
            for dir in subdirs(&root.join(sub)) {
                if let Some(skill) = load_skill(&dir, source) {
                    lib.skills.entry(skill.id.clone()).or_insert(skill);
                }
            }
        }
        for dir in subdirs(&root.join("design-systems")) {
            if let Some(ds) = load_design_system(&dir) {
                lib.design_systems.insert(ds.id.clone(), ds);
            }
        }
        if let Ok(entries) = std::fs::read_dir(root.join("craft")) {
            for entry in entries.flatten() {
                let path = entry.path();
                let Some(stem) = path.file_stem().and_then(|s| s.to_str()) else {
                    continue;
                };
                if path.extension().is_some_and(|e| e == "md")
                    && stem.chars().all(|c| c.is_ascii_lowercase() || c == '-')
                {
                    if let Ok(body) = std::fs::read_to_string(&path) {
                        lib.craft.insert(stem.to_string(), body);
                    }
                }
            }
        }
        for surface in ["image", "video"] {
            if let Ok(entries) = std::fs::read_dir(root.join("prompt-templates").join(surface)) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    if path.extension().is_some_and(|e| e == "json") {
                        if let Some(raw) = std::fs::read_to_string(&path)
                            .ok()
                            .and_then(|s| serde_json::from_str::<Value>(&s).ok())
                        {
                            let id = raw
                                .get("id")
                                .and_then(Value::as_str)
                                .map(str::to_string)
                                .unwrap_or_else(|| {
                                    path.file_stem().unwrap().to_string_lossy().to_string()
                                });
                            lib.prompt_templates.push(PromptTemplate {
                                id,
                                surface: surface.to_string(),
                                raw,
                            });
                        }
                    }
                }
            }
        }
        lib.prompt_templates.sort_by(|a, b| a.id.cmp(&b.id));
        tracing::info!(
            skills = lib.skills.len(),
            design_systems = lib.design_systems.len(),
            craft = lib.craft.len(),
            prompt_templates = lib.prompt_templates.len(),
            "content library loaded"
        );
        Ok(lib)
    }

    /// The template file a design template or skill ships as its preview.
    pub fn skill_example(&self, skill: &Skill) -> Option<PathBuf> {
        let candidates = [
            skill.preview_entry.clone(),
            Some("example.html".to_string()),
            Some("assets/template.html".to_string()),
        ];
        candidates
            .into_iter()
            .flatten()
            .map(|p| skill.dir.join(p))
            .find(|p| p.is_file())
    }
}

fn subdirs(dir: &Path) -> Vec<PathBuf> {
    let mut out: Vec<PathBuf> = std::fs::read_dir(dir)
        .map(|it| {
            it.flatten()
                .map(|e| e.path())
                .filter(|p| p.is_dir())
                .filter(|p| {
                    p.file_name()
                        .and_then(|n| n.to_str())
                        .is_some_and(|n| !n.starts_with('_') && !n.starts_with('.'))
                })
                .collect()
        })
        .unwrap_or_default();
    out.sort();
    out
}

/// Split `---\nyaml\n---\nbody` into (frontmatter, body).
pub fn split_frontmatter(text: &str) -> (Option<serde_yaml::Value>, String) {
    let Some(rest) = text.strip_prefix("---") else {
        return (None, text.to_string());
    };
    let rest = rest.trim_start_matches(['\r', '\n']);
    let Some(end) = rest.find("\n---") else {
        return (None, text.to_string());
    };
    let yaml = &rest[..end];
    let body = rest[end + 4..].trim_start_matches(['\r', '\n']).to_string();
    (serde_yaml::from_str(yaml).ok(), body)
}

fn yaml_str(v: &serde_yaml::Value, path: &[&str]) -> Option<String> {
    let mut cur = v;
    for key in path {
        cur = cur.get(*key)?;
    }
    match cur {
        serde_yaml::Value::String(s) => Some(s.trim().to_string()),
        serde_yaml::Value::Bool(b) => Some(b.to_string()),
        serde_yaml::Value::Number(n) => Some(n.to_string()),
        _ => None,
    }
}

fn yaml_list(v: &serde_yaml::Value, path: &[&str]) -> Vec<String> {
    let mut cur = v;
    for key in path {
        match cur.get(*key) {
            Some(next) => cur = next,
            None => return Vec::new(),
        }
    }
    cur.as_sequence()
        .map(|seq| {
            seq.iter()
                .filter_map(|x| x.as_str().map(str::to_string))
                .collect()
        })
        .unwrap_or_default()
}

fn load_skill(dir: &Path, source: &'static str) -> Option<Skill> {
    let text = std::fs::read_to_string(dir.join("SKILL.md")).ok()?;
    let id = dir.file_name()?.to_string_lossy().to_string();
    let (fm, body) = split_frontmatter(&text);
    let fm = fm.unwrap_or(serde_yaml::Value::Null);
    let requires_design_system = yaml_str(&fm, &["od", "design_system", "requires"])
        .map(|v| v != "false")
        .unwrap_or(true);
    let name = yaml_str(&fm, &["en_name"])
        .or_else(|| yaml_str(&fm, &["title"]))
        .unwrap_or_else(|| humanize(&yaml_str(&fm, &["name"]).unwrap_or_else(|| id.clone())));
    Some(Skill {
        name,
        description: yaml_str(&fm, &["en_description"])
            .or_else(|| yaml_str(&fm, &["description"]))
            .unwrap_or_default(),
        source,
        mode: yaml_str(&fm, &["od", "mode"]),
        surface: yaml_str(&fm, &["od", "surface"]),
        scenario: yaml_str(&fm, &["od", "scenario"]),
        category: yaml_str(&fm, &["od", "category"]),
        platform: yaml_str(&fm, &["od", "platform"]),
        tags: yaml_list(&fm, &["tags"]),
        example_prompt: yaml_str(&fm, &["od", "example_prompt"]),
        preview_entry: yaml_str(&fm, &["od", "preview", "entry"]),
        requires_design_system,
        craft: yaml_list(&fm, &["od", "craft", "requires"]),
        featured: yaml_str(&fm, &["od", "featured"]).is_some_and(|v| v != "false"),
        id,
        dir: dir.to_path_buf(),
        body,
    })
}

/// `magazine-poster` → `Magazine Poster`.
fn humanize(id: &str) -> String {
    id.split(['-', '_'])
        .filter(|w| !w.is_empty())
        .map(|w| {
            let mut c = w.chars();
            match c.next() {
                Some(first) => first.to_uppercase().collect::<String>() + c.as_str(),
                None => String::new(),
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}

fn load_design_system(dir: &Path) -> Option<DesignSystem> {
    let manifest: Value = std::fs::read_to_string(dir.join("manifest.json"))
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or(Value::Null);
    if manifest.is_null() && !dir.join("DESIGN.md").is_file() {
        return None;
    }
    let id = manifest
        .get("id")
        .and_then(Value::as_str)
        .map(str::to_string)
        .unwrap_or_else(|| dir.file_name().unwrap().to_string_lossy().to_string());
    let s = |k: &str| manifest.get(k).and_then(Value::as_str).map(str::to_string);
    Some(DesignSystem {
        name: s("name").unwrap_or_else(|| id.clone()),
        category: s("category"),
        description: s("description"),
        preview_pages: manifest
            .pointer("/preview/pages")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default(),
        id,
        dir: dir.to_path_buf(),
        manifest,
    })
}
