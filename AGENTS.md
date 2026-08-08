# Agent & Worker Guide

## Job flows — keep them isolated

Four independent flows. Each owns its agent prompt, tool module, state files, and
worker processor; they never import from each other.

| Flow | Agent + tools | Worker processor |
|---|---|---|
| AI demo video (`/new`, including PDF/image → video) | `.opencode/agents/demo-generator.md` + `.opencode/tools/demo-generator.ts` | `apps/worker/src/job-processor.ts` |
| Recording edit (upload) | `.opencode/agents/recording-editor.md` + `.opencode/tools/recording-editor.ts` | `apps/worker/src/edit-job-processor.ts` |
| PDF / slides | `.opencode/agents/pdf-generator.md` (+ `.opencode/skills/*`) | `apps/worker/src/pdf-job-processor.ts`, `enhance-job-processor.ts` |
| Launch video (`/launch-video`, HTML/GSAP motion graphics → MP4) | `.opencode/agents/html-video.md` + `.opencode/plugins/html-motion-tools.ts` + skills `html-motion-video`, `agent-browser` | none — driven by `apps/api/src/routes/launch-video.ts` via `@opencode-ai/sdk` (spawns its own opencode server) |

Launch-video layout (ported from github.com/hormuz-labs/launch-videos):

- Projects are self-contained dirs in `projects/<userId>--<name>/` (index.html, css/,
  js/, audio/, vendor/gsap); renders land in `renders/<userId>--<name>-*.mp4`. The
  `<userId>--` prefix is the per-user isolation boundary — the API only exposes the
  bare `<name>` to clients. The (userId, name) → opencode-session map lives in the
  `LaunchVideoProject` DB table.
- `assets/music/` and `assets/sfx/` are the audio libraries (the API also
  auto-imports from `~/Downloads`).
- Skill scripts (`tts.mjs`, `capture.mjs`, …) need `playwright` (hoisted at repo
  root), `ffmpeg`/`ffprobe`, and `GEMINI_API_KEY` for TTS.
- Frontend lives in `apps/web/src/launch-video/` (React port of the source
  SolidJS "Video Studio"); backend helpers in `apps/api/src/lib/launch-video/`.

Rules:

- **Never import across flows.** Demo-only helpers in `job-processor.ts`
  (webm combine, birth-time/trimSec math, narration mixing) must not leak into
  `edit-job-processor.ts` or vice versa. Shared code lives in
  `apps/worker/src/utils/` and nowhere else.
- **Agent tool modules never import worker code or each other.** They communicate
  with the worker only through files in the per-job `recordings/` directory.
- **PDF/image → video is a variant of the AI demo-video flow, not the PDF-output
  flow.** `job-processor.ts` prepares `recordings/assets/<session>/assets.json`,
  stores its path in `demo-config.json`, and uses the normal `demo-generator`;
  the agent continues to emit `demo-state.json` consumed by the same renderer.

## Shared contracts (the only coupling between flows)

- **`recordings/demo-state.json`** — written by BOTH the demo-generator and the
  recording-editor tools, with the same schema (`zoomEvents`, `clickEvents`,
  `audioClips`; all times relative to `startTime` from the flow's config file).
  Keep those shared fields in sync. Flow-specific fields stay local:
  `annotationEvents` belongs to demo generation and protects callouts during
  smart trimming; the recording editor does not emit annotations.
- **`apps/worker/src/utils/*`** (`zoom-filter`, `cursor-fx`, `smart_trim`,
  `intro-outro`, `encoder`, `background`, `job-guard`) — used by multiple flows.
  Keep them pure (no fs/DB side effects beyond their explicit inputs), keep
  exported signatures stable, and keep their tests in `tests/` green. A breaking
  change here hits every flow at once.
- **Timeline semantics** — `startTime` vs the raw WebM timeline (`trimSec`), and
  why the audio mix sits on the post-trim timeline: see
  `docs/demo-video-pipeline.md` §1 and §6 before touching render code.

## Worker

- The worker does **not** hot-reload (`bun src/index.ts`). Restart it after
  editing worker code or anything under `.opencode/` — a running worker keeps
  using the old code.
- Checks before committing: `bunx biome check <changed files>` and
  `bunx vitest run tests/`.
