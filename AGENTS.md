# Agent & Studio Guide

Pitch is **one studio with one agent**. A *project* is a workspace directory,
a resumable **pi** session, and a live preview. The user chats; the thread
shows everything the model does; the preview reloads when the agent saves;
things picked in the preview become numbered targets in the next prompt. Read
`docs/studio-architecture.md` before changing anything.

```
apps/api        the server (auth, usage billing, projects, sessions, previews, renders, share, MCP, admin)
apps/web    the app (projects grid, one "new project" door, StudioView, settings…)
.pi/AGENT.md       the agent's base prompt: what a project is, which skill to read
.pi/extensions/    host tools (pi extensions; helpers live in .pi/lib)
.pi/skills/        skills the agent reads on demand — including the four named outcomes
engine/            the shots.js compiler + studio inspector the previews load
packages/          db (Prisma/ZenStack), shared, storage, email
```

## There are no flows

A project is not a category. Nothing decides at creation whether it is "a
deck" or "a demo": the agent gets every tool, reads the request, picks a
pipeline, and can change its mind next turn. That is what lets someone upload
a video and ask for the music to be quieter — a request no per-product flow
owned.

| Pipeline | Host actions | Skill |
|---|---|---|
| launch film | `motion_*` | `launch-video` |
| cinematic promo / brand manifesto | `motion_*` | `promo-video` |
| demo recording | `demo_*`, `storyboard_*` | `demo-video` |
| slide deck | `pdf_*`, `deck_render`, `deck_publish` | `slide-deck` |
| recording edit | `probe_video`, `transcribe_video`, `edit_render` | `recording-edit` |
| shared video editing / post-processing | `video_edit_*`, `media_transcribe`, `media_publish` | `video-editing` |
| generated footage | `video_generate` | `generated-video` |
| anything else | `media_probe`, `media_ffmpeg`, `media_publish` | — |

Rules:

- The agent is `apps/api/src/agent/`: `toolkit.ts` (every extension, every
  skill, the built-ins, the base prompt), `index.ts` (`prepare`, `context`),
  `describe.ts` (what the workspace holds). Add a capability as a host tool
  plus a skill — never as a new flow, and never by branching on `Project.flow`,
  which now only names a directory.
- `describe()` **looks** at the workspace and previews the newest artifact, so
  the preview follows the work. Do not reintroduce a stored notion of what a
  project "is".
- The deck preview is a live editor: `deck.html` served with `?studio=1&edit=1`
  carries `engine/js/deck-editor.js` (pure helpers in `deck-editor-lib.js`),
  the Solid chrome lives in `apps/web/src/solid/studio/deck/`, and saves are
  whole-document writes through `POST /projects/:id/deck` (free, runs no turn;
  the export action flushes pending edits and calls `POST /projects/:id/deck/render`
  before download, so autosaves stay fast and the PDF never lags the editor).
- Dropping a file opens the editor: `POST /projects` with an empty prompt
  creates and seeds the project without running a turn. A target is one of
  three things: a DOM node, a time range on a video (`time` / `endTime`), or a
  file off the asset shelf (`asset`, a workspace-relative path). The first two
  are what to change; the third is material to use.
- The asset shelf (`projects/assets.ts`, `GET|POST /projects/:id/assets`) is
  DERIVED from the workspace, never stored — the agent adds to it without
  telling anyone. Write generated files where the shelf looks (`renders/`,
  `uploads/`) and give them names a person can read on a card.
- Skills are documentation for TOOLS. If a skill tells the agent to run a
  command, that command should be a tool instead — the VM has node and python
  but no ffmpeg, no browser and no network, so most of them have to be.
- `video-editing` is shared by all video-producing skills. `demo-video` owns
  capture only, then references it. `pitch demo source` prepares uncut capture
  plus synchronized narration; `pitch video` inspection/plan/render commands
  execute the server-owned Python backend under `apps/api/src/render/video-editing/`.
- Pipelines live in `apps/api/src/flows/*/` and `pipelines/`. They register
  host actions and export helpers; they never import each other.
- Extensions reach the server only through **host actions**
  (`registerHostAction`, `hostAction()` from `.pi/lib/studio-host.ts`), never
  by importing server code. Every host action is timed — that is how compute
  is metered.
- Built-in tools (`read`, `edit`, `write`, `find`, `grep`, `ls`, `bash`) run
  inside a Gondolin VM: `/workspace` rw, `/engine`, `/.pi/skills`, `/assets`
  ro, no network. It has node and python; it has no ffmpeg, no browser and no
  egress, so anything needing those, or an API key, is a host tool.
- Nothing is charged up front. `projects/usage.ts` meters model spend plus
  host compute and draws down credits as the cost crosses each boundary.
- `apps/api/src/render/` is the ffmpeg pipeline (moved from the old
  worker). Keep it pure — no DB, no storage — and keep `render/utils/*` tests green.
- The directory is the truth: `Project` rows are the registry (owner, session
  file, published outputs, sharing). Status is derived, never stored.

## Server

- Clerk JWTs (`requireAuth`) for the app; API keys (`resolveApiKey`) for `/mcp`
  and `/v1`, mounted before `clerkMiddleware`. `?token=` is accepted on SSE,
  thumbnails and `/files/*`; preview subresources use the signed `pitch_preview` cookie.
- `/projects` is the only creation path (REST, MCP and v1 all go through
  `projects/service.ts createProject`). Never charge credits anywhere else.
- The studio loads `.pi/extensions/*.ts` and `.pi/skills/*` when a session is
  created; restart the server after editing them (open sessions keep the old code).
- Scaling (`apps/api/src/worker/`, docs/studio-architecture.md → Scaling):
  a project is held by one worker under a Postgres lease; `projects/service.ts`
  is the API side (row, credits, placement) and `worker/host.ts` the worker
  side (session, workspace, checkpoints). Anything that touches a workspace or
  a session belongs in the host and is reached through `ownerFor()` — never
  read `projects/<internal>/` from a route. `STUDIO_ROLE=all` (the default and
  `make dev`) is both in one process, so nothing changes locally.
- Heavy host actions (`registerHostAction(name, fn, { remote: true })`: a
  capture, an encode, whisper) run on the render tier when the worker is in
  `STUDIO_RENDER=remote`: `worker/remote.ts` checkpoints the workspace and
  queues a `RenderJob`; `renderer/runner.ts` (role `render`) restores it, runs
  the same action, and ships the files back. An action must therefore read
  only the workspace and the database, and write only into the workspace.
  Sessions are never queued; only these are.
- Docker: `apps/api/Dockerfile` on `pitch-base` (ffmpeg, bubblewrap, Node 22,
  whisper-cli, and the directly launched CloakBrowser binary); compose mounts
  `./projects` and `docker-data/pi`, and `whisper` on the render service. The agent's shell is sandboxed
  with bubblewrap, which needs the `security_opt`/`cap_add` on the api service
  — `make sandbox-check` reports what a given host requires. Linux only: on
  macOS there is no bwrap, so `sandboxMode()` runs the shell unconfined with
  the same scratch environment (`STUDIO_SANDBOX=none|bwrap` overrides).

## GitHub & Tooling

- When running GitHub CLI (`gh`) operations on `hormuz-labs/pitch` (creating issues, PRs, reviews, releases), authenticate using `.github_token` in the repo root: `GH_TOKEN=$(cat .github_token | tr -d '\r\n') gh ...`.
- The token authenticates as `hormuz-labs` (`Hormuz`, alias `agent-hormuz`). When assigning issues or PRs to `agent-hormuz`, use `--assignee hormuz-labs`.

## Checks before committing

The API runs TypeScript directly with Bun, including shared host helpers in
`.pi/lib`. Its tsconfig is a no-emit check with Bun-compatible module resolution;
`bun run build` in `apps/api` validates types. Workspace packages retain their
own emitting builds.

`bunx biome check <changed files>` and `bunx vitest run tests/`; `bunx tsc
--noEmit -p apps/api/tsconfig.json`, `bunx tsc --noEmit -p
apps/web/tsconfig.solid.json` and `bunx tsc --noEmit -p apps/web/tsconfig.node.json`.
