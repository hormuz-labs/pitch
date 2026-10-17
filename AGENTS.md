# Agent guide

Pitch Studio, rebuilt from scratch in Rust. Nothing from the old TypeScript
codebase is used. A *project* is a folder, a set of conversations, and a live
preview; the agent writes files into the folder and the studio shows them.

```
crates/od/        the server and `od` binary (axum + SQLite + goose)
  src/api.rs        REST + SSE routes
  src/agent.rs      the harness: one goose Agent, a goose session per conversation
  src/tools.rs      the agent's tools (goose in-process extension `od`)
  src/prompt.rs     system prompt: charter, design system, craft, skill, project facts
  src/markers.rs    od-title / od-done / od-next / od-focus turn markers
  src/runs.rs       runs in memory + journaled to <data>/runs/<id>/events.jsonl
  prompts/          prompt texts (third-party, Apache 2.0; see prompts/CHANGES.md)
crates/desktop/    the Tauri desktop app: embeds the server, opens one window
web/              the studio (Solid + Vite), built to web/dist and served by `od`
content/          skills, design templates, design systems, craft notes (Apache 2.0)
```

## Rules

- The agent's tools are ours (`tools.rs`), confined to the project folder by
  real-path checks (`files::resolve`). There is no shell tool; anything that
  needs one is a new tool.
- goose is a git dependency pinned by rev in the root `Cargo.toml`. Its HOME is
  redirected into the data dir at startup so host skills never leak into runs.
- Models come from the model proxy: `OD_MODEL_BASE_URL`, `OD_MODEL_API_KEY`,
  `OD_MODEL`, `OD_MODELS` (picker list), `OD_MODEL_PROTOCOL=openai|anthropic`.
- Agent-written files are served from a separate preview origin
  (`OD_PREVIEW_PORT`, default port+1, or `OD_PREVIEW_ORIGIN` behind its own
  host) by `api::preview_router`; agent HTML must never run with the studio's
  origin. The `/api/projects/:id/raw` route still serves them, with a sandbox
  CSP, for downloads and code views.
- The app name is `APP_NAME` in `web/src/api.ts`. Keep third-party product
  names and marks out of the UI.
- `content/LICENSE`, the LICENSE files inside skills, and
  `crates/od/prompts/CHANGES.md` are licence obligations: keep them.
- Commit small and often.

## Checks

```bash
cargo build && cargo test
cd web && bunx tsc --noEmit && bunx vite build
```

`cargo fetch` needs the git CLI (`.cargo/config.toml` sets it) because the
host rewrites GitHub https URLs to ssh.
