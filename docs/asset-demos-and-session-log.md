# Asset Demos (PDF / Image → Video) — Feature & Session Log

This document explains the work done to let the demo agent build **interactive,
explanatory, premium demos from PDFs and images** (not just URLs), plus the
supporting fixes made along the way. It covers both the earlier **Kimi Code**
session (which scaffolded the multi-input feature but left it broken) and the
follow-up session that fixed, hardened, and completed it.

> Companion to [demo-video-pipeline.md](demo-video-pipeline.md), which documents
> the core URL-based recording/zoom/cursor pipeline this feature builds on.

---

## 1. Background: how URL demos already worked

The agent produces a demo by driving a real browser via an OpenCode plugin
([.opencode/plugins/demo-tools.ts](../.opencode/plugins/demo-tools.ts)) whose tools
accumulate events into `recordings/demo-state.json`, which the worker later
composites into the final video:

- `zoom_in` / `zoom_out` — a cinematic camera that pans/zooms onto a specific
  element **ref** (e.g. `e53`) read from `playwright-cli snapshot --boxes`.
- a **gliding cursor** overlay ([apps/worker/src/utils/cursor-fx.ts](../apps/worker/src/utils/cursor-fx.ts))
  that travels to click coordinates.
- `narrate` (Gemini TTS), `fill_field` (visible typing), `demo_bash`
  (`playwright-cli` commands).

All attention-direction is anchored to **real DOM elements**. That is why URL
demos feel pointed and alive.

---

## 2. The Kimi Code session (initial multi-input scaffold)

A prior session run under **Kimi Code** (a different CLI agent) started the
"make demos from PDFs/images" feature. Its recovered plan and transcript live at
`~/.kimi-code/sessions/.../session_00dae805-…/`. What it built:

- **API upload endpoint** — [apps/api/src/routes/uploads.ts](../apps/api/src/routes/uploads.ts)
  (`POST /uploads`, multer, MinIO via a new `storage.uploadBuffer`), registered in
  [apps/api/src/index.ts](../apps/api/src/index.ts); `multer` added to
  [apps/api/package.json](../apps/api/package.json).
- **Web file picker** — [apps/web/src/views/CreateView.tsx](../apps/web/src/views/CreateView.tsx)
  (drag/click upload, URL made optional when assets present) + a `postForm`
  helper in [apps/web/src/lib/api.ts](../apps/web/src/lib/api.ts); `assets` forwarded
  through [apps/web/src/App.tsx](../apps/web/src/App.tsx).
- **Worker asset preprocessing** — [apps/worker/src/utils/assets.ts](../apps/worker/src/utils/assets.ts)
  (`prepareAssets`): download assets, `pdftoppm` PDF pages → PNGs, `pdftotext`
  text, `ffprobe` image dims, write an `assets.json` manifest.
- **Agent tools** — `list_assets` and a basic `build_slideshow` (one opaque
  `<img>` per slide) in the plugin; a new
  [.opencode/skills/asset-demo/SKILL.md](../.opencode/skills/asset-demo/SKILL.md);
  `poppler-utils` added to [Dockerfile.base](../Dockerfile.base).

### What Kimi left broken

The session ended mid-edit. Concretely:

- **A syntax-breaking bug**: the `promptText` template literal in
  [apps/worker/src/job-processor.ts](../apps/worker/src/job-processor.ts) was
  missing its closing backtick, so ~60 lines of real code (including the
  `session.prompt()` call) were swallowed into the string. `tsc` reported ~50
  cascading errors and the worker could not build.
- **No tests** for any of the new code.
- The slideshow was **not interactive**: each PDF page/image was a single opaque
  `<img>`, so `zoom_in`/cursor had nothing to target — narration over static
  cross-fades only.

---

## 3. Fixes applied to Kimi's work

1. **Restored the missing backtick** after `${buildSkillsPrompt(skills)}` in
   [job-processor.ts](../apps/worker/src/job-processor.ts) → worker typechecks again.
2. **Normalized tool names**: the prompt/skill referenced `>list_assets` /
   `>build_slideshow`, but the registered tools have no `>` prefix. Fixed so the
   agent calls tools that actually exist.
3. **Rebuilt `packages/storage/dist`** (the API imports `@saas/storage` from
   `dist`, which lacked the new `uploadBuffer`).
4. **Added tests** — [tests/uploads.api.test.ts](../tests/uploads.api.test.ts)
   (real router; auth, empty, single/multi-file, storage failure) and
   [tests/assets.worker.test.ts](../tests/assets.worker.test.ts) (real
   poppler/ffprobe against generated fixtures; PDF→pages+text, image dims,
   hostile-filename sanitization, failed-download skip).
5. **Fixed a real bug the tests caught**: unsupported file types returned a 500
   (multer's `fileFilter` error hit Express's default handler). Wrapped multer in
   [uploads.ts](../apps/api/src/routes/uploads.ts) so filter/size/count errors
   return **400**.

---

## 4. Supporting infrastructure fixes (same session)

### `make dev` startup bug

[Makefile](../Makefile) `make dev` (essential mode) referenced a `transcription`
service that had been **removed from `docker-compose.yml`**. `docker compose up
-d … transcription` errored on the unknown service, so Postgres/Redis/MinIO never
started — causing the `P1001: Can't reach database server at localhost:5433`
error. Fixes:

- Removed the dead `transcription` service from the up command and the menu text.
- `docker compose down` → `down --remove-orphans` (clears stray/renamed containers).
- Replaced the fixed `sleep 3` with `up -d --wait` so migrations never race a
  not-yet-ready database.

### Stuck job + credit-refund bug

A submitted job (`cmr9c6l5i0001ffe6eaen9y2d`, a PDF→demo) was stuck **PENDING**:
created and billed (3 credits) but never enqueued to the worker. Root cause in
[apps/api/src/routes/jobs.ts](../apps/api/src/routes/jobs.ts): `db.createJob()` and
`db.deductCredit()` commit **before** `videoQueue.add()`, with **no rollback** if
the enqueue (or the pub/sub publish) failed — leaving an orphaned PENDING job with
the user's credits spent.

- **Recovered the stuck job**: marked it FAILED and refunded 3 credits.
- **Fixed the bug**: wrapped enqueue + publish in a try/catch that marks the job
  FAILED and refunds the credits on failure (mirrors the cancellation refund path
  already in the file).
- **Regression tests** — [tests/jobs.api.test.ts](../tests/jobs.api.test.ts):
  happy path, insufficient-credit 402, and both rollback cases (queue failure,
  publish failure).

---

## 5. The main feature: interactive, explanatory, premium asset demos

### The core idea

Two facts made this cheap to build without touching the ffmpeg pipeline:

1. **Word coordinates are free.** `pdftotext -bbox` gives exact word boxes for PDF
   pages; `tesseract … tsv` does the same for images (OCR).
2. **`playwright-cli snapshot` is Playwright's ARIA snapshot** — it only refs
   elements with an accessible role. So if each page region is a transparent
   `role="button"` + `aria-label="<the text>"` **hotspot**, the *existing*
   `zoom_in` + cursor machinery targets it exactly like a website element.

So: turn each PDF page / image from one opaque `<img>` into an image **plus a
layer of labelled hotspots**. Then add annotation tools (circle/box/highlighter/
etc.) drawn as **DOM overlays injected via `playwright-cli eval`**, captured by the
recording natively and pan/zoom with the page. This also upgrades the URL path.

**OCR choice:** tesseract (not Gemini vision) — fast (sub-second, offline, in the
existing preprocess step), pixel-exact (Gemini boxes drift), deterministic. The
LLM supplies the *semantics* (it picks a region by its label); tesseract supplies
the *geometry*.

### What was added / changed

| Area | File | Change |
|------|------|--------|
| Region extraction (pure) | [apps/worker/src/utils/regions.ts](../apps/worker/src/utils/regions.ts) **(new)** | Parse `pdftotext -bbox` XML + `tesseract` TSV; group words into phrase-level regions in percent-of-page. Pure & unit-tested. |
| Preprocessing | [apps/worker/src/utils/assets.ts](../apps/worker/src/utils/assets.ts) | Call the extractors; store `pageData[{image, regions}]` (PDF) / `regions` (image) in the manifest. Tesseract-missing degrades gracefully (image still renders). |
| Premium slideshow (pure) | [.opencode/plugins/slideshow.ts](../.opencode/plugins/slideshow.ts) **(new)** | `buildSlideshowHtml`: gradient stage, shadowed rounded page, progress bar, counter, title cards, cross-fades, and a transparent `role="button"` hotspot per region. |
| Slideshow tool | [.opencode/plugins/demo-tools.ts](../.opencode/plugins/demo-tools.ts) | `build_slideshow` now pulls region data from the manifest and emits hotspots. |
| Annotation builders (pure) | [.opencode/plugins/annotations.ts](../.opencode/plugins/annotations.ts) **(new)** | `buildAnnotateEvalJs` / `buildClearAnnotationsJs`: in-page overlay JS for each style, with color sanitization. |
| Annotation tools | [.opencode/plugins/demo-tools.ts](../.opencode/plugins/demo-tools.ts) | `annotate` (styles: `circle`, `box`, `underline`, `highlighter`, `arrow`, `spotlight`) + `clear_annotations`. Target a ref or an explicit rect. Work on URL demos too. |
| Agent guidance | [job-processor.ts](../apps/worker/src/job-processor.ts) + [asset-demo/SKILL.md](../.opencode/skills/asset-demo/SKILL.md) | Teach the snapshot → narrate → zoom_in → annotate → hold → clear choreography. |
| Dependency | [Dockerfile.base](../Dockerfile.base) | Add `tesseract-ocr`. |

### How a hotspot maps onto the image (no JS)

Each slide is `.slide > .page > (img + .hotspots)`. `.page` shrinks to the
contained image (image capped to the stage minus padding: `1728×912`), so hotspot
percentages map onto the image exactly with **no JS measurement**. Hotspots are
`pointer-events: none` (so they never steal nav clicks) but remain in the ARIA
tree, so `playwright-cli snapshot` lists them as `button "Full Name"`, etc.

### How annotations render

`annotate` runs `playwright-cli eval "<fn>" <ref>`. The fn reads the target's live
`getBoundingClientRect()` (or an explicit rect), ensures a fixed `#annotations`
layer + a `<style>` exists, and appends an animated overlay (SVG draw-on circle,
CSS box glow, highlighter swipe with `mix-blend-mode: multiply`, spotlight via a
`box-shadow` mask, etc.). Because it's in-page DOM in a fixed layer, the recording
captures it and the post-processing camera zooms it with the page — **no changes
to the ffmpeg compositing pipeline**.

### End-to-end flow

```
Web upload  → POST /uploads → MinIO → assets[] on the job
Worker      → prepareAssets(): download → pdftoppm/pdftotext -bbox (or tesseract) → assets.json (with regions)
Agent       → list_assets → build_slideshow(pages) → goto file://slideshow.html
            → playwright-cli snapshot  (region hotspots appear as labelled buttons)
            → per field: narrate(focus) → zoom_in(ref) → annotate(ref, style) → hold → clear_annotations → ArrowRight
Recording   → existing zoom/cursor/audio compositing (unchanged); annotations captured as page DOM
```

---

## 6. Tests

New/extended, all passing (full suite **294 passed, 1 skipped**):

- [tests/regions.test.ts](../tests/regions.test.ts) — `parsePdfBbox`,
  `parseTesseractTsv`, `groupWordsIntoRegions` (line merging, column split, cap),
  `decodeXmlEntities`.
- [tests/slideshow.build.test.ts](../tests/slideshow.build.test.ts) — labelled
  hotspots with percent positioning, title card, plain-image slide, auto-advance.
- [tests/annotate.test.ts](../tests/annotate.test.ts) — color sanitization,
  per-style markup, ref vs rect eval JS, backtick-free (shell-safe) output.
- [tests/assets.worker.test.ts](../tests/assets.worker.test.ts) — extended with
  real-poppler PDF region extraction end-to-end.
- [tests/uploads.api.test.ts](../tests/uploads.api.test.ts),
  [tests/jobs.api.test.ts](../tests/jobs.api.test.ts) — from the fixes above.

**Real-browser verification:** a form-like PDF was run through `prepareAssets` →
6 fields extracted → all 6 appeared as labelled ARIA buttons in a real Playwright
Chromium snapshot → `annotate` drew a hand-drawn circle **exactly around "Full
Name"**. Screenshot confirmed the premium look and precise placement.

---

## 7. Commands to run

### Local dev
`poppler-utils` is already installed; only `tesseract` is missing (image OCR only —
PDFs don't need it):

```bash
sudo apt-get install -y tesseract-ocr        # + tesseract-ocr-urd etc. for non-English image OCR
```

Then **restart `make dev`** — the worker dev script is `bun src/index.ts` (no
`--watch`), so it must restart to pick up worker-side changes. No `bun install`
needed (no new npm deps in the feature); the plugin's sibling `.ts` imports are
resolved by opencode/Bun at load time.

### Production
`Dockerfile.base` changed, so the **base image must be rebuilt**. CI
([.github/workflows/deploy.yml](../.github/workflows/deploy.yml)) does this
automatically on push to `main` (it detects `Dockerfile.base` changes, rebuilds
`ghcr.io/hormuz-labs/pitch-base:latest`, then rebuilds/redeploys `api`+`worker`):

```bash
git push          # merge to main → CI rebuilds base + redeploys
```

Manual equivalent (from the deploy host):

```bash
docker build -f Dockerfile.base -t ghcr.io/hormuz-labs/pitch-base:latest .
docker push ghcr.io/hormuz-labs/pitch-base:latest
docker compose -f docker-compose.yml -f docker-compose.prod.yml build api worker
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --remove-orphans
```

> The base rebuild is load-bearing: without it deployed workers lack `tesseract`
> (and `poppler-utils` from the earlier asset work), so image OCR and PDF
> conversion fail. Never hand-deploy `api`/`worker` on the old base.

---

## 8. Notes & limits

- **Non-text images** (pure photos/diagrams with no OCR text) get whole-image +
  rect-based annotation only, not word hotspots.
- **Languages**: PDF text extraction needs no OCR (works for any language,
  including the Urdu-form use case). Image OCR defaults to English; add
  `tesseract-ocr-<lang>` packs as needed.
- **No ffmpeg pipeline changes** — annotations are in-page DOM; hotspots reuse the
  existing zoom/cursor machinery.
