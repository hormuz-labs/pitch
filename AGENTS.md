# Agent & Worker Guide

## Job flows — keep them isolated

Three independent flows. Each owns its agent prompt, tool module, state files, and
worker processor; they never import from each other.

| Flow | Agent + tools | Worker processor |
|---|---|---|
| AI demo video (`/new`) | `.opencode/agents/demo-generator.md` + `.opencode/tools/demo-generator.ts` | `apps/worker/src/job-processor.ts` |
| Recording edit (upload) | `.opencode/agents/recording-editor.md` + `.opencode/tools/recording-editor.ts` | `apps/worker/src/edit-job-processor.ts` |
| PDF / slides | `.opencode/agents/pdf-generator.md` (+ `.opencode/skills/*`) | `apps/worker/src/pdf-job-processor.ts`, `enhance-job-processor.ts` |

Rules:

- **Never import across flows.** Demo-only helpers in `job-processor.ts`
  (webm combine, birth-time/trimSec math, narration mixing) must not leak into
  `edit-job-processor.ts` or vice versa. Shared code lives in
  `apps/worker/src/utils/` and nowhere else.
- **Agent tool modules never import worker code or each other.** They communicate
  with the worker only through files in the per-job `recordings/` directory.

## Shared contracts (the only coupling between flows)

- **`recordings/demo-state.json`** — written by BOTH the demo-generator and the
  recording-editor tools, with the same schema (`zoomEvents`, `clickEvents`,
  `audioClips`; all times relative to `startTime` from the flow's config file).
  The `DemoState` interface is duplicated in both tool modules — keep the two
  copies in sync, and any schema change must update both tools AND the consuming
  processor in the same commit.
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
