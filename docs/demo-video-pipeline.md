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
- `.opencode/plugins/demo-tools.ts` — the agent's tools (`zoom_in`, `narrate`, clicks…)

---

## 1. Pipeline at a glance

```
agent (OpenCode + demo-tools plugin) drives a Playwright browser
        │   emits events into recordings/demo-state.json:
        │     • clickEvents  { videoTimeSec, x, y }
        │     • zoomEvents   { type:'in'|'out', videoTimeSec, x, y, zoom }
        │     • audioClips   { filePath, absoluteTimestamp }   (narration + click SFX)
        ▼
demo.webm  (1920×1080 screen recording)
        │
        │  ffmpeg filter_complex (job-processor.ts):
        │    1. gliding cursor overlay        (cursor-fx.ts)
        │    2. continuous zoom/pan + Ken Burns + trim   (zoom-filter.ts)
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
- **Pan between targets** — a `zoom_in` issued *while already zoomed* becomes a
  smooth **pan** (center glides at constant zoom) instead of zoom‑out/zoom‑in.
- **Ken Burns drift** — during a zoomed hold the camera drifts in ~6 % so the shot
  never feels frozen, with zoom continuity preserved into the next move.
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
| `KEN_BURNS_FACTOR` | `1.06` | total drift‑in over a hold |
| `KEN_BURNS_MIN_HOLD` | `0.7` s | shortest hold that gets drift |
| `KEN_BURNS_MAX_HOLD` | `4.0` s | cap for a dangling final hold |

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

## 4. Navigation‑aware framing (`.opencode/plugins/demo-tools.ts`)

**Problem:** when a click navigated to a new page/view, the camera stayed zoomed on
the old click position (a now‑meaningless spot) while the new content sat off‑screen.

**Fix — two layers:**

1. **Auto‑detect (reliable):** the click handler reads `location.href` (via
   `playwright-cli eval`) before and after each click. If it changed *and* the
   camera is zoomed, it auto‑pushes a `zoom_out` event so the new page is shown in
   full before the next `zoom_in`.
2. **Prompt rule (backstop):** the agent is told to zoom out and let the full new
   page show before zooming into any field after a navigation.

This also breaks the "pan" chain at page boundaries, so a `zoom_in` on the new
page is a fresh zoom‑in, not a pan across the navigation.

---

## 5. Smarter zoom decisions & prompt (`demo-tools.ts` + prompt in `job-processor.ts`)

- **Auto‑fit zoom** in `zoom_in` (uses the bounding box; only when the agent didn't
  pass an explicit zoom). Default 1.7, max 2.5.
- **Hover before snapshot** — `zoom_in` hovers the target first so it scrolls into
  view and its bounding box reflects where it'll actually be when clicked (root‑cause
  fix for off‑viewport coordinates). Coordinates are also clamped to `[0,1920]×[0,1080]`
  in both `zoom_in` and the click handler.
- **`zoom_in` is pan‑aware** — its description tells the model that re‑calling it
  while zoomed pans to the new target (don't `zoom_out`/`zoom_in` between adjacent
  fields).
- **Prompt camera rules** (in `job-processor.ts`): zoom is a *spotlight* used
  sparingly — only to highlight a real feature/value; **skip** login/auth forms,
  cookie/consent popups, nav, and page loads; **pan** between adjacent targets;
  **zoom out on navigation**.

---

## 5b. Form filling & visible typing (`fill_field` tool)

Entering text used to be instant (`playwright-cli fill`) — the viewer never saw the
value being typed. The `fill_field` tool fixes that:

```
fill_field({ target: "e53", text: "Acme Corp", submit?: false })
```

- **Single instant fill + a brief hold** — fills the field in one `playwright-cli
  fill` call, then holds ~0.9 s so the entered value is readable (without the hold,
  sequential fills flash by too fast to follow). Character‑by‑character typing was
  tried but **rolled back**: each character is a separate `playwright-cli` process
  spawn (~hundreds of ms of CDP‑connect overhead each), so multi‑field forms blew up
  the recording time — and a longer recording lengthens every encode pass too.
- **Cursor on the field** — records a cursor click + click sound; the cursor reuses
  the coords from the preceding `zoom_in` (no extra snapshot call).
- **No keyboard sound** — removed (a background loop can't line up with keystrokes).

**Prompt rule:** always use `fill_field` for input (never `playwright-cli fill`);
zoom in on the field/form first; and for multi‑field forms, `zoom_in` on each next
field to **pan** the camera there so the viewer watches every value get filled.

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

- **Timeline alignment** — narration `adelay` now uses
  `absoluteTimestamp − startTime + trimMs`, putting audio on the raw WebM timeline
  exactly like the click/zoom overlays. Previously it omitted `trimSec`, so audio
  could drift from the visuals.
- **No silent intro** — the agent needs a few seconds (navigate, snapshot, reason)
  before its first `narrate`, leaving the opening with no voiceover. The render
  computes the first *narration* clip's start and force‑trims the silent setup
  (`leadingTrimSec`, with a `FIRST_WORD_LEAD_IN = 0.4 s`) via `processVideo(..., {
  forceLeadingTrimSec })`, so the demo opens on the first spoken word.
- **Pacing** — `narrate()` already blocks for the audio duration during recording,
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
- Per‑segment encode now uses the shared encoder (faster preset / GPU).

---

## 8. Encoding speed (`encoder.ts` + render passes)

**Why it was slow:** the content was libx264‑encoded ~4× (raw render → trim
segments → intro/outro fade → concat), the main render used the default `medium`
preset, and there was a redundant full‑length fade pass.

**Changes:**

- **`encoder.ts`** — probes NVENC once (cached) and returns GPU args
  (`h264_nvenc -preset p5 -rc vbr -cq Q`) when it works, else
  `libx264 -preset veryfast -crf Q`. Used by the main render, smart‑trim, and
  intro/outro.
  - `videoEncodeArgs({ quality, cpuPreset })` — main render `q≈21`, trims/cards `q≈19`.
  - `nvencAvailable()` / `__setNvencForTesting()` (tests).
- **One fewer full‑length encode** — intro/outro fade + concat are now a single
  ffmpeg pass.
- **Faster presets** everywhere (`fast`/`medium` → `veryfast`).

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
- **Outro** (`generateOutroCard`): "Start with {Product}" with the product **domain**
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
| `tests/zoom-filter.test.ts` | `fitZoomForBox`, `planCameraMoves` (zoom‑in/out, **pan vs re‑zoom**, Ken Burns drift, invalid/orphan events, off‑viewport clamp), filter‑string smoke |
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
- **Plugin reloads with the worker** — OpenCode is spawned per job, so restarting
  the worker picks up `.opencode/plugins/demo-tools.ts` too.
- **Source `webm` is cleaned up** after each job, so re‑rendering only the ffmpeg
  stage from a finished job isn't currently possible — verify on a fresh render.

### Tuning cheat‑sheet

| Want… | Change |
|---|---|
| Slower / gentler zoom | `ZOOM_IN/OUT_DURATION`, `PAN_DURATION` in `zoom-filter.ts` |
| Less aggressive zoom level | `DEFAULT_ZOOM`, `fitZoomForBox` clamp range |
| More / less drift | `KEN_BURNS_FACTOR` |
| Snappier / slower cursor | `GLIDE`, `LEAD` in `cursor-fx.ts` |
| Stronger click feedback | `PRESS_PX`, `PRESS_DUR` |
| Field fill hold time | the `sleep(900)` in `fill_field` (`demo-tools.ts`) |
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
