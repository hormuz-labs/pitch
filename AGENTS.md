# Agent & Worker Guide

## Job flows — keep them isolated

Three independent flows. Each owns its agent prompt, tool module, state files, and
worker processor; they never import from each other.

| Flow | Agent + tools | Worker processor |
|---|---|---|
| AI demo video (`/new`, including PDF/image → video) | `.opencode/agents/demo-generator.md` + `.opencode/tools/demo-generator.ts` | `apps/worker/src/job-processor.ts` |
| Recording edit (upload) | `.opencode/agents/recording-editor.md` + `.opencode/tools/recording-editor.ts` | `apps/worker/src/edit-job-processor.ts` |
| PDF / slides | `.opencode/agents/pdf-generator.md` (+ `.opencode/skills/*`) | `apps/worker/src/pdf-job-processor.ts`, `enhance-job-processor.ts` |

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

## API surface (apps/api)

- Two auth schemes: Clerk JWTs (`requireAuth`) for the web app, and user-minted
  API keys (`requireApiKey`, `ApiKey` model → `PitchApiKey` table) for the MCP
  endpoint. `/mcp` mounts before `clerkMiddleware` — never route API-key
  Bearer tokens through Clerk.
- All job creation (REST routes AND MCP tools in `apps/api/src/mcp/`) goes
  through `apps/api/src/lib/job-service.ts`. Never duplicate the
  credit-gate/deduct/enqueue sequence in a new caller — extend the service.
- See `docs/mcp-server.md` for the MCP endpoint, tools, and credit costs.

## Worker

- The worker does **not** hot-reload (`bun src/index.ts`). Restart it after
  editing worker code or anything under `.opencode/` — a running worker keeps
  using the old code.
- Checks before committing: `bunx biome check <changed files>` and
  `bunx vitest run tests/`.
