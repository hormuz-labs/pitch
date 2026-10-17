//! System prompt composition: the charter stack.
//!
//! The stable part (charter, design system, craft, skill, project facts) is
//! the system prompt; the per-turn part (marker key, workspace snapshot) goes
//! in front of the user's message so the stable prefix stays cacheable.

use serde_json::Value;

use crate::content::{DesignSystem, Library, Skill};
use crate::db::Project;
use crate::files::ProjectFile;

const CHARTER: &str = include_str!("../prompts/charter.md");
const DIRECTION_INDEX: &str = include_str!("../prompts/direction-index.md");
const PLATFORM_CONTRACTS: &str = include_str!("../prompts/platform-contracts.md");
const SHARED_FRAMES: &str = include_str!("../prompts/shared-frames.md");
const DECK_FRAMEWORK: &str = include_str!("../prompts/deck-framework.md");
const ROLE_GUARD: &str = include_str!("../prompts/role-guard.md");
const HOST_PROTOCOL: &str = include_str!("../prompts/host-protocol.md");
pub const DIRECTIONS_JSON: &str = include_str!("../prompts/directions.json");

const PLAN_TOOL_NOTE: &str = "Your task-list tool is `todo_write`: call it with the whole list each time progress changes. The host shows it to the user as a live checklist.";

const PLAN_MODE: &str = "# Plan mode\n\nThe user wants a plan, not a build. Write the plan as a Markdown file in the project (for example `plan.md`, `deck-outline.md` or `prd.md`) that ends with a \"Next step\" section, summarize it briefly, and stop. Do not produce the final artifact this turn.";

const CHAT_MODE: &str = "# Ask mode\n\nThe user is asking a question. Answer in chat. Do not create or change project files and do not produce an artifact.";

const SEMANTIC_NAMES: &str = "## Semantic output file names\n\nName every file you create for what it is: `investor-pitch-deck.html`, `screens/ios-checkout.html`, `brand-spec.md`. Use `index.html` only for a launcher that links several targets or when a runtime requires that exact name.";

const SKILL_WRITE_BOUNDARY: &str = "## Skill files are read-only\n\nFiles under `.od-skills/` are reference material. Never edit them; write any proposed change to a skill as a project `.md` file instead.";

pub struct PromptInputs<'a> {
    pub project: &'a Project,
    pub session_mode: &'a str,
    pub skill: Option<&'a Skill>,
    pub design_system: Option<&'a DesignSystem>,
    pub library: &'a Library,
    pub locale: Option<&'a str>,
}

/// The cache-stable system prompt for a turn.
pub fn system_prompt(input: &PromptInputs) -> String {
    let mut parts: Vec<String> = vec![CHARTER.to_string(), PLAN_TOOL_NOTE.to_string()];
    let kind = input.project.kind();
    let media = matches!(kind, "image" | "video" | "audio");

    match input.session_mode {
        "plan" => parts.push(PLAN_MODE.to_string()),
        "chat" => parts.push(CHAT_MODE.to_string()),
        _ => {}
    }
    if let Some(locale) = input.locale.filter(|l| !l.is_empty()) {
        parts.push(format!(
            "# UI locale override\n\nThe user's interface language is `{locale}`. Write every user-visible string — prose, form copy, follow-up suggestions — in that language unless the user writes in another."
        ));
    }

    let skill_wants_ds = input.skill.is_none_or(|s| s.requires_design_system);
    let active_ds = input.design_system.filter(|_| skill_wants_ds);

    if !media && input.session_mode != "chat" {
        if active_ds.is_none() {
            parts.push(DIRECTION_INDEX.to_string());
        }
        let meta = &input.project.metadata;
        if meta
            .get("platformTargets")
            .and_then(Value::as_array)
            .is_some_and(|t| t.len() > 1)
        {
            parts.push(SHARED_FRAMES.to_string());
        }
        if meta.get("platform").is_some() || meta.get("platformTargets").is_some() {
            parts.push(PLATFORM_CONTRACTS.to_string());
        }
    }

    if let Some(text) = input
        .project
        .custom_instructions
        .as_deref()
        .filter(|t| !t.trim().is_empty())
    {
        parts.push(format!("## Custom instructions (project-level)\n\n{text}"));
    }

    if let Some(ds) = active_ds {
        parts.push(design_system_block(ds));
    }

    let craft = craft_slugs(input.skill, active_ds);
    if !craft.is_empty() {
        let bodies: Vec<String> = craft
            .iter()
            .filter_map(|slug| {
                input
                    .library
                    .craft
                    .get(slug)
                    .map(|b| format!("### {slug}\n\n{b}"))
            })
            .collect();
        if !bodies.is_empty() {
            parts.push(format!(
                "## Active craft references — {}\n\n{}",
                craft.join(", "),
                bodies.join("\n\n---\n\n")
            ));
        }
    }

    if let Some(skill) = input.skill {
        parts.push(skill_block(skill));
    }

    parts.push(SEMANTIC_NAMES.to_string());
    parts.push(project_metadata_block(input.project));

    if kind == "deck" && input.skill.is_none() {
        parts.push(DECK_FRAMEWORK.to_string());
    }

    parts.push(SKILL_WRITE_BOUNDARY.to_string());
    parts.push(ROLE_GUARD.to_string());
    parts.join("\n\n---\n\n")
}

fn design_system_block(ds: &DesignSystem) -> String {
    let mut out = Vec::new();
    out.push(format!(
        "## How to use this design system — {}\n\n{}",
        ds.name,
        ds.usage_md().unwrap_or_else(|| {
            "Bind the tokens below verbatim, build with the components it documents, and do not invent colours, type or spacing outside it.".to_string()
        })
    ));
    if let Some(md) = ds.design_md() {
        out.push(format!(
            "## Active design system — {}\n\nThis document is authoritative for visual decisions. Do not invent tokens outside this palette.\n\n{md}",
            ds.name
        ));
    }
    out.push(format!(
        "Import mode: `{}`. {}",
        ds.import_mode(),
        match ds.import_mode() {
            "verbatim" => "Reproduce the system's components exactly as documented.",
            "hybrid" => "Use the documented components where they exist; compose new ones from the tokens.",
            _ => "Use the normalized tokens; compose components from them.",
        }
    ));
    if let Some(tokens) = ds.tokens_css() {
        out.push(format!(
            "## Active design system tokens\n\nPaste the unscoped `:root {{ ... }}` block verbatim into the artifact's first `<style>`.\n\n```css\n{tokens}\n```"
        ));
    }
    if let Some(manifest) = ds.components_manifest() {
        out.push(format!("## Reference component manifest\n\n```json\n{manifest}\n```"));
    }
    let index = ds.pull_index();
    if !index.is_empty() {
        out.push(format!(
            "## Pull-layer files available on demand\n\nRead any of these with the `design_system_read` tool when you need them:\n\n{}",
            index
                .iter()
                .map(|p| format!("- `{p}`"))
                .collect::<Vec<_>>()
                .join("\n")
        ));
    }
    out.join("\n\n")
}

fn craft_slugs(skill: Option<&Skill>, ds: Option<&DesignSystem>) -> Vec<String> {
    let mut slugs: Vec<String> = skill.map(|s| s.craft.clone()).unwrap_or_default();
    if let Some(ds) = ds {
        for key in ["applies"] {
            if let Some(list) = ds.manifest.pointer(&format!("/craft/{key}")).and_then(Value::as_array)
            {
                for v in list.iter().filter_map(Value::as_str) {
                    if !slugs.iter().any(|s| s == v) {
                        slugs.push(v.to_string());
                    }
                }
            }
        }
    }
    slugs
}

fn skill_block(skill: &Skill) -> String {
    let root = format!(".od-skills/{}/", skill.id);
    let mut out = format!(
        "## Active skill — {}\n\nFollow this skill's workflow exactly.\n\nThe skill's files are staged read-only at `{root}` in the project. Paths in the skill such as `assets/template.html` or `references/layouts.md` are relative to that folder.",
        skill.name
    );
    if skill.body.contains("assets/template.html") || skill.body.contains("references/") {
        out.push_str(&format!(
            "\n\nBefore any other tool, read the files this skill names (for example `{root}assets/template.html` and its `references/*.md`)."
        ));
    }
    out.push_str("\n\n");
    out.push_str(&skill.body);
    out
}

fn project_metadata_block(project: &Project) -> String {
    let mut lines = vec![
        "## Project metadata".to_string(),
        String::new(),
        format!("- Project: {}", project.name),
        format!("- Kind: {}", project.kind()),
    ];
    if let Value::Object(map) = &project.metadata {
        for (key, value) in map {
            if matches!(key.as_str(), "kind" | "nameSource" | "baseDir") {
                continue;
            }
            let rendered = match value {
                Value::String(s) => s.clone(),
                Value::Null => continue,
                other => other.to_string(),
            };
            if rendered.len() > 4000 {
                continue;
            }
            lines.push(format!("- {key}: {rendered}"));
        }
    }
    lines.join("\n")
}

/// The per-turn instructions placed before the user's text.
pub fn turn_preamble(key: &str, files: &[ProjectFile], want_title: bool) -> String {
    let mut out = String::from("# Instructions (read first)\n\n");
    if want_title {
        out.push_str("Conversation title: emit exactly one short title marker, `<od-title>Title Here</od-title>`, 2–6 words in the user's language, anywhere in this turn.\n\n---\n\n");
    }
    out.push_str(&HOST_PROTOCOL.replace("{{KEY}}", key));
    out.push_str("\n\n---\n\n## Design Files workspace\n\nThe Design Files panel is backed by the project folder. Write project files relative to it with semantic names, and inspect what is there before editing.\n\n");
    if files.is_empty() {
        out.push_str("The project is empty.\n");
    } else {
        for f in files.iter().take(80) {
            out.push_str(&format!("- `{}` ({}, {} bytes)\n", f.path, f.kind, f.size));
        }
        if files.len() > 80 {
            out.push_str(&format!("- …and {} more\n", files.len() - 80));
        }
    }
    out.push_str("\n(Do not quote, restate, or echo the # Instructions block above.)\n\n---\n\n# User request\n\n");
    out
}

/// goose renders the system prompt as a minijinja template; keep ours literal.
pub fn as_literal_template(prompt: &str) -> String {
    format!(
        "{{% raw %}}{}{{% endraw %}}",
        prompt.replace("{% endraw %}", "{ % endraw % }")
    )
}
