# Demo Video Pipeline — Camera, Cursor, Audio & Encoding

This document describes the demo‑video generation pipeline and the overhaul done to
make renders look like a polished, cinematic product demo (smooth camera, gliding
cursor, navigation‑aware framing, properly aligned narration) and to render faster.

It is a reference for the code in:

- `apps/worker/src/job-processor.ts` — orchestrates the render
- `apps/worker/src/utils/zoom-filter.ts` — the cinematic camera (zoom + pan + drift)
- `apps/worker/src/utils/cursor-fx.ts` — the animated cursor
- `apps/worker/src/utils/smart_trim.ts` — dead‑air trimming
- `apps/worker/src/utils/intro-outro.ts` — intro/outro cards
- `apps/worker/src/utils/encoder.ts` — GPU/CPU encoder selection
- `.opencode/tools/demo-generator.ts` + `.opencode/agents/demo-generator.md` — the agent's tools (`demo_zoom_in`, `demo_narrate`, clicks…) and its prompt

---

## 1. Pipeline at a glance

```
agent (OpenCode `demo-generator` agent + its scoped tools) drives a Playwright browser
        │   emits events into recordings/demo-state.json:
        │     • clickEvents  { videoTimeSec, x, y }
        │     • zoomEvents   { type:'in'|'out', videoTimeSec, x, y, zoom }
        │     • audioClips   { filePath, absoluteTimestamp }   (narration + click SFX)
        ▼
demo.webm  (1920×1080 screen recording)
        │
        │  ffmpeg filter_complex (job-processor.ts):
        │    1. gliding cursor overlay        (cursor-fx.ts)
        │    2. continuous zoom/pan + static holds + trim   (zoom-filter.ts)
        │    3. narration + click-SFX audio mix (adelay + amix)
        ▼
raw_demo.mp4
        │  smart_trim.ts  — cut silent/frozen dead air, force-trim the silent
        │                   setup before the first narration
        ▼
final_demo.mp4
        │  intro-outro.ts — fade content + concat intro/outro cards (single pass)
        ▼
final_with_cards.mp4  → uploaded to S3
```

Two timelines matter and are easy to confuse:

- **`startTime`** — wall‑clock captured right after recording starts. All
  `videoTimeSec` / `absoluteTimestamp` values are relative to this.
- **Raw WebM timeline** — actually begins `trimSec` *before* `startTime`
  (`trimSec = (startTime − videoBirthTimeMs) / 1000`). Overlays added before the
  zoom filter use untrimmed time (`videoTimeSec + trimSec`); the zoom filter then
  trims `trimSec` off the front and resets PTS, so post‑trim time == `videoTimeSec`.
- **Audio mix** — the `adelay`+`amix` track is never trimmed, so it is placed on
  the post‑trim timeline (`videoTimeSec`), NOT the raw WebM timeline.

---

## 2. Cinematic camera (`zoom-filter.ts`)

The camera is driven entirely by the agent's `zoom_in` / `zoom_out` events. The old
filter used fast (0.375 s) **linear** ramps at a hard 2× zoom, with every zoom an
isolated window — so moving focus meant a jarring zoom‑out‑then‑zoom‑in.

The rewrite models the camera as a **continuous path of eased keyframes** and emits
one `zoompan` expression.

### What changed

- **Eased motion** — cosine ease‑in‑out (zero velocity at both ends) instead of
  linear. No more mechanical snap.
- **Pan between targets** — a `demo_zoom_in` issued *while already zoomed* becomes a
  smooth **pan** (center glides at constant zoom) instead of zoom‑out/zoom‑in.
- **Static holds** — during a zoomed hold the camera simply rests on the target.
  This lets the smart trimmer cut silent holds as dead air, while real scrolls
  and pans remain protected by the motion detector.
- **Auto‑fit zoom** — zoom level is derived from the element's bounding box (small
  controls → tighter, large cards → looser) via `fitZoomForBox()`.
- **Off‑viewport clamp** — coordinates that land outside the frame (e.g. an element
  below the fold reporting `y = 1290`) are clamped so the camera never centers on
  empty space.

### Key parameters (top of `zoom-filter.ts`)

| Constant | Value | Meaning |
|---|---|---|
| `ZOOM_IN_DURATION` | `0.6` s | ramp 1× → target |
| `ZOOM_OUT_DURATION` | `0.6` s | ramp target → 1× |
| `PAN_DURATION` | `0.85` s | glide between adjacent targets |
| `DEFAULT_ZOOM` | `1.7` | fallback when no zoom given |

`fitZoomForBox(boxW, boxH, fill = 0.5)` clamps the result to **[1.3, 2.2]**.

### Testable surface

- `planCameraMoves(events)` — pure: turns events into eased `CameraMove[]`
  (incl. pan, drift, clamping). Unit‑tested.
- `fitZoomForBox(...)` — pure. Unit‑tested.
- `buildContinuousZoomFilter(events, trimSec, inputLabel, fps)` — composes the
  ffmpeg string from the moves.

---

## 3. Animated cursor (`cursor-fx.ts`)

Previously a static cursor PNG popped in for ~2 s at each click. Now a single
cursor **glides** between click targets and gives a small **press dip** on each
click. The overlay runs before the zoom filter, so the cursor zooms/pans with the
page.

### Key parameters

| Constant | Value | Meaning |
|---|---|---|
| `GLIDE` | `0.75` s | travel time to a click target |
| `LEAD` | `0.08` s | arrive just before the click lands |
| `PRESS_PX` | `8` px | downward dip on click |
| `PRESS_DUR` | `0.18` s | duration of the press dip |

- `planCursorPath(clicks, trimSec)` — pure: one ordered, clamped resting/arrival
  point per usable click. Unit‑tested.
- `buildGlidingCursorChain(...)` — emits the eased `overlay` filter chain.

> **Important interaction with trimming:** the glide happens just before each
> click. `smart_trim` therefore protects `click − 1.0 s … click + 1.5 s` (was
> `−0.5`) so the glide isn't cut away, which would make the cursor "appear"
> instead of glide.

---

## 4. Navigation‑aware framing (`.opencode/tools/demo-generator.ts`)

**Problem:** when a click navigated to a new page/view, the camera stayed zoomed on
the old click position (a now‑meaningless spot) while the new content sat off‑screen.

**Fix — two layers:**

1. **Auto‑detect (reliable):** the click handler reads `location.href` (via
   `playwright-cli eval`) before and after each click. If it changed *and* the
   camera is zoomed, it auto‑pushes a `zoom_out` event so the new page is shown in
   full before the next `demo_zoom_in`.
2. **Prompt rule (backstop):** the agent is told to zoom out and let the full new
   page show before zooming into any field after a navigation.

This also breaks the "pan" chain at page boundaries, so a `demo_zoom_in` on the new
page is a fresh zoom‑in, not a pan across the navigation.

---

## 5. Smarter zoom decisions & prompt (`demo-generator.ts` tools + `.opencode/agents/demo-generator.md`)

- **Auto‑fit zoom** in `demo_zoom_in` (uses the bounding box; only when the agent
  didn't pass an explicit zoom). Default 1.7, max 2.5.
- **Hover before snapshot** — `demo_zoom_in` hovers the target first so it scrolls
  into view and its bounding box reflects where it'll actually be when clicked
  (root‑cause fix for off‑viewport coordinates). Coordinates are also clamped to
  `[0,1920]×[0,1080]` in both `demo_zoom_in` and the click handler.
- **`demo_zoom_in` is pan‑aware** — its description tells the model that re‑calling
  it while zoomed pans to the new target (don't `demo_zoom_out`/`demo_zoom_in`
  between adjacent fields).
- **Prompt camera rules** (in `.opencode/agents/demo-generator.md`): zoom is a
  *spotlight* used sparingly — only to highlight a real feature/value; **skip**
  login/auth forms, cookie/consent popups, nav, and page loads; **pan** between
  adjacent targets; **zoom out on navigation**. The worker (`job-processor.ts`)
  only sends a small task prompt with `agent: 'demo-generator'` — the behavioural
  spec lives in the agent file, and tools are scoped to this agent only.

---

## 5b. Form filling & visible typing (`demo_fill_field` tool)

Entering text used to be instant (`playwright-cli fill`) — the viewer never saw the
value being typed. The `demo_fill_field` tool fixes that:

```
demo_fill_field({ target: "e53", text: "Acme Corp", submit?: false })
```

- **Single instant fill + a brief hold** — fills the field in one `playwright-cli
  fill` call, then holds ~0.9 s so the entered value is readable (without the hold,
  sequential fills flash by too fast to follow). Character‑by‑character typing was
  tried but **rolled back**: each character is a separate `playwright-cli` process
  spawn (~hundreds of ms of CDP‑connect overhead each), so multi‑field forms blew up
  the recording time — and a longer recording lengthens every encode pass too.
- **Cursor on the field** — records a cursor click + click sound; the cursor reuses
  the coords from the preceding `demo_zoom_in` (no extra snapshot call).
- **No keyboard sound** — removed (a background loop can't line up with keystrokes).

**Prompt rule:** always use `demo_fill_field` for input (never `playwright-cli fill`);
zoom in on the field/form first; and for multi‑field forms, `demo_zoom_in` on each
next field to **pan** the camera there so the viewer watches every value get filled.

### Sound‑sync principle (important)

Every sound effect's `absoluteTimestamp` is the wall‑clock instant of the **visible
action**, and the matching visual is stamped from the same instant:

- **Click** — `click.mp3` and the cursor press‑dip both derive from the same
  `clickTimestamp` (captured right as the click is dispatched), so they fire together.
- **Typing** — visual only (no sound). The render still supports a per‑clip
  `durationSec` (→ `atrim`) so a future per‑action SFX can be clipped to its exact
  length.

Because audio and the cursor overlay share one timestamp, they stay locked to each
other regardless of page‑transition latency.

---

## 6. Narration / audio alignment (`job-processor.ts`)

- **Timeline alignment** — narration `adelay` uses `absoluteTimestamp − startTime`
  (**post-trim** time). The click/zoom overlays add `trimSec` because they run
  BEFORE the `trim=start=trimSec` cut, on the raw WebM timeline; the mixed audio
  track is never trimmed, so it must sit on the post-trim output timeline.
  (An earlier revision added `+trimMs` to the adelay "to match the overlays" —
  that delayed every clip by `trimSec`: invisible at the usual ~2–5 s, but
  catastrophic when a stale-chunk concat inflated `trimSec` to ~236 s. The audio
  ran hundreds of seconds past the video, `leadingTrimSec` then cut away the
  entire demo, and the final video was a static frame under the voiceover.)
  The `firstContentSec` blank-opening clamp is measured on the raw WebM timeline
  and is shifted by `trimSec` before use on the output timeline.
- **No silent intro** — the agent needs a few seconds (navigate, snapshot, reason)
  before its first `demo_narrate`, leaving the opening with no voiceover. The render
  computes the first *narration* clip's start and force‑trims the silent setup
  (`leadingTrimSec`, with a `FIRST_WORD_LEAD_IN = 0.4 s`) via `processVideo(..., {
  forceLeadingTrimSec })`, so the demo opens on the first spoken word.
- **Pacing** — `demo_narrate()` already blocks for the audio duration during recording,
  so the camera naturally holds while the voiceover plays.
- **User‑provided script** — if `parameters.script` is set (the UI's "Voiceover
  Script" field), it's injected into the agent prompt as the source of truth for the
  narration: the agent narrates that content (may re‑chunk/rephrase lightly and time
  it to the actions) rather than writing its own. Blank → the agent writes its own.

---

## 7. Dead‑air trimming (`smart_trim.ts`)

`processVideo(input, output, detectionInput?, opts?)` removes silent + frozen
segments. Changes this session:

- `forceLeadingTrimSec` option — a hard leading trim that survives click/zoom
  protection, used to drop the silent setup before the first narration.
- `ZOOM_RAMP` `0.375 → 0.6` so the longer eased zoom ramps aren't truncated.
- Click protection lead `0.5 → 1.0 s` so the cursor glide is preserved.
- **Parallel analysis** — the silence/freeze/blank/motion passes each decode the
  video independently, so they run via `Promise.all` (analysis costs ~one decode
  of wall‑clock instead of four).
- **Analytic silence** (`opts.speechSegments`) — the worker mixed the narration
  itself, so it passes the exact clip spans and silence is computed as their
  complement; `silencedetect` only runs as a fallback.
- **Single‑pass trim** — keep‑segments are cut with `select`/`aselect` in ONE
  decode+encode instead of per‑segment files + concat. Also removes the
  per‑segment AAC priming samples (~43 ms each) that used to accumulate into
  A/V drift across many joins.
- **Two‑metric motion guard** — amplitude alone (YAVG > 2) mistook ambient
  in‑page animation (an animated hero gradient on mealpe) for scroll travel and
  protected a 12 s silent hold. A real scroll moves the whole viewport, so a
  sample now needs BOTH amplitude > 2 AND > 12 % of pixels changed by ≥ 24 luma
  levels. Calibrated: hero‑glow flicker < 8 % area, real scrolls ≥ 17 % (even on
  a sparse dark page), carousel/page transitions ≥ 13 %. A backstop caps each
  motion island at 6 s so a full‑viewport autoplaying hero video can't protect
  unbounded silence.
- **Narration can't be trimmed** — drops only ever come from silence
  (∩ freezes / pure‑silence), each drop is shrunk 0.15 s on both sides, and with
  analytic speech spans the whole clip file counts as speech regardless of how
  quietly a word trails off (silencedetect at −50 dB could mistake soft speech
  for silence). The forced leading trim is additionally clamped to the first
  narration's start, and the initial‑freeze force‑drop is clamped there too — a
  fully‑rendered page where the agent pauses ~40 s before acting reads as one
  giant opening "freeze", and extending that drop used to delete the first
  narration line entirely.
- **Anchored motion only** — motion islands are kept only when they touch (or
  chain into) an anchor: a narrated keep‑segment, a click window, or a zoom
  window. A lone second of movement floating inside dropped silence has cuts
  (teleports) on both sides anyway, so keeping it just produced a glitchy
  silent quick‑cut montage between narrations.
- **Orphan zoom_out events aren't protected** — `planCameraMoves` ignores a
  zoom_out with no active zoom (visual no‑op), so the trimmer now mirrors that
  and doesn't protect dead footage around them either.

---

## 8. Encoding speed (`encoder.ts` + render passes)

**Why it was slow:** the content was libx264‑encoded ~4× (raw render → trim
segments → intro/outro fade → concat), the main render used the default `medium`
preset, and there was a redundant full‑length fade pass.

**Changes:**

- **`encoder.ts`** — probes NVENC once (cached) and returns GPU args
  (`h264_nvenc -preset p6 -rc vbr -cq Q -spatial-aq 1`) when it works, else
  `libx264 -preset veryfast -crf Q`. Used by the main render, smart‑trim,
  intro/outro and the card clips.
  - `videoEncodeArgs({ quality, cpuPreset })` — quality tiers follow the encode
    chain: main render `q=18` (it's the master every later stage re‑encodes
    from, so generational loss lands on it first), trim + final assembly
    `q=19`, card clips `q=20`.
  - `nvencAvailable()` / `__setNvencForTesting()` (tests).
- **Three content encodes total** — raw render → single‑pass trim → final
  assembly. The final pass concatenates intro + content + outro, stamps the
  watermark AND frames everything on the optional decorative background
  (`background.ts` supplies the mask/shadow geometry) in one `filter_complex`,
  so choosing a background no longer costs an extra generation.
- **Faster presets** everywhere (`fast`/`medium` → `veryfast`).
- **Audio** — one profile everywhere (AAC 24 kHz mono). The narration mix keeps
  `amix=normalize=0` (amix's own normalization would pump as adelayed clips come
  and go) with an `alimiter` after it to stop narration+SFX overlaps clipping.

The worker logs `encoder: h264_nvenc (GPU)` or `libx264 (CPU)` at render start so
you can confirm which path ran.

> **GPU note:** NVENC needs a healthy driver. A "Driver/library version mismatch"
> (kernel module vs userspace libs out of sync) disables it — fix with a reboot.
> The probe falls back to CPU automatically, and the Dockerized prod worker (no GPU)
> always uses the CPU path.

---

## 8b. Intro, outro & watermark (`intro-outro.ts`)

Deliberately minimal — a single still card each, with a gentle fade in/out and silent
audio (`renderCardClip`). No glow, no motion reveal, no chime.

- **Intro** (`generateIntroCard`): `[logo] | [name]` — product logo, a thin vertical
  divider, and the product name, centered. Name‑only if there's no valid logo.
- **Outro** (`generateOutroCard`): "Thank you for watching" with the product **domain**
  (`config.productUrl`) in a rounded **capsule** below.
- **Contrast‑aware background** — `detectLogoLuminance()` reads the logo's
  alpha‑weighted average luminance. A **dark logo → white background**, a **light logo
  → black background** (pure #FFFFFF / #000000), so the logo and text always read.
  No/invalid logo → white.
- **Logo validation** — `isValidImageFile()` checks PNG/JPEG magic bytes first, so a
  broken "logo" (e.g. an HTML error page saved as `.png` by a failed screenshot) is
  ignored rather than rendering a blank space.

**Watermark** — "Powered by trypitch.co", small light‑grey text with a faint dark
shadow (for legibility on light pages), is overlaid **bottom‑center on the whole
video** as the final step of the concat pass (so zoom/pan never moves or crops it).

---

## 9. Tests

Pure logic was extracted so it's unit‑testable (no ffmpeg/browser needed):

| File | Covers |
|---|---|
| `tests/zoom-filter.test.ts` | `fitZoomForBox`, `planCameraMoves` (zoom‑in/out, **pan vs re‑zoom**, static holds, invalid/orphan events, off‑viewport clamp), filter‑string smoke |
| `tests/cursor-fx.test.ts` | `planCursorPath` (ordering, timeline shift, clamp, invalid filtering), overlay chain + press dip |
| `tests/encoder.test.ts` | GPU vs CPU arg selection |

Run them:

```bash
npx vitest run tests/zoom-filter.test.ts tests/cursor-fx.test.ts tests/encoder.test.ts
```

---

## 10. Applying changes & gotchas

- **The worker does NOT auto‑reload.** Its dev script is `bun src/index.ts` (no
  `--watch`). After editing pipeline or plugin code you must **restart the worker**
  (`Ctrl+C` the `make dev`, then `make dev` again — or `bun run dev:worker`).
  A long‑running worker will keep using old code and none of these effects will
  appear.
- **Agents + tools reload with the worker** — OpenCode is spawned per job, so
  restarting the worker picks up `.opencode/agents/*.md` and `.opencode/tools/*.ts`
  too. `opencode.json` no longer registers a demo-tools plugin; each flow
  (demo, PDF, recording-editor) has its own scoped agent + tool module.
- **Source `webm` is cleaned up** after each job, so re‑rendering only the ffmpeg
  stage from a finished job isn't currently possible — verify on a fresh render.
- **Stale/foreign WebM chunks** — `resolveAndCombineWebmFiles` sweeps every `.webm`
  under the video dir (the repo root locally, depth 3). Two contamination sources
  are guarded against: (1) chunks left by a failed attempt that the
  `demo(-N).webm` startup cleanup doesn't match — filtered by mtime against this
  job's recording start (`videoStartedAtMs`); (2) `.playwright-cli/traces/*.webm`,
  the CLI's OWN screencast of the same session — combining it duplicated the
  whole demo in one file and pushed the mtime‑derived birth time (→ `trimSec`)
  hundreds of seconds off; hidden directories are now skipped in both search
  functions. Never remove either guard.

### Tuning cheat‑sheet

| Want… | Change |
|---|---|
| Slower / gentler zoom | `ZOOM_IN/OUT_DURATION`, `PAN_DURATION` in `zoom-filter.ts` |
| Less aggressive zoom level | `DEFAULT_ZOOM`, `fitZoomForBox` clamp range |
| Snappier / slower cursor | `GLIDE`, `LEAD` in `cursor-fx.ts` |
| Stronger click feedback | `PRESS_PX`, `PRESS_DUR` |
| Field fill hold time | the `sleep(900)` in `demo_fill_field` (`demo-generator.ts`) |
| Higher quality vs speed | `quality` in `videoEncodeArgs` calls |

---

## 11. Possible follow‑ups (not done)

- **Premium framing** — inset the screen with rounded corners + soft shadow on a
  branded gradient background; light color grade.
- **Click ripple** — an expanding ring at the click point (deferred; needs extra
  overlay inputs).
- **Captions** — burned‑in narration subtitles.
- **Background music** — low bed with sidechain ducking under narration.
- **Keep the source `webm`** so the ffmpeg post‑stage can be re‑run standalone for
  fast iteration.
