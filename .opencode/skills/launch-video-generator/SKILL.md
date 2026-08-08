---
name: launch-video-generator
description: Use when the user wants to create, build, or generate a launch video, product video, marketing animation, or cinematic animation project. Covers planning scenes, assembling lego animations, writing scene JS files, wiring a GSAP master timeline, and rendering to 4K video. Trigger keywords: launch video, product video, promo video, marketing video, animation project, render video, capture frames.
---

# Launch Video Generator

This skill covers the full workflow for creating a cinematic, GSAP-powered launch/marketing video in this repository — from planning scenes to rendering a 4K H.265 delivery file.

---

## SELF-HEALING: Read This First, Update It Always

This skill maintains a living error log at:

```
.opencode/skills/launch-video-generator/references/KNOWN_ISSUES.md
```

**At the start of every session using this skill:**
1. Read `KNOWN_ISSUES.md` in full before writing any code.
2. Cross-reference every decision you make against its entries.
3. If a known issue applies to what you're about to do, apply the documented fix proactively — do not wait for the error to occur.

**Whenever something goes wrong during a session:**
1. Identify the root cause (not just the symptom).
2. Append a new entry to `KNOWN_ISSUES.md` using the format defined in the "Error Log Format" section below.
3. Also check: does this error invalidate or refine anything already documented in `KNOWN_ISSUES.md`? If so, update that entry's `RESOLUTION` or add a `SUPERSEDES` note.
4. Continue with the corrected approach.

**The goal:** every error that happens once should never happen again. `KNOWN_ISSUES.md` is the institutional memory of this project.

### Error Log Format

Each entry in `KNOWN_ISSUES.md` must follow this exact structure:

```markdown
### ISSUE-<NNN>
**Date:** YYYY-MM-DD
**Category:** <one of: timeline | camera | capture | lego-adaptation | css-layout | gsap-api | rendering | scene-structure | cursor | effects | three-js | other>
**Symptom:** One sentence — what visually or functionally went wrong.
**Root Cause:** One or two sentences — the exact technical reason it failed.
**Affected Files:** Comma-separated list of files or patterns (e.g. `js/main.js`, `scenes/*.js`)
**Resolution:** The exact fix — code snippet if applicable, always be specific enough to copy-paste.
**Prevention Rule:** A single imperative sentence starting with "Always" or "Never" — this is what the agent must follow going forward.
**Tags:** comma-separated keywords for fast lookup (e.g. MASTER_TL, rAF, opacity, camera-scale)
```

Rules for entries:
- `NNN` is zero-padded and sequential (001, 002, ...). Never reuse a number.
- `Resolution` must be actionable. Vague entries like "check the code" are not allowed.
- `Prevention Rule` is the single most important line — it is the distilled lesson.
- If an issue is a duplicate of an existing one, do not add a new entry. Instead, add a `NOTE` line to the existing entry with the date and additional context.
- If an issue is fully resolved and will never recur (e.g. a one-off environment issue), mark it `**Status:** CLOSED` but never delete it.

### When to Update KNOWN_ISSUES.md

| Trigger | Action |
|---------|--------|
| A browser console error appears | Log it immediately, before continuing |
| Frames capture but video looks wrong | Log the visual artifact and what caused it |
| A GSAP tween has no effect | Log which property/element combination failed and why |
| `capture-4k.sh` exits non-zero | Log the ffmpeg/Python error and the flag fix |
| A lego's animation breaks when adapted | Log which lego, what broke, and the porting fix |
| You discover a wrong assumption in this SKILL.md | Log it AND update the relevant section in SKILL.md |
| A fix you applied works | Immediately write the entry so the next session benefits |

### Checking KNOWN_ISSUES.md Before Acting

Before any of these actions, scan `KNOWN_ISSUES.md` for matching tags:

| Action you're about to take | Tags to scan for |
|-----------------------------|-----------------|
| Writing `main.js` | `MASTER_TL`, `syncLoop`, `rAF`, `scene-structure` |
| Adapting a lego | `lego-adaptation`, the lego's folder number |
| Adding camera motion | `camera-scale`, `camera`, `camSet` |
| Wiring a cursor | `cursor`, `getElementCenter`, `hotspot` |
| Running capture | `capture`, `CDP`, `rAF-freeze`, `ffmpeg` |
| Using Three.js legos | `three-js`, `WebGL`, `preserveDrawingBuffer` |
| Writing CSS for scenes | `css-layout`, `opacity`, `z-index`, `overflow` |

---

## Repository Layout

```
product-animation/
├── legos/                      # Reusable self-contained animation building blocks
│   └── <NN>-<name>/index.html  # Each lego is a standalone 1920×1080 HTML animation
├── scripts/
│   ├── README.md               # Pipeline documentation (must-read)
│   ├── capture-frames.py       # CDP WebSocket frame grabber (Python 3)
│   └── capture-4k.sh           # Orchestrator: browser → frames → ProRes → H.265
├── music/
│   └── product-tech.mp3        # Background music (mixed in post)
├── .opencode/skills/launch-video-generator/
│   ├── SKILL.md                # This file
│   └── references/
│       ├── KNOWN_ISSUES.md     # Living error log — read before every session
│       └── assets/
│           └── cursor.svg      # Bibata-style cursor (copy to each project's assets/)
└── workdir/
    └── <project-name>/         # Each video project lives here
        ├── index.html
        ├── css/style.css
        ├── js/
        │   ├── config.js
        │   ├── main.js
        │   ├── utils.js
        │   ├── effects.js
        │   └── scenes/
        │       ├── scene1-hook.js
        │       ├── scene2-problem.js
        │       ├── scene3-solution.js
        │       ├── scene4-features.js
        │       └── scene5-outro.js
        └── assets/
            ├── cursor.svg      # Copied from references/assets/cursor.svg
            └── logo.*          # Downloaded via agent-browser during asset bootstrap
```

---

## Available Lego Animations

Every lego is at `legos/<folder>/index.html`. All expose `window.masterTimeline` (GSAP timeline) and auto-play. Most have a `CONFIG` object at the top for quick re-theming.

| Folder | Effect Summary |
|--------|----------------|
| `03-text-presets` | Typewriter, blur reveal, letter-tracking text effects |
| `04-cinematic-transitions` | Whip-pan streak, lens-distort scale, zoom-out blur between scenes |
| `05-animated-infographics` | Animated infographic cards/stats |
| `06-data-driven` | JSON/CSV dataset drives animated table + cards; dataset switcher |
| `09-lens-flares` | Anamorphic streak + ghost orbs + chromatic aberration; dark→light transition |
| `10-color-grading` | Before/after split panel, CSS filter-based grade, SVG curve draw |
| `14-ui-screen-recording` | Simulated browser/app workflow recording with HUD, REC badge, click ripples |
| `16-node-workflow-activation` | 7-node DAG (workflow graph) with animated data packets along SVG paths |
| `19-sound-design-sync` | Waveform, timeline scrubber, level meters synced to an audio play head |
| `24-true-3d-workspace` | CSS `preserve-3d` laptop opens, types boot code, shows dashboard, camera swoops |
| `27-3d-camera-rig` | Three.js WebGL: hub sphere + 6 UI module cards, 4-shot camera rig |
| `30-dynamic-staggered-reveals` | Full dashboard UI builds in: sidebar → nav → header → grid → chart → counters |
| `34-luma-matte-transitions` | CSS `mask-image` diagonal wipe scene transition |
| `35-automated-batch-rendering` | Spreadsheet-driven batch renderer simulation with progress bar |
| `36-text-scramble-decode` | Characters cycle through glyphs then settle; configurable `CONFIG` |
| `37-split-flap-odometer` | Split-flap board + odometer digit strips — both configurable |
| `39-elastic-wave-text` | Elastic drop, continuous wave, bounce pop text entrance effects |
| `41-text-outline-draw` | SVG stroke draw → fill flood → underline sweep → tagline open |
| `42-chromatic-rgb-split` | RGB channel split + glitch jitter snap-to-register; breathing loop |
| `45-confetti-celebration` | Canvas particle confetti burst + badge pop |
| `47-dolly-zoom-vertigo` | Hitchcock dolly-zoom: background scales, subject stays constant |
| `48-handheld-camera-shake` | Organic handheld drift + three hit event types; REC HUD |
| `49-typewriter-gradient-intro` | Animated gradient bg + multi-phrase typewriter cycle; all via `CONFIG` |
| `51-extreme-text-zoom` | Words rush toward camera (scale to 0.15→1→9 with blur) |
| `55-live-map-tracking` | SVG path-following truck on grid map; route draws, info cards slide in |
| `56-ai-chat-ticker` | Chat UI with vertically-scrolling odometer question ticker |
| `60-wireframe-globe` | Three.js spinning wireframe globe with surface points + halo |
| `63-parallax-pullback-reveal` | Parallax depth layers pull back to reveal a hero |
| `65-drone-follow` | CSS 3D ground plane + truck follows path, world pans like drone follow |
| `66-ken-burns-drift` | Slow Ken Burns drift across 3 gradient frames with crossfade + captions |
| `69-pixelation-match-cut` | Canvas pixelation zoom → dissolve to scene B (seamless match-cut) |
| `71-node-editor-canvas` | CSS 3D infinite canvas: nodes appear, bezier connections draw, camera pulls back |
| `72-label-cloud-flythrough` | CSS 3D fly-through of label cloud from depth haze to lens |

---

## Project Architecture (follow pitch-launch as the reference)

Use `workdir/pitch-launch/` as the canonical reference project. Copy its structure for every new video.

### File responsibilities

| File | Purpose |
|------|---------|
| `config.js` | `window.CONFIG` — total `DURATION`, `COLORS`, scene `START`/`END` timestamps |
| `effects.js` | Background canvas (animated grid, stars, etc.); runs its own rAF loop |
| `utils.js` | `window.PitchUtils` — `getElementCenter`, `createSparkleBurst`, `createClickRipple`, `triggerSpeedLines`, `generatePixels` |
| `scenes/sceneN-name.js` | Self-contained scene; exports a function `initSceneN(tl)` that adds tweens to the master timeline |
| `main.js` | Creates `window.MASTER_TL`, calls all `initSceneN(tl)`, runs `syncLoop()` for live playback |
| `index.html` | `#vp` 1920×1080 container, viewport scaling, all scene markup, `#bgCanvas`, `#camera`, script load order |
| `css/style.css` | CSS custom properties, scene visibility (`opacity: 0` default, GSAP controls), camera `will-change` |

### `config.js` template

The scene keys **must** use the 5-act naming convention. Overlap each boundary by 0.5s.

```js
window.CONFIG = {
  DURATION: 68,   // total seconds — 60–75s for a launch video
  COLORS: {
    accent:  '#00e855',  // primary brand color
    cyan:    '#00f0ff',
    pink:    '#d946ef',
    gold:    '#ffb800',
  },
  SCENES: {
    // Act 1 — Hook (6–8s)
    HOOK_START: 0,        HOOK_END: 7,
    // Act 2 — Problem (10–14s) — starts 0.5s before Hook ends
    PROBLEM_START: 6.5,   PROBLEM_END: 19,
    // Act 3 — Solution (10–14s)
    SOLUTION_START: 18.5, SOLUTION_END: 31,
    // Act 4 — Features (18–28s, 3–4 sub-beats)
    FEATURES_START: 30.5, FEATURES_END: 61,
    // Act 5 — Outro (6–8s)
    OUTRO_START: 60.5,    OUTRO_END: 68,
  },
  CURSOR_TIP_X: -9,
  CURSOR_TIP_Y: -3,
};
```

### `main.js` template

```js
(function () {
  const tl = gsap.timeline({ paused: true });
  window.MASTER_TL = tl;

  // Register GSAP plugins if needed
  gsap.registerPlugin(MotionPathPlugin);

  // Init all 5 acts in order (each adds tweens to tl)
  initScene1Hook(tl);
  initScene2Problem(tl);
  initScene3Solution(tl);
  initScene4Features(tl);
  initScene5Outro(tl);

  // Camera helpers
  const camera = document.getElementById('camera');
  function camSet(props) { gsap.set(camera, props); }

  // Playback (live preview; CDP capture script replaces rAF with timeline stepping)
  let startReal = null;
  function syncLoop() {
    const t = (performance.now() - startReal) / 1000;
    tl.time(Math.min(t, CONFIG.DURATION));
    requestAnimationFrame(syncLoop);
  }
  function startPlayback() {
    startReal = performance.now();
    syncLoop();
  }
  setTimeout(startPlayback, 300);
})();
```

### Scene file template

Each act maps to one scene file. Use the act name in both the function name and the `CONFIG.SCENES` key.

```js
// Example: scene2-problem.js
function initScene2Problem(tl) {
  const S = CONFIG.SCENES.PROBLEM_START;

  // Fade scene in
  tl.to('#scene-problem', { opacity: 1, duration: 0.5 }, S);

  // ... tweens relative to S ...

  // Speed-lines punctuation before exit
  tl.call(() => PitchUtils.triggerSpeedLines(), null, S + 11.5);

  // Fade scene out
  tl.to('#scene-problem', { opacity: 0, duration: 0.4 }, S + 12);
}
```

The naming convention for all 5 acts:

| Act | File | Function | Scene element ID | CONFIG key prefix |
|-----|------|----------|-----------------|-------------------|
| 1 — Hook | `scene1-hook.js` | `initScene1Hook(tl)` | `#scene-hook` | `HOOK_` |
| 2 — Problem | `scene2-problem.js` | `initScene2Problem(tl)` | `#scene-problem` | `PROBLEM_` |
| 3 — Solution | `scene3-solution.js` | `initScene3Solution(tl)` | `#scene-solution` | `SOLUTION_` |
| 4 — Features | `scene4-features.js` | `initScene4Features(tl)` | `#scene-features` | `FEATURES_` |
| 5 — Outro | `scene5-outro.js` | `initScene5Outro(tl)` | `#scene-outro` | `OUTRO_` |

---

## Camera Motion Patterns

The `#camera` element wraps all scenes. GSAP transforms it to create cinematic push-ins, pull-backs, and tilts between scenes.

```js
// Hard-set for scene entry (no animation)
gsap.set(camera, { scale: 1.8, x: 0, y: 0, rotateX: 0, rotateY: 0 });

// Pull back to settle into scene
tl.to(camera, { scale: 1.0, duration: 1.2, ease: 'power2.out' }, S);

// Ken Burns slow drift
tl.to(camera, { scale: 1.06, x: -12, y: -8, duration: 8, ease: 'none' }, S + 0.5);

// Push in to exit scene
tl.to(camera, { scale: 1.8, duration: 1.1, ease: 'power2.in' }, S + 7);
```

Typical scale range per scene type:
- Intro entry: `1.0`, then slow Ken Burns to `1.1`
- After an intro: hard set `1.8`, pull back to `0.85`–`1.0` over `1.2s`
- Exit push: ramp back to `1.8` over `1.1s`
- 3D perspective tilt (optional): `rotateX: 6, rotateY: -4` for dashboard/UI scenes

---

## Narrative Structure — MANDATORY

Every video produced by this skill **must** follow this exact 5-act structure. No deviations without explicit user instruction.

| Act | Scene key suffix | Purpose | Suggested duration |
|-----|-----------------|---------|-------------------|
| 1 — Hook | `HOOK` | Grab attention instantly. Bold visual, a surprising stat, or a provocative question. No product explanation yet. | 6–8s |
| 2 — Problem | `PROBLEM` | Name the pain. Make the viewer feel the friction they experience today. Use data, contrasting visuals, or a "before" state. | 10–14s |
| 3 — Solution | `SOLUTION` | Introduce the product as the answer. High-impact reveal, logo or brand moment, one-line value prop. | 10–14s |
| 4 — Features | `FEATURES` | Show 2–4 key capabilities. Each feature gets its own mini-beat (3–5s). Use UI demos, icons, stats, or workflow animations. | 18–28s |
| 5 — Outro | `OUTRO` | CTA, tagline, logo lock-up, website URL. End on the brand's strongest visual. | 6–8s |

**Total target: 60–75s.** Overlap every act boundary by 0.5s for a crossfade.

---

## Planning Phase — REQUIRED BEFORE ANY CODE

Before writing a single line of HTML, CSS, or JS, the agent **must** produce and output a written plan. Do not skip this step.

### Plan format

Output the following plan as a markdown block in your response:

```
## Video Plan: <project-name>

### Narrative
| Act        | Beat description (1–2 sentences)        | Duration |
|------------|-----------------------------------------|----------|
| Hook       | ...                                     | Xs       |
| Problem    | ...                                     | Xs       |
| Solution   | ...                                     | Xs       |
| Features   | Feature 1: ..., Feature 2: ..., ...     | Xs       |
| Outro      | ...                                     | Xs       |
| **Total**  |                                         | **XXs**  |

### Lego Mapping
| Act       | Lego(s) chosen | Rationale (why this lego fits) |
|-----------|----------------|-------------------------------|
| Hook      | `NN-name`      | ...                           |
| Problem   | `NN-name`      | ...                           |
| Solution  | `NN-name`      | ...                           |
| Features  | `NN-name`, `NN-name` | ...                     |
| Outro     | `NN-name`      | ...                           |

### Timeline
| Act       | START  | END    |
|-----------|--------|--------|
| Hook      | 0      | X      |
| Problem   | X-0.5  | Y      |
| Solution  | Y-0.5  | Z      |
| Features  | Z-0.5  | W      |
| Outro     | W-0.5  | total  |

### Scene Files
- `scene1-hook.js`
- `scene2-problem.js`
- `scene3-solution.js`
- `scene4-features.js`
- `scene5-outro.js`
```

**Only after the plan is written and (if interactive) confirmed by the user, proceed to implementation.**

---

## Asset Bootstrap — REQUIRED BEFORE WRITING HTML

After the plan is confirmed, set up the project's `assets/` folder before touching any HTML or JS. This must happen first because scene files reference assets by path.

### Step 1 — Copy the Bibata cursor

The cursor SVG lives in the skill's `references/assets/` directory. Copy it to the new project:

```bash
cp .opencode/skills/launch-video-generator/references/assets/cursor.svg \
   workdir/<project-name>/assets/cursor.svg
```

The HTML template already references it as `src="assets/cursor.svg"` — no path changes needed as long as this copy is done.

### Step 2 — Download brand assets via agent-browser

Use the `agent-browser` skill to fetch any logos, icons, or images the product/brand needs. Typical sources: the product's official website, their press kit page, or a CDN URL the user supplies.

**Workflow:**

1. Load the `agent-browser` skill.
2. Navigate to the brand's website or press/media kit page.
3. Identify the best available logo (prefer SVG > PNG > WebP; prefer dark/transparent background variant for a dark video).
4. Download the asset and save it to `workdir/<project-name>/assets/`.
5. Note the filename — you will reference it in scene HTML.

**Example agent-browser session:**

```
# Navigate to brand site
agent-browser open https://example.com/brand
# Take screenshot to inspect available assets
agent-browser screenshot
# Download the logo SVG
agent-browser download https://example.com/assets/logo.svg workdir/<project-name>/assets/logo.svg
```

**Asset naming convention:**

| File | Usage |
|------|-------|
| `assets/cursor.svg` | Animated pitch cursor (always present) |
| `assets/logo.svg` | Primary brand logo (SVG preferred) |
| `assets/logo.png` | Fallback if SVG unavailable |
| `assets/icon.svg` | App icon or favicon-scale mark |
| `assets/screenshot-*.png` | UI screenshots for demo scenes |
| `assets/hero-*.png` | Hero/product images for Hook or Solution scenes |

**Rules:**
- Always prefer SVG over raster formats for logos — they scale to 4K without artifacts.
- If a logo has no transparent background, use CSS `mix-blend-mode: screen` or `multiply` in the scene to composite it naturally onto the dark background.
- Never hotlink assets from external URLs in the production `index.html` — download them locally so the project renders offline during capture.
- If the brand has a primary color not in the default palette, add it to `CONFIG.COLORS` in `config.js`.

### Step 3 — Verify assets before writing scenes

```bash
ls workdir/<project-name>/assets/
# Expected minimum: cursor.svg + at least one brand asset
```

Only proceed to scene implementation once this directory contains all required assets.

---

## Scene Planning Workflow

1. **Write the plan first** — follow the Planning Phase section above. Output the full plan before touching any file.
2. **Bootstrap assets** — follow the Asset Bootstrap section. Copy `cursor.svg` and download brand assets via `agent-browser` before writing any HTML or JS.
3. **Determine the narrative** — every video uses the 5-act Hook → Problem → Solution → Features → Outro structure. Map each act to a concrete beat specific to the product being shown.
4. **Map beats to legos** — for each act, pick 1–2 lego animations that best visualize it. Read `legos/<folder>/index.html` to understand the `CONFIG` and adapt it. Refer to the Lego Mapping table in the plan.
5. **Set timing** — target 60–75s total (`CONFIG.DURATION`). Use the timing budget from the narrative structure table:
   - Hook: 6–8s
   - Problem: 10–14s
   - Solution: 10–14s
   - Features: 18–28s (2–4 feature beats at 3–5s each)
   - Outro: 6–8s
   - Leave 0.5s overlap at every act boundary for crossfade
6. **Write scene JS files** — one file per act. Extract relevant GSAP code from the chosen lego's `index.html` into a `scenes/sceneN-name.js` function. All tweens use `S + offset` form relative to `CONFIG.SCENES.<ACT>_START`.
7. **Write scene HTML** — add markup to `index.html` as `<div id="scene-hook" class="scene">`, `<div id="scene-problem" class="scene">`, etc.
8. **Wire in `main.js`** — call `initScene1Hook(tl)`, `initScene2Problem(tl)`, `initScene3Solution(tl)`, `initScene4Features(tl)`, `initScene5Outro(tl)` in timeline order.
9. **Test in browser** — open `workdir/<project>/index.html` via `agent-browser`. Confirm auto-play, timing, and all 5 acts play through.
10. **Render** — run `./scripts/capture-4k.sh http://localhost:PORT 24 DURATION workdir/` (see Rendering section).

---

## HTML Structure

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Project Name</title>
  <link rel="stylesheet" href="css/style.css">
</head>
<body>
  <div id="vp">
    <!-- Background layers -->
    <canvas id="bgCanvas"></canvas>
    <div class="ambient-glow glow-1"></div>
    <div class="ambient-glow glow-2"></div>
    <div class="ambient-glow glow-3"></div>
    <div id="speed-lines"></div>

    <!-- Camera stage — GSAP transforms this for scene transitions -->
    <div id="camera">
      <div id="scene-hook"     class="scene"><!-- Act 1: Hook --></div>
      <div id="scene-problem"  class="scene"><!-- Act 2: Problem --></div>
      <div id="scene-solution" class="scene"><!-- Act 3: Solution --></div>
      <div id="scene-features" class="scene"><!-- Act 4: Features --></div>
      <div id="scene-outro"    class="scene"><!-- Act 5: Outro --></div>
    </div>

    <!-- Cursor (always on top, outside camera) -->
    <img id="pitch-cursor" src="assets/cursor.svg" class="pitch-cursor">
  </div>

  <!-- Scripts: GSAP first, then project files -->
  <script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/MotionPathPlugin.min.js"></script>
  <script src="js/config.js"></script>
  <script src="js/utils.js"></script>
  <script src="js/effects.js"></script>
  <script src="js/scenes/scene1-hook.js"></script>
  <script src="js/scenes/scene2-problem.js"></script>
  <script src="js/scenes/scene3-solution.js"></script>
  <script src="js/scenes/scene4-features.js"></script>
  <script src="js/scenes/scene5-outro.js"></script>
  <script src="js/main.js"></script>
</body>
</html>
```

**Critical:** The viewport div `#vp` must be fixed at `1920×1080px`. Add this to `main.js` or `index.html`:

```js
function scaleViewport() {
  const s = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
  document.getElementById('vp').style.transform = `scale(${s})`;
}
window.addEventListener('resize', scaleViewport);
scaleViewport();
```

---

## CSS Patterns

```css
:root {
  --accent: #00e855;
  --cyan:   #00f0ff;
  --pink:   #d946ef;
  --gold:   #ffb800;
  --bg:     #030303;
  --panel:  rgba(10, 10, 14, 0.6);
}

body { margin: 0; background: var(--bg); overflow: hidden; }

#vp {
  width: 1920px; height: 1080px;
  position: fixed; top: 50%; left: 50%;
  transform-origin: top left;
  translate: -50% -50%;
  overflow: hidden;
}

#camera {
  position: absolute; inset: 0;
  transform-origin: center center;
  will-change: transform;
}

.scene {
  position: absolute; inset: 0;
  opacity: 0;            /* GSAP controls visibility */
  pointer-events: none;
}

.pitch-cursor {
  position: absolute;
  z-index: 9999;
  pointer-events: none;
  will-change: transform, opacity;
  opacity: 0;
}
```

---

## Cursor Animation Pattern

The cursor is an `<img id="pitch-cursor">` that GSAP moves around the scene:

```js
const cursor = document.getElementById('pitch-cursor');

// Show cursor at a position
tl.set(cursor, { opacity: 1, x: startX, y: startY }, S + 2);

// Move to a target element
const center = PitchUtils.getElementCenter('target-element-id');
tl.to(cursor, { x: center.x, y: center.y, duration: 0.8, ease: 'power2.inOut' }, S + 2.5);

// Click: scale pulse + ripple + sparkle
tl.to(cursor, { scale: 0.85, duration: 0.08, yoyo: true, repeat: 1 }, S + 3.3);
tl.call(() => {
  PitchUtils.createClickRipple(center.x, center.y);
  PitchUtils.createSparkleBurst(center.x, center.y, 12);
}, null, S + 3.35);
```

---

## Rendering to 4K Video

### Prerequisites

```bash
npm install -g agent-browser       # Chrome launcher with CDP
pip3 install websockets            # Python CDP client
brew install ffmpeg                # with libx265 and prores_ks support
```

### Quick render

```bash
# Serve the project locally first
cd workdir/<project-name>
python3 -m http.server 8080

# In another terminal, run the capture pipeline
./scripts/capture-4k.sh http://localhost:8080 24 60 workdir/
#                        ^URL                 ^fps ^duration(s) ^output-dir
```

This produces:
- `workdir/<project-name>-prores.mov` — ProRes 422 HQ editing master
- `workdir/<project-name>-4k.mp4` — H.265 delivery file (browser-compatible)

### Manual render (step by step)

```bash
# 1. Launch browser with agent-browser
agent-browser open http://localhost:8080 --viewport 3840x2160

# 2. Get CDP URL
CDP_URL=$(agent-browser get cdp-url)

# 3. Capture frames
mkdir -p /tmp/myproject-frames
python3 scripts/capture-frames.py "$CDP_URL" /tmp/myproject-frames 24 60

# 4. Encode ProRes master
ffmpeg -framerate 24 -i /tmp/myproject-frames/frame-%05d.jpg \
  -c:v prores_ks -profile:v 3 -pix_fmt yuv422p10le -bits_per_mb 8000 \
  workdir/myproject-prores.mov

# 5. Encode H.265 delivery
ffmpeg -i workdir/myproject-prores.mov \
  -c:v libx265 -crf 15 -preset medium -pix_fmt yuv420p \
  -tag:v hvc1 -b:v 20M -maxrate 25M -colorspace bt709 \
  workdir/myproject-4k.mp4
```

### Timing estimate
~100s capture + ~35s ProRes encode + ~50s H.265 encode ≈ **3 minutes** for a 50s animation.
Scale linearly: a 90s animation takes ~5–6 minutes total.

---

## GSAP Quick Reference

```js
// Fade in
tl.to(el, { opacity: 1, duration: 0.5 }, time)

// Slide up + fade in
tl.from(el, { y: 40, opacity: 0, duration: 0.6, ease: 'power2.out' }, time)

// Stagger a NodeList
tl.from('.card', { y: 30, opacity: 0, stagger: 0.1, duration: 0.5 }, time)

// Scale pop with bounce
tl.from(el, { scale: 0, duration: 0.5, ease: 'back.out(2)' }, time)

// SVG stroke draw
gsap.set(path, { strokeDasharray: pathLen, strokeDashoffset: pathLen });
tl.to(path, { strokeDashoffset: 0, duration: 1.5, ease: 'power2.inOut' }, time)

// Counter tick
tl.to(obj, { val: 1000, duration: 2, onUpdate: () => el.textContent = Math.round(obj.val) }, time)

// Motion path along SVG path
tl.to(dot, { motionPath: { path: '#svgPath', align: '#svgPath', autoRotate: true }, duration: 2 }, time)

// Typewriter character by character
const chars = 'Hello World'.split('');
chars.forEach((ch, i) => {
  tl.call(() => { el.textContent += ch; }, null, S + i * 0.07);
});
```

---

## Timeline Rules

- All scene tweens must be **offset from `CONFIG.SCENES.SCENEN_START`**, not absolute times. This makes scenes moveable.
- Scenes overlap by **0.5s** at boundaries: scene N fades out while scene N+1 is already fading in.
- Speed lines (`PitchUtils.triggerSpeedLines()`) fire as scene N starts its exit fade — they are the visual bridge.
- `window.MASTER_TL` **must** be assigned before any playback starts. The CDP capture script targets this exact property name.
- The `syncLoop` in `main.js` uses `requestAnimationFrame`. The CDP capture script replaces `window.requestAnimationFrame = () => 0` to freeze it and instead steps `MASTER_TL.time(t)` frame-by-frame.
- Auto-play 300ms after page load (`setTimeout(startPlayback, 300)`) to let assets settle.

---

## Common Pitfalls (Bootstrap Reference)

> The authoritative and growing list lives in `.opencode/skills/launch-video-generator/references/KNOWN_ISSUES.md`.
> When you encounter a new error, add it there — not here.

| Problem | Fix |
|---------|-----|
| Video freezes at frame 0 | `window.MASTER_TL` not set before capture starts; ensure `main.js` runs first |
| Lego `masterTimeline` vs project `MASTER_TL` | Legos use `window.masterTimeline` (camelCase); production projects use `window.MASTER_TL` (uppercase). Don't mix them |
| Glitchy frames during rAF-based effects | `effects.js` runs its own rAF; CDP script kills all rAF globally, so canvas background freezes too — that is expected and correct |
| Scene content never appears | Scene `opacity` starts at `0`; check that `tl.to('#scene-N', { opacity: 1 }, S)` fires at the right time |
| Camera stuck zoomed in | `camSet({ scale: 1.8 })` hard-sets camera; if `main.js` doesn't call `camSet` before each scene's pull-back tween, camera never resets |
| `getElementCenter` returns wrong coords | Elements must exist in DOM at call time; the function reads `getBoundingClientRect` and divides by viewport scale |
| Three.js legos (27, 60) not capturing properly | WebGL canvas requires `preserveDrawingBuffer: true` on the renderer for screenshot capture |

---

## Adapting a Lego

1. Open `legos/<folder>/index.html` and read the `CONFIG` block and `window.masterTimeline` construction.
2. Copy the relevant scene HTML markup into your project's `index.html` inside a `<div id="scene-N" class="scene">`.
3. Copy the GSAP tweens from the lego's `<script>` block into a new `scenes/sceneN-name.js` file, wrapped in `function initSceneN(tl) { const S = CONFIG.SCENES.SCENEN_START; ... }`.
4. Replace any absolute timeline positions (e.g., `tl.to(el, {}, 2.5)`) with `S + offset` form.
5. Update color references to use `CONFIG.COLORS.*` or CSS custom properties from your project.
6. Add the lego's DOM dependencies (SVG paths, node elements, etc.) to your `index.html`.
7. Import any lego-specific CSS into your `style.css`.

---

## Example: Minimal 5-Act Project Skeleton

**`workdir/my-launch/js/config.js`**
```js
window.CONFIG = {
  DURATION: 68,
  COLORS: { accent: '#00e855', cyan: '#00f0ff', pink: '#d946ef', gold: '#ffb800' },
  SCENES: {
    HOOK_START:     0,    HOOK_END:     7,
    PROBLEM_START:  6.5,  PROBLEM_END:  19,
    SOLUTION_START: 18.5, SOLUTION_END: 31,
    FEATURES_START: 30.5, FEATURES_END: 61,
    OUTRO_START:    60.5, OUTRO_END:    68,
  },
  CURSOR_TIP_X: -9,
  CURSOR_TIP_Y: -3,
};
```

**`workdir/my-launch/js/scenes/scene1-hook.js`**
```js
function initScene1Hook(tl) {
  const S = CONFIG.SCENES.HOOK_START;
  tl.to('#scene-hook', { opacity: 1, duration: 0.4 }, S);
  tl.from('#hook-headline', { y: 40, opacity: 0, duration: 0.8, ease: 'power2.out' }, S + 0.5);
  tl.call(() => PitchUtils.triggerSpeedLines(), null, S + 5.8);
  tl.to('#scene-hook', { opacity: 0, duration: 0.4 }, S + 6.2);
}
```

**`workdir/my-launch/js/main.js`**
```js
(function () {
  const tl = gsap.timeline({ paused: true });
  window.MASTER_TL = tl;
  initScene1Hook(tl);
  initScene2Problem(tl);
  initScene3Solution(tl);
  initScene4Features(tl);
  initScene5Outro(tl);
  function scaleViewport() {
    const s = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
    document.getElementById('vp').style.transform = `scale(${s})`;
  }
  window.addEventListener('resize', scaleViewport);
  scaleViewport();
  let startReal = null;
  function syncLoop() {
    const t = (performance.now() - startReal) / 1000;
    tl.time(Math.min(t, CONFIG.DURATION));
    requestAnimationFrame(syncLoop);
  }
  setTimeout(() => { startReal = performance.now(); syncLoop(); }, 300);
})();
```
