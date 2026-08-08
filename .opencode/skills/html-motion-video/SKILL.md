---
name: html-motion-video
description: Build After Effects-style product launch videos as multi-file HTML/CSS/GSAP projects (no React, no Remotion) and render them to high-frame-rate MP4 via deterministic seek-and-capture, with per-scene styled AI voiceover, music, and SFX via the Gemini API. Every video gets a bespoke art direction derived from the product's own brand — the agent authors a creative brief (palette, typography, motion language, scene formats, narrative arc) before writing any code. Use this skill whenever the user wants a product launch video, promo, teaser, feature announcement, kinetic typography, motion graphics, "Apple-style" video, a narrated product video, or wants to convert an HTML/CSS/GSAP animation into an MP4.
---

# HTML Motion Video — Bespoke Launch Videos in GSAP → High-FPS MP4

Build cinematic product launch videos as **multi-file HTML/CSS/JS projects with
GSAP** and render them to MP4 with voiceover, music, and SFX. The user is
typically not a motion designer — **you are the creative director**. Never ask
the user "what effects do you want?" — do the recon, author the creative brief
and storyboard, present them, and build.

**The prime directive: every video must look like it was made by the product's
own design team.** Two videos produced by this skill for two different products
must be visually unmistakable for each other. The skill provides *process and
engineering rules*, not a house style. Any aesthetic that appears in this
skill's code examples (dark navy stage, blue/purple glow orbs, glass cards,
Inter font) is **sample data, not a default** — reaching for it without brand
evidence is a failure.

## Workflow at a glance

| Phase | Output | Gate |
|---|---|---|
| 0. Recon | `recon/` facts: exact brand tokens, tone, UI inventory | Colors measured from the live site, not guessed |
| 1. Creative Direction | `direction.md` — decisions on 8 axes, each citing evidence | Passes the Uniqueness Test |
| 2. Storyboard | Scene table: beat, format, VO line + delivery style | Arc & formats follow from direction.md |
| 3. Voiceover First | All VO clips generated & measured → `js/timing.js` | Scene durations derived from real clip lengths |
| 4. Build | Multi-file HTML/CSS/GSAP project, scenes sized to VO | Technical invariants hold; no flicker |
| 5. Music & Mix | Music bed (`assets/music/` first), SFX, `audio/mix.wav` | Levels verified by measurement |
| 6. Render | `renders/<project>-launch.mp4` (shared folder) | Audit passes, duration verified |

Present direction.md + the storyboard to the user in one message, then proceed
to build (don't block waiting for approval unless the user is actively
responding).

---

## Scene-Edit Workflow (for agent-driven scene updates)

When the user edits an *existing* scene via the studio UI, the agent receives a
scoped system prompt identifying which scene to change. Follow this checklist
**instead of** the full Phase 0–6 flow:

### SE-1 — Locate and edit only the target scene

Each scene's animation lives in `js/scenes/<sceneId>.js`. Edit **only** that
file (plus shared CSS in `css/` if the change is visual-only). Do not touch
other scenes' JS, do not regenerate VO unless the user explicitly asks for a
new voiceover line.

```
projects/<name>/
  js/
    scenes/
      scene1.js   ← ONLY this if sceneId=scene1
      scene2.js   ← do NOT touch
  css/            ← shared styles — OK to edit
  js/timing.js    ← only if scene duration changes
```

### SE-2 — Preserve scene duration by default

`js/timing.js` sets each scene's duration derived from its VO clip. Unless the
user asks to lengthen/shorten the scene or wants new VO, keep the duration
unchanged. Changing it shifts all subsequent scene start times.

### SE-3 — Verify with a segment render first

Use `motion_render` with `from`/`to` to render only the changed scene (fast,
no audio mux):

```js
motion_render({
  out: `../../renders/${internalName}-s${sceneIndex}-draft.mp4`,
  from: sceneStart,   // e.g. 6.6
  to: sceneEnd,       // e.g. 14.2
  fps: 30,
})
```

Watch the output — does it match the intent? Fix and re-render the segment
until it looks right.

### SE-4 — Full re-render produces the updated video (NO video concat)

The "stitching" of a changed scene back into the full video is **not** done by
concatenating MP4 segments. The entire video lives in `index.html` as a single
GSAP master timeline. A full render re-captures every frame from scratch:

```js
motion_render({
  out: `../../renders/${internalName}-launch.mp4`,
  fps: 60,
  scale: 1,
})
```

This single command produces the complete updated video with the changed scene
already in place. **Never use `ffmpeg concat` to stitch segment renders** —
cross-scene transitions span segment boundaries and will break.

### SE-5 — Deliver

After the full render succeeds:
- Run `motion_verify_duration` to confirm the MP4 length matches `__DURATION()`.
- The app detects the new render file and reloads the video player automatically.
- Report what changed and how long the new render is.

---

## Phase 0 — Product Recon


Before any creative decision, gather evidence. Recon lives inside the project
folder (`projects/<name>/recon/`) — inspect screenshots in
`recon/screenshots/` and use `agent-browser` for site information (no
screenshots via agent-browser).

### 0.1 Brand-token extraction protocol (MANDATORY — measure, don't guess)

The founders already chose the product's colors and fonts — the video must use
*their* choices. Open the live site and pull the real values from the DOM:

```bash
agent-browser open https://the-product-url.com
agent-browser snapshot > recon/dom.txt
```

Then evaluate JS in the page to read computed styles (agent-browser eval, or a
quick Playwright script) and record into `recon/brand-tokens.md`:

- `getComputedStyle(document.body)` → background color, text color, font stack
- `getComputedStyle(document.documentElement)` → every `--*` CSS custom
  property (design systems keep their whole palette here)
- The primary CTA button (`a[class*=btn], button` with the strongest fill) →
  its exact `background-color` **and `background-image`** (brand identity often
  lives in a gradient, not a flat fill), `color`, `border-radius`, `box-shadow`
- **Accent-frequency scan:** walk all elements, count saturated
  background/text/border colors, rank by usage — reveals the real accent
  hierarchy instead of guessing which color matters
- Link/accent color, `<meta name="theme-color">`, logo SVG fill values
- Heading vs body `font-family`, weights, letter-spacing

Every hex that later appears in `direction.md` must be one of these measured
values or a programmatic tint/shade of one (same hue, shifted lightness).
Inventing a palette when the founders already published one is a recon failure.

### 0.2 The rest of the evidence

- **Voice & tone:** headline copy style (terse? warm? technical?), audience
  (developers, finance teams, consumers, creators), price point / positioning.
- **Product substance:** what the product actually *is* (dashboard? CLI? mobile
  app? API? marketplace?), its 2–3 core value propositions, and the real UI
  screens/flows available in the screenshots.
- **Screenshots are reference material only.** Never place flat screenshot
  images on the canvas — re-create product screens natively in HTML/CSS
  (§ Phase 4) so every element is individually animatable.

## Phase 1 — Creative Direction (the anti-sameness gate)

**Read `references/creative-direction.md` now** — it contains the full decision
playbook. Then write `direction.md` in the project folder, deciding all 8 axes.
Every choice must cite recon evidence ("site uses #FAF9F6 paper background and
a serif display font → editorial light direction"), never taste alone.

The 8 axes (menus and selection heuristics live in the reference):

1. **Palette & background system** — derived from the product's own site.
   Light, dark, or brand-color-field; which of the 8 background treatments.
2. **Typography** — font personality matched to the brand (grotesk, humanist,
   serif editorial, mono), plus scale approach (oversized poster vs restrained).
3. **Motion language** — one named language (Precision / Fluid / Elastic /
   Editorial / Kinetic) that fixes the easing vocabulary, tempo, and
   transition style for the whole video.
4. **Dimensionality** — full 3D camera flythrough vs 2.5D parallax vs flat 2D
   pushes. Not every product deserves 3D.
5. **Composition axis** — horizontal flow, vertical, centered poster,
   split-screen, or asymmetric editorial grid.
6. **Scene formats** — for each storyboard beat, *which* format shows it best:
   reconstructed UI demo, workflow graph, timeline strip, terminal, before/after,
   counters, kinetic type, device frame, integration grid… The reference has a
   value-proposition → format mapping table.
7. **Narrative arc** — Problem→Relief, Demo-first, Manifesto, Montage, or
   Metric-led. Scene count 5–9, not always 8.
8. **Audio persona** — VO voice + delivery style, music genre, SFX density,
   all matched to brand tone (default to a female voice unless the brand or
   user suggests otherwise; the *delivery style* must be brand-specific).

### The Uniqueness Test (must pass before coding)

direction.md must end with explicit answers to:
1. **Swap test:** If I replaced this product's logo with a competitor's, would
   the video still fit? If yes, the direction is generic — redo it.
2. **Evidence audit:** Does every axis choice cite something observed in recon?
3. **Anti-default check:** Am I using near-black background + blue/purple glow
   orbs + glass cards + Inter? That combination is **banned unless the
   product's own site demonstrably uses that aesthetic** — and even then, vary
   the geometry (no "two orbs on both sides").
4. **Signature moment:** Name the one scene a viewer will remember, and why it
   could only belong to this product.

## Phase 2 — Storyboard

Choose the arc and beats per direction.md (arcs and beat menus in
`references/creative-direction.md`). Present a table before coding:

| # | Beat | Duration | Scene format | Visual concept | VO line | VO style |
|---|---|---|---|---|---|---|

Rules:
- Scene count follows the arc and motion language — a Kinetic montage might be
  9 scenes; an Editorial manifesto 5. Storyboard durations are *estimates*;
  real durations come from measured VO in Phase 3.
- Keep VO copy tight: at TTS pace (~2 words/sec), a 7-word line ≈ 3.5s of
  speech. Short lines keep scenes punchy.
- Each VO line gets its own delivery-style instruction matching that beat's
  emotion — never one style string reused across clips.
- Total runtime typically 35–60s.

## Phase 3 — Voiceover First (audio drives the timing)

Generate ALL voiceover clips immediately after the storyboard, **before
building any scenes** — then size each scene to its measured clip instead of
squeezing copy into guessed durations. This kills VO overlap and bleed
problems at the root. Requires `GEMINI_API_KEY` (in the repo `.env` —
`scripts/tts.mjs` finds it automatically).

```bash
node $SKILL/scripts/tts.mjs --voice=Aoede \
  --style="warm, proud, unveiling something extraordinary, measured pace" \
  --text="Meet Acme. Your books, closed in hours." \
  --out=audio/vo_hero.wav
```

1. **Generate one clip per scene** with a scene-specific `--style` (the script
   prints each clip's duration). Regenerate until delivery sounds right — TTS
   varies between runs.
2. **Derive scene durations:** `scene_duration = vo_duration + 1.2s` air
   (minimum 2.5s; give hero/demo scenes extra room if the visual needs it).
   Silent scenes (logo stings, beat drops) keep their storyboard durations.
3. **Write the timing map** to `js/timing.js` so build and mix share one
   source of truth:

```js
// js/timing.js — generated from measured VO clips (Phase 3)
window.SCENE_TIMING = {
  scene1: { dur: 4.1, vo: "audio/vo_cold_open.wav", voDur: 2.9 },
  scene2: { dur: 2.5, vo: null, voDur: 0 },           // silent logo sting
  scene3: { dur: 5.6, vo: "audio/vo_problem.wav", voDur: 4.4 },
  // ...
};
```

4. In Phase 5, each clip's mix delay = its scene label time + ~0.3s — since
   scenes were sized to their clips, non-overlap
   (`clip_start + clip_duration + 0.3s < next_clip_start`) holds by
   construction; still verify after the master timeline exists.

## Phase 4 — Build

### 4.1 Repo & project structure

**Repo layout convention (fixed):** every video project lives under
`projects/<project-name>/` and is fully self-contained — sound, recon, assets,
and audit output all inside the project's own folder, never at repo root.
Rendered deliverables are the ONE exception: **all final MP4s from all
projects go to the shared top-level `renders/` folder**, named with the
project prefix (`<project>-draft.mp4`, `<project>-launch.mp4`,
`<project>-launch-4k.mp4`). No per-project `out/` folders.

```
<repo-root>/
├── projects/
│   └── <project-name>/     # EVERYTHING project-specific lives here
│       ├── direction.md    # The creative brief (Phase 1)
│       ├── recon/          # screenshots/, dom.txt, extracted brand facts
│       ├── assets/         # provided logos/images (if any)
│       ├── index.html      # Thin shell: viewport, camera rig, bg layer, script loader
│       ├── vendor/gsap/    # copied from $SKILL/vendor/gsap — core + ALL plugins
│       ├── css/            # base.css, scenes.css, ui-components.css, cursor.css
│       ├── js/
│       │   ├── timing.js   # SCENE_TIMING map generated from measured VO (Phase 3)
│       │   ├── cursor.js   # CursorController (appear-only-to-act)
│       │   ├── transitions.js
│       │   ├── scenes/sceneN.js  # One module per scene, returns gsap.timeline()
│       │   └── master.js   # Master timeline + __SEEK/__DURATION/__CUES
│       ├── audio/          # VO clips, music bed, SFX, mix.wav — all sound stays here
│       └── audit/          # audit.mjs frame output (generated, gitignored)
└── renders/                # SHARED deliverables folder for ALL projects
    ├── <project>-draft.mp4
    ├── <project>-launch.mp4
    └── <project>-launch-4k.mp4
```

Never build a monolithic single HTML file. Full shell/module/master-timeline/
plugin/cursor code lives in `references/architecture.md`; read it when
scaffolding.

### 4.2 GSAP plugin roster — vendored in the repo; actually use it

The skill ships the **complete GSAP 3.15 dist — core plus every plugin,
including the former Club bonus plugins (SplitText, DrawSVG, MorphSVG,
ScrambleText, Physics2D, CustomBounce/Wiggle, Inertia…) — vendored at
`$SKILL/vendor/gsap/`** (version pinned in `VERSION.txt`). Never depend on
CDNs or on whatever an `npm install` happens to resolve. At scaffold time,
copy the vendor folder into the project and load from there:

```bash
cp -R $SKILL/vendor/gsap projects/<name>/vendor/gsap
```

No per-project `npm install` is needed: the page loads gsap from
`vendor/gsap/*.min.js`, and the render/audit scripts resolve playwright from
`.opencode/node_modules` (if that's ever missing: `cd .opencode && npm
install`). The roster:

- **Text:** SplitText (real plugin — chars/words/lines, plus `mask` line
  reveals), ScrambleTextPlugin, TextPlugin
- **SVG & paths:** DrawSVGPlugin, MorphSVGPlugin, MotionPathPlugin
- **Physics & play:** Physics2DPlugin, PhysicsPropsPlugin, InertiaPlugin, Flip
- **Eases:** CustomEase, CustomBounce, CustomWiggle, EasePack
- **Misc:** Observer, Draggable, ScrollTrigger/ScrollSmoother/ScrollToPlugin
  (rarely useful on a seek-driven timeline), GSDevTools (debug only — never in
  a render build)

**Choose the plugin palette per video in direction.md** — this is a creative
decision, not boilerplate (mapping by motion language in
`references/creative-direction.md`). Most past videos used the same one
stagger recipe for every headline; that's now a checklist failure (§4.5).
Load and register only what the video uses. No shims, ever — the real
plugins are guaranteed present in `vendor/gsap/`.

### 4.3 Camera rig & transitions

Every project uses the global `#viewport > #camera > #stage-scenes` wrapper so
scene changes are camera moves and `__SEEK(t)` stays deterministic. The *style*
of those moves comes from the motion language in direction.md (3D fly-throughs
for Fluid/Kinetic, flat pushes and clip-path wipes for Editorial/Precision —
see the reference). Universal rules regardless of language:

- Scenes chain with **relative offsets** (`">-0.5"`) — absolute timestamp
  placements (`.add(scene(), 21.0)`) are banned.
- **Never show two readable screens at once.** Transition overlap stays short
  (~0.3–0.5s) and both scenes must be visibly in motion during it.
- The per-scene camera/stage drift tween is added **last** in each scene
  function at explicit position `0`, so it overlaps content tweens instead of
  delaying them.

### 4.4 Continuous motion (no static frames) — and NO flicker

From first frame to last, something must always be moving — if two frames
sampled ~1.5s apart look identical, `scripts/audit.mjs` fails the build. Per
scene:

- Continuous camera/stage travel across the full scene duration. Minimums:
  scale travel ≥ 8% (e.g. 1.0 → 1.08) *or* equivalent pan/tilt — expressed in
  the video's motion language (a flat Editorial video drifts x/y instead of
  dollying in 3D).
- **Progressive disclosure:** don't show everything in the first second;
  entrances consume ≥ 40% of the scene.
- At least one **mid-scene event** (cursor click, chart draw, counter, text
  swap, card arrival, spotlight).
- A living background layer appropriate to the chosen background system
  (grid pan, slow gradient evolution, orb drift — whatever direction.md
  picked), moving positionally at constant opacity.
- During every VO sentence, synchronized visual micro-action — static screens
  under speech are forbidden.

**ANTI-FLICKER (HARD RULE).** "Always moving" means *traveling*, not
*blinking*. Infinite `yoyo` opacity/brightness loops — pulsing glows,
shimmering grain, orbs fading in and out, throbbing borders — read as a
broken fluorescent light and have plagued every past demo. Banned:

- No `repeat: -1, yoyo: true` tween on `opacity`, `brightness`, glow
  intensity, or `box-shadow` anywhere. Ambient life comes from **position,
  scale, rotation, or slow hue drift** at constant opacity.
- Light sweeps, spotlight pulses, and glow blooms are **one-shot accents**
  tied to a specific beat (logo lands, button clicked) — max 2–3 per video,
  never looped.
- Grain, if the direction calls for it at all, is a static overlay at fixed
  opacity — it must not shimmer.
- Blinking is allowed only where it *means* something: a terminal caret, a
  recording dot — one element, slow (≥ 0.8s period), small.

### 4.5 Text effects — mandatory variety

Headline animation is a signature, not a utility. **Every video must use at
least 3 distinct text treatments**, chosen in direction.md to fit the motion
language — never the same single char-stagger recipe for every headline.
Menu (recipes in `references/effects-catalog.md`):

- SplitText **line-mask reveals** (`type: "lines", mask: "lines"`) — lines
  rise out of clipped slots; editorial, premium
- SplitText char/word staggers with 3D flips or blur cascades — kinetic,
  bold openers
- **ScrambleText decode** — technical/dev brands, data products
- **Typewriter** (TextPlugin) with a meaningful caret — terminal scenes,
  chat/AI products
- **Word rotator** — one slot, swapping alternatives ("ship *faster* /
  *safer* / *today*")
- **Ink/gradient fill sweep** across a clipped headline — CTAs, brand moments
- **Per-word emphasis pop** mid-VO — scale/color punch on THE word as the
  narrator says it (kills two birds: variety + VO sync)

### 4.6 Cursor policy (single source of truth)

The cursor is a **storytelling device for demonstrating real interactions**,
nothing more:

- Hidden by default. It appears (~0.25s fade) only when there is a genuine
  action — clicking a button, selecting an option — performs it, and leaves.
- **No idle presence, ever.** A cursor breathing in a corner reads as broken.
  Non-interactive scenes (cold open, logo, stats, CTA) have no cursor at all.
- One deliberate click per interaction scene: swoop in on a curved arc
  (separate x/y easings), tilt into the turn, settle, squash-press, ripple,
  elastic release, leave.
- **Pixel-precise targeting:** never hardcode coordinates. Use
  `CursorController.clickElement(selector, { targetTime })` — after master
  assembly, `bindAllClicks()` seeks the timeline to `targetTime`, measures
  `getBoundingClientRect()`, and builds the move to the rendered center.
  Full controller code in `references/architecture.md`.

### 4.7 Technical invariants (hard-won bug rules — always apply)

These are correctness rules, independent of style:

1. **Scope every GSAP selector to its scene ID** (`#scene2 .brand-word`,
   never bare `.brand-word`). GSAP `.from()` uses `immediateRender: true`; an
   unscoped selector in one scene sets `opacity: 0` on matching elements in
   other scenes at load, corrupting their timelines.
2. **`display: inline-block` on every `-webkit-background-clip: text`
   element.** Inline elements can't be transformed, and Chromium fails to
   render clipped gradients when opacity/transform animate on them.
3. **No CSS `filter: blur()` directly on background-clipped text** — it breaks
   the clip in Blink (blurry gradient boxes / invisible glyphs). Blur
   containers or plain text only.
4. **Don't put `visibility: hidden` on `.scene`** if scenes animate `opacity`
   only — GSAP won't clear it unless `autoAlpha` is used. Rely on `opacity: 0`.
5. **Multi-line typewriter cursors** (`.type-line::after`) use
   `display: inline-block`, never `position: absolute; left: 100%` (absolute
   pins the cursor to line 1).
6. **Never run SplitText on gradient wordmarks** (`.brand-word` etc.) —
   `background-clip: text` breaks across child spans. Animate the whole word.
7. **Style split text via SplitText's `charsClass`/`wordsClass`** (e.g.
   `charsClass: "char"`) and target `.char` in CSS — never `.headline span`,
   which matches both word wrappers and char spans and double-renders
   background-clip gradients.
8. **DrawSVG paths are initialized hidden at load time** (`gsap.set(path,
   { drawSVG: "0%" })` in master.js before timeline build), not inside a
   timeline callback — otherwise the path flashes visible→hidden→drawn.
9. **3D anti-flattening:** never `overflow: hidden` or `filter`/
   `backdrop-filter` on elements with `transform-style: preserve-3d` (flattens
   to 2D). `backdrop-filter` on leaf elements only. `perspective` on `#camera`
   or `transformPerspective` per 3D tween.
10. **Capture `CONTENT_DURATION = master.duration()` before** adding any
    infinite-repeat ambient tweens, then expose `__SEEK`/`__DURATION`/`__CUES`.
11. **Determinism:** no CSS animations/transitions, no `gsap.ticker`, no
    `Math.random()` (use the seeded `rng()` helper) — everything lives on the
    master timeline so `__SEEK(t)` is reproducible.
12. **Connector paths route around nodes** — curves through the gaps, never a
    straight line slicing through node cards (reads as strikethrough).
13. **Null tween targets crash the build** — `Uncaught TypeError: Cannot read
    properties of null (reading '_gsap')` means a tween/`gsap.set` received
    `null`: a selector typo, a wrong scene ID, or a script that ran before
    its DOM existed. All scripts load at the **end of `<body>`** (after the
    stage and `#cursor-rig` markup), and any code that captures element
    references verifies them (`if (!el) throw new Error("missing: " + sel)`)
    instead of letting GSAP throw the opaque `_gsap` error.
14. **Strict init order for the cursor:** `CursorController.init()` (captures
    DOM refs) → scenes register clicks via `clickElement()` → master timeline
    assembled → `bindAllClicks()` LAST. `bindAllClicks()` before `init()` has
    crashed builds with the `_gsap` null error — the controller now
    self-guards (re-runs `init()` if refs are missing and skips cleanly when
    the rig isn't in the DOM), but the ordering above is still the contract.
15. **Edge-pinned chrome vs camera drift:** a scene-level scale/pan drift
    clips content pinned to a viewport edge (menu bars, status bars). Set the
    drift's `transformOrigin` to the pinned edge (e.g. `"50% 0%"` for a top
    bar) and budget padding ≥ (scale expansion + max pan) on both sides.
16. **CustomWiggle/CustomBounce need CustomEase loaded AND registered first**
    — otherwise `CustomWiggle.create` crashes with the opaque
    `Uncaught TypeError: h is not a function`.
17. **Text/state swaps stay on the timeline** — crossfade two stacked spans
    (`.from`/`.to` on opacity/scale), never `tl.call(() => el.textContent = …)`
    (breaks backward-seek determinism; the DOM won't restore on `__SEEK(0)`).
18. **SVG annotations (doodles, circles, arrows) target rendered coords, not
    guessed ones** — an `inset: 0` SVG stretches non-uniformly with its host,
    so verify viewBox coordinates against audit frames and recompute; a
    hand-drawn circle that misses its target element reads as broken.

## Phase 5 — Music & Mix

VO clips already exist from Phase 3. Full pipeline detail in
`references/audio-pipeline.md`. The non-negotiables:

- **Music bed — check the shared library FIRST.** The repo keeps curated
  audio libraries at `assets/music/` (music beds) and `assets/sfx/` (SFX);
  the API also auto-imports anything the user drops into `~/Downloads` into
  them, so they're the canonical source. If the library looks thin, check
  Downloads directly too:

  ```bash
  find ~/Downloads -maxdepth 1 \( -iname "*.mp3" -o -iname "*.wav" -o -iname "*.m4a" \) -exec ls -lt {} +
  ```

  Copy the best match into the project (`audio/music.mp3`) — prefer files
  whose names say "background"/"music" and recent downloads; say which file
  you picked. Usable SFX there (click, typing, whoosh, pop) get copied into
  `audio/sfx/` the same way. Only fall back to Lyria generation or a
  royalty-free download when the library and Downloads have nothing suitable.
- **Non-overlap check:** scenes were sized to their clips in Phase 3, so
  `clip_start + clip_duration + 0.3s < next_clip_start` should hold by
  construction — verify against the real master timeline labels anyway.
- **Mix levels (measured, not assumed):** VO dense at ~−18dB mean; hot music
  beds attenuated by −16 to −18dB so the bed sits at ~−28 to −30dB; keep 12–15dB
  VO-over-music contrast. **No `loudnorm` on the final mix** (it pulls quiet
  music up to voice level) — use `alimiter=level=disabled:limit=0.95`.
- **Build the mix step-by-step with intermediate files** (bed → mix → verify).
  Single-pass mega `filter_complex` chains have silently dropped the music
  attenuation before.
- **Verify by extraction:** cut a music-only gap and a VO section to separate
  files, run `volumedetect` on each; if they're within a few dB, re-mix.
- `audio/mix.wav` must extend ≥ 1.0s past `CONTENT_DURATION` — the capture
  script muxes with `-shortest`, so a short mix truncates the video.
- SFX: max ~6 per 30s, −10 to −14dB. Over-SFX'd videos read as template renders.

## Phase 6 — Audit & Render

**Always run both scripts from inside the project folder**
(`projects/<name>/`): audit.mjs writes its `audit/` frames relative to the
CWD, and capture.mjs muxes `audio/mix.wav` relative to the CWD with
`-shortest` — run from elsewhere and a stale mix.wav will silently truncate
the video. Deliverables go to the shared `renders/` folder, prefixed with the
project name.

```bash
cd projects/<name>
SKILL=../../.opencode/skills/html-motion-video

# 1. Motion audit — must pass with zero static-hold warnings (output: ./audit/)
node $SKILL/scripts/audit.mjs index.html

# 2. SEGMENT ITERATION — render individual scenes while polishing them.
#    --from/--to take timeline seconds (get them from __CUES() scene labels).
#    Segment renders skip the audio mux and can run IN PARALLEL (& + wait):
node $SKILL/scripts/capture.mjs index.html --fps=30 --from=0    --to=6.6  --out=../../renders/<name>-s1-draft.mp4 &
node $SKILL/scripts/capture.mjs index.html --fps=30 --from=6.6  --to=14.2 --out=../../renders/<name>-s2-draft.mp4 &
node $SKILL/scripts/capture.mjs index.html --fps=30 --from=14.2 --to=21.0 --out=../../renders/<name>-s3-draft.mp4 &
wait

# 3. FINAL — always ONE full-timeline render (never concat segment files:
#    transitions span scene boundaries, and capture.mjs already parallelizes
#    the full render across ~6 browser workers internally):
node $SKILL/scripts/capture.mjs index.html --fps=30 --scale=1 --out=../../renders/<name>-draft.mp4   # full draft
node $SKILL/scripts/capture.mjs index.html --fps=60 --scale=1 --out=../../renders/<name>-launch.mp4  # final
node $SKILL/scripts/capture.mjs index.html --fps=60 --scale=2 --out=../../renders/<name>-launch-4k.mp4  # optional 4K

# 4. Verify duration matches __DURATION() (not the audio length)
ffprobe -v quiet -show_entries format=duration -of csv=p=0 ../../renders/<name>-launch.mp4
```

Use segment renders liberally during the build — reviewing one 6-second scene
takes seconds, so every scene should be watched and polished in isolation
before the first full draft. Delete segment MP4s from `renders/` once the
final ships.

- **All render/generation commands use a 20-minute timeout (1,200,000 ms).**
- Never use real-time screen recording (MediaRecorder/OS screencast) — only
  the deterministic seek-and-capture pipeline.
- Never use Remotion or React.
- Watch the final MP4 end-to-end: VO sync, music ducking, clean outro fade,
  no dead frames.

---

## Checklist A — Uniqueness (before building)

- [ ] direction.md exists with all 8 axes decided, each citing recon evidence
- [ ] Every hex in direction.md is measured from the live site
      (`recon/brand-tokens.md`) or a tint/shade of a measured value
- [ ] Swap test passed: the direction could only belong to this product
- [ ] Background system chosen from the menu — not defaulted to dark-navy + orbs
- [ ] Typography matches the brand's font personality (not reflexively Inter)
- [ ] One named motion language governs all easings and transitions
- [ ] Plugin palette chosen for this video; ≥ 3 distinct text treatments planned
- [ ] Scene formats chosen per beat from the value-prop mapping (not the same
      8-scene template as the last video)
- [ ] A signature moment is named and is product-specific
- [ ] Audio persona (voice style + music genre) matches brand tone

## Checklist B — Technical (before final render)

- [ ] Project self-contained under `projects/<name>/` (sound in `audio/`,
      recon in `recon/`); deliverables rendered to shared `renders/` with
      project-prefixed filenames
- [ ] Multi-file structure; screens rebuilt natively (no flat screenshots)
- [ ] All selectors scene-scoped; camera drift last at position 0 in each scene
- [ ] All transitions relative-offset; no two readable screens at once
- [ ] Gradient-text rules: inline-block, no blur, not split, `.char` targeting
- [ ] `.scene` visibility handled via opacity (or autoAlpha) only
- [ ] Cursor: hidden by default, appears only to act, seek-measured targeting
- [ ] Connector paths routed around nodes; node icons non-empty
- [ ] `CONTENT_DURATION` captured before infinite ambient; seeded rng only
- [ ] NO flicker: zero infinite opacity/brightness/glow yoyo loops; sweeps and
      pulses are one-shot beat accents (max 2–3 per video)
- [ ] ≥ 3 distinct text treatments actually implemented (not one stagger
      recipe reused); GSDevTools not loaded in the render build
- [ ] VO generated FIRST with per-clip `--style`; scene durations derived from
      measured clips via `js/timing.js`; zero overlap verified on the master
- [ ] Music bed sourced from `assets/music/` (or ~/Downloads) when available
      (file named in the summary); mix levels verified by gap/VO extraction;
      mix extends past duration
- [ ] Every scene reviewed via segment render before the full draft
- [ ] Audit passed with zero warnings; rendered with 20-min timeout; duration
      verified with ffprobe; MP4 watched end-to-end
