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

**Reference studies are pattern libraries, never templates.** Do not copy a
reference video's scene order, shot count, timing, scale values, transition
sequence, palette, assets, or density. Extract the underlying communication
principle, then derive a new execution from the current URL's brand evidence,
product interaction model, audience, and narrative. The product-specific
`direction.md` always outranks optional recipes and observed numeric ranges.
An agent may reject every reference technique when another solution better
serves the product; record that reasoning in `direction.md`.

## Workflow at a glance

| Phase | Output | Gate |
|---|---|---|
| 0. Recon | `recon/` facts: exact brand tokens, tone, UI inventory | Colors measured from the live site, not guessed |
| 1. Creative Direction | `direction.md` — decisions on 8 axes, each citing evidence | Passes the Uniqueness Test |
| 2. Storyboard | Scene table + transition ledger | Arc, focal targets, and boundary flow follow from direction.md |
| 3. Voiceover First | All VO clips generated & measured → `js/timing.js` | Scene durations derived from real clip lengths |
| 4. Build | Multi-file HTML/CSS/GSAP project, scenes sized to VO | Technical invariants hold; no flicker |
| 5. Music & SFX Mix | Music bed (`assets/music/` first), SFX cue sheet → `audio/sfx_bus.wav`, `audio/mix.wav` | Cue sheet builds clean; levels verified by measurement |
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
  scale: 2,   // 4K UHD — the default final quality
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
- **Harvest the product's own media (do this before writing a single scene).**
  The site already contains the assets that make the film look like the brand
  made it: real product screenshots, real photography, real demo footage, and
  the actual logomark as SVG. Take them:

  ```bash
  node $SKILL/scripts/harvest.mjs --url=<product-url>
  # bot-walled site? attach to an anti-detect browser instead:
  node $SKILL/scripts/harvest.mjs --url=<product-url> --cdp=<cloakbrowser CDP url>
  ```

  Writes files to `assets/harvested/` and a manifest to `recon/harvested.json`
  with, for every asset: source URL, real pixel dimensions, video duration, and
  **the section heading it appeared under** — so "the studio photo from the
  Design Freely section" is a thing you can actually look up. It picks the
  largest `srcset` candidate, scrolls to trigger lazy-loading, dedupes by
  content hash, and separates likely logomarks from icons.

  Third-party players (Wistia/YouTube/Vimeo) are reported but not downloaded —
  they are players, not files. Screen-capture the playing embed via CDP or ask
  the user for the source.

  **Rights:** these are the product's own brand assets, and a film about that
  product is the intended use. Never carry them into a different product's
  video, and keep `recon/harvested.json` as the provenance record.

- **Asset truth inventory (MANDATORY):** write `recon/assets.md` listing each
  available logo, app/provider icon, product screenshot, hardware render,
  illustration, and UI state; record its source and whether it is official.
  Prefer provided/official assets over substitutes. Never redraw a recognizable
  brand mark with a generic icon — if `harvest.mjs` pulled the real logo SVG,
  use that file.

- **Use harvested media as real material, not wallpaper.** Real photography and
  real product footage belong in the composition the way the brand uses them —
  in the tiles/cards/device frames of your chosen layout, at the brand's own
  radii. A harvested product video can run as a muted, looping inline clip
  inside a reconstructed frame, which beats a still screenshot every time. The
  ban on "a flat screenshot held static for a whole scene" still applies: the
  asset must be framed, moved, masked, or intercut with native motion.
- **Use the right UI construction mode:** native HTML/CSS for controls that must
  animate internally; a verified real screenshot/image as a base plate for
  complex or third-party surfaces; or a hybrid (real base plate + native
  hotspot, cursor, highlight, and changing state). A flat screenshot left
  unchanged for an entire scene is not a demo, but recreating a real product
  inaccurately is worse. See `references/attention-camera.md`.

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
   Metric-led. Scene count 5–9, not always 8. Whatever the arc, the first 3
   seconds need a designed hook (word-per-beat cadence, color slam,
   morph-to-object — see `references/effects-catalog.md` §27), not a logo
   fading in.
8. **Audio persona** — VO voice + delivery style, music genre, SFX density,
   all matched to brand tone (default to a female voice unless the brand or
   user suggests otherwise; the *delivery style* must be brand-specific).

Also define:

- an **attention-camera grammar**: normal context scale, close-detail scale
  range, preferred focal landing, and focus/release easings; and
- a **cut-first boundary grammar**: scenes normally meet with a clean one-frame
  cut. Opt into a shared-element or match transition only when one real object
  genuinely continues the same causal action and the handoff is cleaner than
  the cut in a boundary render. Never invent an interstitial bridge merely to
  make two unrelated scenes feel connected.

Read `references/attention-camera.md` and `references/scene-transitions.md`
before storyboarding any product-demo beat.

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

| # | Beat | Duration | Scene format | Visual concept | Focal target + camera move | Verified asset(s) | VO line | VO style |
|---|---|---|---|---|---|---|---|---|

Then present a boundary ledger:

| From → To | Clean cut or connected exception | Continuing object | Conserved property | Mechanism | Duration/ease | Sound cue |
|---|---|---|---|---|---|---|

Rules:
- Scene count follows the arc and motion language — a Kinetic montage might be
  9 scenes; an Editorial manifesto 5. Storyboard durations are *estimates*;
  real durations come from measured VO in Phase 3.
- Keep VO copy tight: at TTS pace (~2 words/sec), a 7-word line ≈ 3.5s of
  speech. Short lines keep scenes punchy.
- Each VO line gets its own delivery-style instruction matching that beat's
  emotion — never one style string reused across clips.
- Every product-demo beat names exactly one primary focal target (selector or
  asset), its context framing, focus framing, and release. “Full dashboard” is
  context, never the focal target. If there is no deliberate target, rewrite
  the beat. Non-demo beats (type, brand, stats, CTA) explicitly mark the
  camera column “none — element motion” instead of inventing a zoom; see the
  camera budget in §4.3 and `references/attention-camera.md` §1a.
- Record where each recognizable image/icon comes from. Product and third-party
  UI, app logos, provider logos, and hardware should use verified real assets.
- Every boundary is intentional and defaults to a clean cut. A rare connected
  beat names one surviving real element and conserves its identity, position,
  or meaning; otherwise cut. Reject any handoff that creates a blank frame,
  temporary third composition, arbitrary bridge dot/panel, or visible overlap.
  See `references/scene-transitions.md`.
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
project prefix (`<project>-draft.mp4` for iteration, `<project>-launch.mp4`
for the 4K final). No per-project `out/` folders.

```
<repo-root>/
├── projects/
│   └── <project-name>/     # EVERYTHING project-specific lives here
│       ├── direction.md    # The creative brief (Phase 1)
│       ├── recon/          # screenshots/, dom.txt, brand facts, assets.md
│       ├── assets/         # provided logos/images (if any)
│       ├── index.html      # Thin shell: viewport, camera rig, bg layer, script loader
│       ├── vendor/gsap/    # copied from $SKILL/vendor/gsap — core + ALL plugins
│       ├── css/            # base.css, scenes.css, ui-components.css, cursor.css
│       ├── js/
│       │   ├── timing.js   # SCENE_TIMING map generated from measured VO (Phase 3)
│       │   ├── focus.js    # FocusDirector (measured semantic zoom/pan targets)
│       │   ├── cursor.js   # CursorController (appear-only-to-act)
│       │   ├── transitions.js
│       │   ├── scenes/sceneN.js  # One module per scene, returns gsap.timeline()
│       │   └── master.js   # Master timeline + __SEEK/__DURATION/__CUES
│       ├── audio/          # VO clips, music bed, SFX, mix.wav — all sound stays here
│       └── audit/          # audit.mjs frame output (generated, gitignored)
└── renders/                # SHARED deliverables folder for ALL projects
    ├── <project>-draft.mp4     # 1080p/30fps iteration draft
    └── <project>-launch.mp4    # final deliverable — 4K UHD (scale=2) @ 60fps
```

Never build a monolithic single HTML file. Full shell/module/master-timeline/
plugin/cursor code lives in `references/architecture.md`; read it when
scaffolding.

### 4.1b Wire the harvested assets in — before writing scenes

Phase 0 pulled the product's real logomark, screens and footage. **Use them
now.** The failure mode is not disagreeing with the rule, it is forgetting: by
the time you are deep in scene code, the files sit unused in
`assets/harvested/` while a hand-drawn approximation goes into the CTA.

- Copy what the film uses into `assets/` with clear names (`mark.svg`,
  `wordmark.svg`) and reference them, or inline the SVG markup so it can
  inherit `currentColor`.
- **A logotype is a drawing, not a word.** Never retype a brand's wordmark in
  a substitute font — if their logo is pixel lettering, using Inter for the
  name is as wrong as redrawing the mark.
- Inlining a harvested SVG fragment? **Self-close the shape tags.** Browsers
  parse `<rect …>` from a live DOM fine, but pasted into your HTML an unclosed
  `<rect>` *nests* instead of forming siblings, and only the first one renders.

`audit.mjs` fails the build if a harvested logomark is never referenced or
inlined (`--allow-missing-logo` to opt out for a film with no lockup).

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
- **Never show two complete readable screens at once.** Transition overlap is
  normally ~0.3–0.8s depending on the bridge, and both scenes/bridge must be
  visibly in motion during it.
- **Cut first.** End the outgoing scene cleanly and start the incoming scene on
  the next frame. Use a connected handoff only when the same verified object
  literally continues the same action and a boundary-only render proves it is
  clearer than the cut. Blank color holds, arbitrary bridge dots/panels,
  surface-expansion interstitials, and generic fade/zoom/whip transitions are
  banned. A bridge must never become a temporary third scene.
- Product-demo beats use **semantic reframes**, not an automatic slow zoom:
  context → eased lateral zoom+pan to the active control/content → readable
  hold → lateral rack or cut. **Scale is never standalone emphasis.** A scale
  change is allowed only when a material horizontal reframe is required to
  acquire or follow an interaction; otherwise keep scale fixed and use layout,
  crop, contrast, or element motion. Measure targets from the rendered DOM and
  keep the target inside safe margins; do not guess x/y.
- **Camera budget: not every scene gets a reframe.** Typing beats get a
  nonlinear zoom+horizontal-pan acquisition that settles before the first
  character; progressively filling content tracks laterally at held scale;
  type/brand/stat/CTA scenes get element motion only. Budget ~2–5 deliberate
  reframes per film and normally one scale acquisition per demo scene. Between
  nearby targets, hold scale and pan—never release wide and re-zoom. Every
  scale tween uses a visibly nonlinear acceleration/deceleration curve; linear
  scale and ambient push-ins are banned. The full rules are in
  `references/attention-camera.md` §1a–1c.
- Add the camera/scene transform track **last** in each scene function at
  explicit positions, so it overlaps content tweens instead of delaying them.
  Where no semantic reframe is called for, use a restrained ambient drift at
  position `0`. Full rules and implementation patterns:
  `references/attention-camera.md`.

### 4.4 Continuous motion (no static frames) — and NO flicker

From first frame to last, something must always be moving — if two frames
sampled ~1.5s apart look identical, `scripts/audit.mjs` fails the build. Per
scene:

- Continuous meaningful travel across the scene: semantic camera reframes,
  element motion, or — only between focal actions — restrained camera/stage
  drift. A linear 1.0 → 1.08 zoom is ambient texture, not attention direction.
  For UI scenes, at least one active target must become materially more legible
  through a zoom+pan, crop/reveal, or layout reframe.
- **Progressive disclosure:** don't show everything in the first second;
  entrances consume ≥ 40% of the scene.
- At least one **mid-scene event** (cursor click, chart draw, counter, text
  swap, card arrival, spotlight). Note its exact timeline position as you build
  it — that number becomes a Phase 5 SFX cue, and reconstructing it later from a
  draft render is guesswork.
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
  elastic release, leave. Two licensed variants (each at most once per video):
  the **flip-and-press** — the cursor tumbles ~90–135° during travel, snaps
  upright, presses, and exits still spinning; and the **cargo carry** — the
  cursor transports fanned assets and drops them into a container that opens
  to receive them. Recipes: `references/effects-catalog.md` §29–30.
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
19. **Every scene must be invisible outside its own time window.** Each
    `.scene` starts hidden, fades in at its label, and master.js explicitly
    fades it OUT (`autoAlpha: 0`) at the end of its window — never rely on the
    next scene covering the previous one. A missing fade-out makes scenes
    accumulate on top of each other in the final MP4 (the classic "scenes
    overlapping" bug). `audit.mjs` samples every scene's midpoint and **fails
    the build** if any non-active scene has opacity ≥ 0.05 — do not render
    until it passes.
20. **Zero-duration `.set()` tweens leak across measurement seeks.** Binding
    passes (FocusDirector, CursorController, TransitionDirector) seek the
    master timeline to measure targets; when the playhead crosses a timeline
    whose position-0 `.set()` changes visibility, the set's values can stay
    applied after the final rewind — e.g. a transition bridge dot parked
    visibly mid-screen from frame 0. Rules: (a) any visibility change inside a
    seek-crossed timeline is a `0.01s` `.to(..., { ease: "none" })`, never a
    `.set()`; (b) overlay/bridge elements (`#bridge-*`, `#cursor-*`) default to
    `opacity: 0` in CSS; (c) after building, probe them at several times
    (t=0, mid-scenes, post-transition) and assert opacity 0 outside their
    window — a leaked bridge is invisible to the scene-overlap audit because
    it lives above all scenes.

### 4.8 Two more invariants, learned the expensive way

21. **A scene's trailing fade-out is load-bearing twice.** It hides the scene,
    AND its end time is what `master.duration()` reports — which is the base
    every subsequent relative label offset (`"-=0.30"`) is measured from.
    Removing or shortening it for one scene silently pulls **every later label
    earlier**. This shifted scenes 7–8 by 2.1s in a finished film and desynced
    the audio against an already-rendered 4K master. If a connected boundary
    needs its outgoing scene hidden sooner, add a *second*, earlier fade
    (later-inserted tweens win during the overlap) — never delete the first.

    Corollary: **scene start times have exactly one authority — the page.**
    Export them with `scripts/cues.mjs` and place VO/SFX against those numbers.
    Summing `SCENE_TIMING[].dur` is only correct when every boundary is a plain
    cut, so it will quietly disagree with the picture the moment you overlap one.

```bash
node $SKILL/scripts/cues.mjs        # → audio/cues.json (real labels + duration)
```

22. **Ambient motion must live ON the master timeline.** `gsap.to(...)` creates a
    tween on the global ticker, i.e. wall-clock time — and `__SEEK` does not
    control that. The renderer captures frames by seeking, out of order, across
    parallel workers, so a ticker-driven background sits somewhere different on
    every frame and the finished video **shakes** instead of drifting. It looks
    perfectly smooth in a live browser, so it passes review and only shows up in
    the MP4. Add ambient with `master.to(el, {...}, 0)` AFTER capturing
    `CONTENT_DURATION`. `audit.mjs` fails the build on this — it seeks to the
    same timestamp twice and compares the frames.

## Phase 5 — Music, SFX & Mix

VO clips already exist from Phase 3. Full pipeline detail in
`references/audio-pipeline.md`; **sound-effect design has its own reference,
`references/sfx-design.md` — read it before writing a cue sheet.**

### 5.0 Sound effects (the layer that sells the motion)

Motion graphics without sound design read as a slideshow with music over it.
Every meaningful state change — an element appearing, a tile expanding, a
counter landing, a cursor clicking, a scene cutting — either earns a sound or is
deliberately silent.

Never browse the raw SFX folders: they hold 900+ files and a large fraction is
meme/game-rip/weapon audio that must never reach a client render. The usable
subset is measured, classified and curated in `references/sfx-index.json`.

```bash
node $SKILL/scripts/sfx.mjs query --list                 # the 17-event vocabulary
node $SKILL/scripts/sfx.mjs query --event=pop --max=0.6  # ranked candidates, measured
node $SKILL/scripts/sfx.mjs build --cues=audio/sfx-cues.json --duration=<CONTENT_DURATION>
```

Non-negotiables:

- **Write `audio/sfx-cues.json` from real timeline numbers** — the labels in
  `audio/cues.json` (from `scripts/cues.mjs`) plus the offsets you actually
  animated. Never eyeball them off a draft, and never sum `SCENE_TIMING`
  durations instead (see invariant #21).
- **`sfx.mjs build` places every cue by its measured onset**, so the transient
  lands on the frame. 218 of 310 curated clips carry pre-transient silence (up
  to 2.2s), which is why hand-written `adelay` chains always drifted late.
- **Travel sounds peak on the beat, not start on it** — the tool applies a
  class lead (0.22s for `whoosh_deep`). Fast or large motion takes
  `whoosh_deep`; only small element travel takes `whoosh_soft`.
- **Budget ~6 cues per 30s**, one signature sound per scene. The build warns
  past that. Sounding every stagger item, or every transition, is the clearest
  tell of template sound design.
- **The build must finish with zero `⚠` lines** other than a density warning you
  have consciously accepted. Placement and off-target-source warnings are gates.

### 5.1 The mix — narration above everything

```bash
node $SKILL/scripts/mix.mjs --duration=<CONTENT_DURATION> \
  --music=audio/music.mp3 --sfx=audio/sfx_bus.wav
```

`mix.mjs` assembles the VO stem, carves and ducks the music bed against it,
folds in the SFX bus, and then **verifies by extraction** — it measures real VO
windows against real music-only gaps and exits non-zero if the voice is not
≥10dB above the bed. A failing mix is a gate, not a warning: do not render.

The non-negotiables for music and the final mix:

- **Music bed — check the curated shared library FIRST.** Use only
  `assets/music/` for music beds and `assets/sfx/` for SFX. Never scan home,
  Downloads, or other personal directories. Copy the best approved match into
  the project (`audio/music.mp3`) and name the chosen file. Only fall back to
  Lyria generation or a royalty-free download when the curated library has
  nothing suitable.
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
- The SFX bus is a separate stem: build `audio/sfx_bus.wav` first, then fold it
  into `audio/mix.wav` under the VO. Verify by extraction that it sits 10–14dB
  under the voice — see `references/sfx-design.md` §4.

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

# 1. Motion audit — must pass with zero static-hold AND zero scene-overlap
#    warnings (output: ./audit/). The overlap check fails the build if any
#    scene is still visible at another scene's midpoint (missing fade-out).
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
#    the full render across ~6 browser workers internally).
#    The final deliverable is 4K UHD (scale=2) by default:
node $SKILL/scripts/capture.mjs index.html --fps=30 --scale=1 --out=../../renders/<name>-draft.mp4   # full draft (fast, 1080p)
node $SKILL/scripts/capture.mjs index.html --fps=60 --scale=2 --out=../../renders/<name>-launch.mp4  # final — 4K UHD

# Every render burns in the "Powered by trypitch.co" watermark automatically
# (bottom-centre, Sorts Mill Goudy, scaled to the output) — the same mark the
# demo-video flow applies. Pass --no-watermark for a white-label deliverable.

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
- [ ] Attention-camera grammar defines context/detail scales, lateral landing,
      a nonlinear focus ease, and the interaction that justifies each zoom
- [ ] Boundary grammar is cut-first; every optional connected handoff names the
      continuing real object and must beat a clean cut in a boundary render
- [ ] Plugin palette chosen for this video; ≥ 3 distinct text treatments planned
- [ ] Scene formats chosen per beat from the value-prop mapping (not the same
      8-scene template as the last video)
- [ ] A signature moment is named and is product-specific
- [ ] Audio persona (voice style + music genre) matches brand tone

## Checklist B — Technical (before final render)

- [ ] Project self-contained under `projects/<name>/` (sound in `audio/`,
      recon in `recon/`); deliverables rendered to shared `renders/` with
      project-prefixed filenames
- [ ] Multi-file structure; UI construction mode chosen per beat (native,
      verified real base plate, or hybrid) and no unchanged screenshot scene
- [ ] `harvest.mjs` run for the target URL; real logo SVG, product screenshots
      and any product footage pulled into `assets/harvested/` with provenance
- [ ] The harvested logomark is actually USED (referenced or inlined) — the
      audit gate enforces this; no hand-drawn marks, no logotype retyped in a
      substitute font
- [ ] Official/product assets used for recognizable logos, icons, UI, and
      hardware; aspect ratios preserved and asset sources recorded
- [ ] Every product-demo beat has one named focal target and a deliberate
      context → focus → hold → release/cut plan
- [ ] Camera budget respected (~2–5 reframes per film, normally one scale
      acquisition per demo scene, none in pure type/brand/stat/CTA scenes);
      every zoom includes material horizontal travel, uses nonlinear easing,
      settles before typing, then tracks filling content at held scale
- [ ] Bridge/cursor overlays probed hidden outside their windows (invariant
      20) — no leaked `.set()` state parked on screen
- [ ] Every boundary was reviewed as a direct cut first; any retained connected
      handoff uses one verified continuing object, creates no blank/interstitial
      frame, aligns exactly, and hides all bridge assets afterward
- [ ] All selectors scene-scoped; camera transform tracks added last and overlap
      content at explicit timeline positions
- [ ] All transitions relative-offset; no two readable screens at once
- [ ] Gradient-text rules: inline-block, no blur, not split, `.char` targeting
- [ ] `.scene` visibility handled via opacity (or autoAlpha) only; every scene
      explicitly fades out at the end of its window and the audit's scene
      overlap check passes with zero violations
- [ ] Cursor: hidden by default, appears only to act, seek-measured targeting
- [ ] Connector paths routed around nodes; node icons non-empty
- [ ] `CONTENT_DURATION` captured before infinite ambient; seeded rng only
- [ ] NO flicker: zero infinite opacity/brightness/glow yoyo loops; sweeps and
      pulses are one-shot beat accents (max 2–3 per video)
- [ ] ≥ 3 distinct text treatments actually implemented (not one stagger
      recipe reused); GSDevTools not loaded in the render build
- [ ] VO generated FIRST with per-clip `--style`; scene durations derived from
      measured clips via `js/timing.js`; zero overlap verified on the master
- [ ] Music bed sourced from the curated `assets/music/` library when available
      (file named in the summary); mix levels verified by gap/VO extraction;
      mix extends past duration
- [ ] `mix.mjs` passed its contrast gate (narration ≥10dB above the bed, no
      clipped VO stem, mix extends past `CONTENT_DURATION`)
- [ ] SFX cue sheet written from real timeline numbers; `sfx.mjs build` ran with
      zero placement/off-target warnings; ≤ ~6 cues per 30s; fast/large motion on
      `whoosh_deep`; repeated events pull varied clips; at least one scene is
      deliberately silent (full list: `references/sfx-design.md` §9)
- [ ] Every scene reviewed via segment render before the full draft
- [ ] Audit passed with zero warnings; rendered with 20-min timeout; duration
      verified with ffprobe; MP4 watched end-to-end
