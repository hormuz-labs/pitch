---
name: html-motion-video
description: Build product launch videos as shots.js shot lists compiled by the shared GSAP engine, previewed live in the studio and rendered to MP4 by deterministic seek-and-capture, with a music bed, optional narration recorded as ONE continuous read that the picture is cut to, and measured SFX. Every video gets a bespoke art direction derived from the product's own brand — the agent measures the site, harvests its real logo and screens, and writes a creative brief before authoring a single shot. Use this skill whenever the user wants a product launch video, promo, teaser, feature announcement, kinetic typography, motion graphics, "Apple-style" video, or a narrated product video.
---

# HTML Motion Video — Bespoke Launch Videos from a Shot List

A video is a **`shots.js` shot list** compiled by the engine at `../../engine/`
into DOM plus one paused GSAP timeline. The studio previews it live, lets the
user point at any element, and exports MP4s. You are the creative director:
never ask "what effects do you want?" — do the recon, write the brief, present
the shot list, build.

**Prime directive: every video must look like the product's own design team
made it.** Two videos for two products must be unmistakable for each other.
This skill supplies process and engineering rules, not a house style. Any
aesthetic in an example (dark stage, glow orbs, glass, Inter) is sample data.

**References are pattern libraries, never templates.** Extract the principle,
derive a new execution from this product's recon evidence. `direction.md`
outranks every optional recipe and numeric range.

## Philosophy — never a lazy frame

The films we admire (see `references/pacing.md` for a measured teardown of
the Replit explainer) have **one hard cut in 37 seconds and something new on
screen every ~1.1s**: words arriving one by one, toasts piling up, a UI
tilting in, the previous element flying out as the next lands, a warm stage
drifting behind everything. Energy is *density and layering*, not speed.

Our failure mode is the opposite: six 5-second shots, one entrance each, then
a hold. That is a slideshow with a narrator. So every shot you write is
**entrance → second act → exit**, and the film keeps a persistent stage:

- `ambient` on (top level) unless direction.md argues for a bare stage.
- Shots average 1.5–2.8s; type beats ≤ 3.2s. Narration is **one continuous
  read at a human pace** and the picture is cut to its words (`cue`) — never
  one clip per shot (that is the robotic sound), never a rushed read (energy
  is on screen, not in words per second), never a shot stretched to fit a sentence.
- Every shot longer than ~1.6s carries a second act: `beats`, a second
  `line`, `more` notifications, a `pile` item, a `cursor`/`focus`, a
  `stat-counter` roll, a `swap`.
- Exits are motion (`motion.exit`), so a cut is an arrival, not a freeze.
- `motion_audit` is the judge: no quiet stretch > 1.5s with drift and
  ambient off, ≥ 0.7 events/s, 8–16 shots. It prints a per-shot table; a
  shot under 1 ev/s is lazy. Fix it, don't argue with it.

## Workflow at a glance

| Phase | Output | Gate |
|---|---|---|
| 0. Recon | `recon/brand-tokens.md`, `recon/assets.md`, `assets/harvested/` | Colors and fonts measured from the live site; real logo pulled |
| 1. Direction | `direction.md` — 8 axes, each citing evidence | Uniqueness Test passes |
| 2. Shot list | Shot table + audio plan | One idea per shot; each demo beat names one focal target |
| 3. Build | `index.html`, `shots.js` (+ `js/shots.custom.js` if needed), saved shot by shot | First shots in the studio within minutes; `motion_check` clean after every save |
| 4. Audio | `audio/mix.wav` (+ `audio/vo.wav` — ONE continuous read — and `audio/sfx_bus.wav`) | `mix.mjs` gate passes; mix ≥ 1s past the timeline |
| 5. Audit | `audit/` frames | Zero static-hold warnings |
| 6. Export | `renders/launch-<res>.mp4` | **Only when the user asks** — the studio has an Export button |

Present direction.md and the shot table, then keep going — do not block
waiting for approval unless the user is actively responding. The studio
reloads the preview when you finish a turn.

---

## Shot-edit workflow (studio scene and element prompts)

When the user targets a shot or clicks elements in the preview, you receive a
scoped prompt naming the shot id and, for elements, a legend of `[n]` targets
with tag, class, text and selector. Follow this instead of Phases 0–6:

1. **Edit only that shot's entry in `shots.js`.** Change its fields, `bg`,
   `cut`, or `type`. Do not touch other shots.
2. **Keep `dur`** unless the user asks for a longer/shorter shot — every later
   shot and the audio mix shift with it.
3. **Need a look the engine has no field for?** Add or extend a type in
   `js/shots.custom.js` (see §3.3). Never edit `../../engine/`.
4. **Verify.** `motion_audit`, or `motion_render` with `from`/`to` for one
   shot. Do not full-render. Say what changed.

Element targets map to shot fields: a `.word`/`.type-line`/`.type-center` is a
`lines`/`parts`/`text` field; `.punch-card` is a `color-punch`; `.mq-item` is a
marquee `items` entry; `.notif` is `device-notif.notif`; `.ui-frame` is a
`ui-frame` shot (its `src`, `focus`, `cursor`, `caption`); `.logo-lockup` is
`logo-sting`/`logo-cta`.

---

## Phase 0 — Product Recon

Evidence before taste. Everything lands in `recon/` and `assets/`.

### 0.1 Brand tokens (measure, don't guess)

Your shell has no browser, so the measuring is a host tool:

```js
motion_recon({ url: "<product-url>" })                                   // → recon/brand-tokens.md + .json, assets/fonts/
motion_recon({ url: "<product-url>/pricing", out: "recon/brand-tokens-pricing.md" })
motion_screenshot({ url: "<product-url>", out: "recon/screenshots/01-home.png" })
```

`motion_recon` reads the live DOM: `getComputedStyle(document.body)`
(background, ink, font stack), every `--*` custom property on `:root`, the
primary CTA (`background-color` **and** `background-image`, `color`,
`border-radius`, `box-shadow`, type), an accent-frequency census of saturated
colors, surfaces ranked by area, heading vs body `font-family` / weights /
letter-spacing, `<meta theme-color>`, and the page copy. Read the .md before
writing a word of direction.md. `motion_screenshot` the home page and 2–3
product pages so you can *see* the layout the numbers describe.

Every hex in `direction.md` is one of these values or a tint/shade of one.
Never write brand-tokens.md by hand from a screenshot: a measured light
`#E6E6E6` page has been "remembered" as dark obsidian before.

### 0.2 Harvest the product's own media

```js
motion_harvest({ url: "<product-url>" })
motion_harvest({ url: "<product-url>", cdp: "<CDP url>" })   // bot-walled sites
```

Writes `assets/harvested/` plus `recon/harvested.json` (source URL, pixel size,
the section heading each asset sat under). This is where the logo SVG, real
product screenshots and any product footage come from. Write
`recon/assets.md` listing what is available and what is official. **The audit
fails if a harvested logomark exists and the film never uses it.**

### 0.3 Fonts

`motion_recon` saves the brand's own web-font files into `assets/fonts/` and
prints the `brand.fonts` snippet to paste into `shots.js` (self-hosted, so
renders are deterministic). If it found none (a system font, or files it could
not fetch), pick the closest self-hostable equivalent (creative-direction.md
Axis 2) — never a CDN `<link>`.

### 0.4 Substance

From the "Copy" section of `recon/brand-tokens.md` and the screenshots: voice
and tone of the copy; audience; what the product *is* (dashboard, CLI, mobile
app, API); its 2–3 real value propositions in the product's own words; which
screens exist.

## Phase 1 — Creative Direction (the anti-sameness gate)

Read `references/creative-direction.md` and write `direction.md` deciding all
8 axes with one line of evidence each: palette & background, typography,
motion language, dimensionality, composition, shot formats per beat, narrative
arc, audio persona (narration is a **decision**, not a default). End with the
Uniqueness Test:

1. **Swap test** — replace the logo with a competitor's; if the video still
   fits, redo the direction.
2. **Evidence audit** — every axis cites recon.
3. **Anti-default check** — near-black + glow orbs + glass + Inter is banned
   without site evidence.
4. **Signature moment** — name the one shot only this product could own.

## Phase 2 — Shot list

Present a table before writing code:

| # | id | Beat | Type | dur | bg | Copy / asset | Second act | Focal target (ui-frame only) | Sound |
|---|---|---|---|---|---|---|---|---|---|

Rules:
- **One idea per shot, headlines only** (≤ 8 words on screen). 8–16 shots,
  typically 20–40s. Average shot 1.5–2.8s; type beats ≤ 3.2s; `ui-frame`
  ≤ 6s. If direction.md chose narration, **write the script first** — one
  flowing paragraph read at a **natural, unhurried pace (1.9–2.4 words/s,
  ~60–70 words for 30s)** — then give every shot the `cue` phrase it lands
  on. The words decide the durations (`motion_sync`), so a demo beat needs
  enough words to cover its animation (a 3s demo ≈ 6–7 words), or a written
  pause. **Never speed the voice up to hit density** — energy is what moves
  on screen; the voice sounds like a person. Never pad a shot to fit a sentence.
- **Every shot names its second act** in the table (a beat, a second line,
  `more`, a pile item, a cursor, a counter). "Entrance" alone is not a shot.
- Choose the type per beat from `../../engine/schema.md` and the mapping in
  creative-direction.md Axis 6. Alternate density: type beat → product beat →
  type beat.
- **Every `ui-frame` names one focal target** (the hotspot rect and why). "The
  dashboard" is context, not a target. No camera move on type/brand/stat/CTA
  shots — the type carries them.
- The first 3 seconds are a designed hook (`color-punch`, `word-cut` cadence,
  `type-field` slam), not a logo fading in.
- Mark 2–3 boundaries as `punch` where a beat lands; everything else is a
  hard cut. There are no crossfades.
- Audio plan per shot: cue phrase (if narrated), signature SFX event or
  "silent", and where the bed's strong beats fall (`assets/music/musicTimestamp.json`).

## Phase 3 — Build

### 3.0 Build shot by shot — the user is watching

The studio reloads the live preview **every time `shots.js` is saved**, not
only when you finish. So the film is built in passes, never in one big write:

1. As soon as the shot table exists: write `index.html` and a `shots.js` with
   `brand`, `ambient`, `motion` and the **first 2–3 shots** (the hook). Save.
   The user sees the opening within minutes of asking.
2. `motion_check` — page errors, shot count, real duration, overruns.
3. Add the next 2–4 shots, save, `motion_check`. Repeat until the list is
   complete, then Phase 4.

Every save must be a complete, evaluating literal — a half-written array
shows the user an error instead of a film. If narration is planned, the
`cue` phrases go in as you write each shot; `motion_sync` retimes them later.

### 3.1 index.html (thin shell, unchanged between projects)

```html
<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><title>Launch</title>
<link rel="stylesheet" href="../../engine/css/shots.css"></head>
<body>
  <div id="viewport"><div id="camera"></div></div>
  <script src="vendor/gsap/gsap.min.js"></script>
  <script src="vendor/gsap/CustomEase.min.js"></script>
  <script src="vendor/gsap/CustomWiggle.min.js"></script>
  <script src="vendor/gsap/CustomBounce.min.js"></script>
  <script src="vendor/gsap/SplitText.min.js"></script>
  <script src="vendor/gsap/TextPlugin.min.js"></script>
  <script src="vendor/gsap/ScrambleTextPlugin.min.js"></script>
  <script src="vendor/gsap/Physics2DPlugin.min.js"></script>
  <script src="vendor/gsap/MotionPathPlugin.min.js"></script>
  <script src="vendor/gsap/EasePack.min.js"></script>
  <script src="shots.js"></script>
  <script src="../../engine/js/icons.js"></script>
  <script src="../../engine/js/factories.js"></script>
  <!-- <script src="js/shots.custom.js"></script>  only if you added types -->
  <script src="../../engine/js/compiler.js"></script>
</body></html>
```

`vendor/gsap/` is already in the workspace (all plugins). The compiler
registers every plugin it finds and names the shared eases (`whip`,
`slamHard`, `settle`, `shake`). No other stylesheets or scripts.

### 3.2 shots.js

The spec is in `../../engine/schema.md`. Author `brand` from
`recon/brand-tokens.md` (`bg`, `ink`, `accent`, `font`, optional `palette`,
`fonts`), then the shot array in order. `shots.js` is the single source of
truth for ids and durations — the studio, the mixer and the renderer read it.

Field discipline:
- Top level: `ambient: { kind: "blobs", color: "accent" }` (or `grid`), and
  `motion: { exit: "up" }` (`scale`/`scatter`/`down` per shot via `exit`).
- Density per shot (schema.md "Density layer"): `beats`, `reveal: "words"`
  with one `accent: true` keyword per line, `word-build` lines, `pile`
  items, `device-notif.more`. Every shot > 1.6s has one.
- `bg` may be any measured color; the engine picks a contrasting ink.
- Logos: `logo-sting.src` / `logo-cta.src` point at the harvested file.
  **A logotype is a drawing, not a word** — never retype a wordmark in a
  substitute font when the real file exists.
- Product screens: `ui-frame.src` points at a harvested screenshot; `html` is
  for a native rebuild when internal parts must animate. Never leave a
  screenshot unchanged for a whole shot — give it a `focus`, a `cursor`, or a
  `cursor.then` state swap.
- Numbers in `stat-counter` come from recon, never invented.
- Marquee items use `src` for real integration logos; built-in `icon` kinds
  are only the messaging channels the engine ships.

### 3.3 Custom shot types (when the engine lacks a look)

Add `js/shots.custom.js` defining `window.ProjectShotFactories` (schema.md
"Custom shot types"). `window.ShotKit` gives you `h`, `qs`, `splitChars`,
`mixedLine`, `rng`, `EASE`. The archived references in
`references/archive/` are a pattern library for this: text treatments,
counters, card deals, match cuts — re-implemented as a `mount`/`animate` pair.

Invariants for any factory:
1. Everything on the returned timeline — no CSS animations/transitions, no
   bare `gsap.to`, no `gsap.ticker`, no `Math.random()` (use `rng(seed)`).
2. Selectors scoped to the shot's `el`.
3. **Anti-flicker:** no infinite `yoyo` on opacity, brightness, glow or
   `box-shadow`. Light sweeps are one-shot accents, max 2–3 per film.
4. No `filter: blur()` on background-clipped text; `display: inline-block` on
   any `-webkit-background-clip: text` element.
5. Null tween targets crash the build — guard optional elements.
6. Text swaps stay on the timeline (`tl.set(...)`), never in callbacks.
7. **Time everything as fractions of `D`** (`D * 0.4`), never absolute
   seconds. A shot lasts exactly its `dur` — the compiler pins the next cut
   there and compresses a longer factory timeline to fit (the audit reports
   it; > 1.6× fails). With narration, `dur` comes from the words, so a
   factory hard-coded to 3s will be rushed in a 1.7s cue interval.

### 3.4 Check it

`motion_check` after every save (compiles? how long? any overrun?). The
studio preview is already showing the cut; `index.html?play` outside the
studio. Watch every shot. Then `motion_audit` — the philosophy gate. It loads `index.html?audit` (drift and ambient off), samples every
0.25s and prints a per-shot table of events/s plus a scorecard: shot count
and lengths, longest quiet stretch (limit 1.5s), events/s (floor 0.7), scene
overlap, seek determinism, harvested logo. Read the table: the shot with the
lowest ev/s is the one to fix. Fix, don't argue with it: add a beat, a second
line, `more`, a pile item, a `cursor`/`focus` — or cut the shot. Never
lengthen.

## Phase 4 — Audio

Full detail in `references/audio-pipeline.md` (bed, narration, mix) and
`references/sfx-design.md` (sound effects — read it before writing a cue sheet).

1. **Music bed.** If the user picked one in the studio it is already in
   `audio/`. Otherwise choose from the curated library (`motion_find_audio`,
   or `../../assets/music/`; beat map in `musicTimestamp.json`) and copy it to
   `audio/music.mp3`. Name the chosen file in your summary. Nudge shot `dur`s
   so cuts land on beats.
2. **Narration (only if direction.md chose it) — one read, cut to words.**
   Write the whole script to `audio/vo.txt` (one paragraph, one delivery
   direction). `motion_tts({ script: "audio/vo.txt" })` → `audio/vo.wav`
   (one call, never one per line). In `shots.js` set
   `audio: { vo: "audio/vo.wav", voStart: 0.3 }` and delete any per-shot
   `vo`/`voDur`. `motion_align` → `audio/vo-words.json`. Put `cue` on
   every shot (and on beats / `word-build` lines / `more` items that should
   land on a word). `motion_sync` shows the plan; `motion_sync({ write: true })`
   retimes `shots.js` (backup `shots.js.bak`) and the SFX sheet. Re-run
   align + sync after any change to the script or the cues. If a beat is
   squeezed, give it more words — don't fight the sync.
3. **SFX.** Cue sheet from real shot start times (`motion_cues`, or the
   summed `dur`s — cuts are hard, so they agree) → `motion_sfx({ mode: "build",
   duration })`. Budget ~6 signature cues per 30s, one silent shot.
4. **Mix.** `motion_mix({ duration: <__DURATION()>, music: "audio/music.mp3", sfx: "audio/sfx_bus.wav" })`
   (add `music_only: true` when there is no narration). It builds step by step
   and verifies by extraction; a failing gate means re-mix, not render.

## Phase 5 — Audit gate

```js
motion_audit({})
```

Zero ❌ on the scorecard is the bar: shots 8–16, average ≤ 3.4s, longest
quiet ≤ 1.5s, ≥ 0.7 ev/s, deterministic, no overlap, real logo used. Quote
the scorecard line in your summary. Then stop; the studio preview reloads
with your changes.

## Phase 6 — Export (on request only)

The studio's Export button renders 720p / 1080p / 4K with the mix muxed. Only
when the user asks you for an MP4 in chat: `motion_audit` first, then
`motion_render` with `out: renders/launch-<res>.mp4`, `out_res`, `fps: 60`,
then `motion_verify_duration`. Never concatenate segment renders; never
screencast; never Remotion/React.

---

## Checklist A — Uniqueness (before building)

- [ ] `direction.md` decides all 8 axes, each citing `recon/brand-tokens.md`
- [ ] Every color is measured or a tint/shade of a measured value
- [ ] Swap test passed; signature shot named and product-specific
- [ ] Typography matches the brand's font personality; font self-hosted via `brand.fonts`
- [ ] One motion language governs `cut` choices, drift and any custom factory
- [ ] Shot formats chosen per beat — not the same sequence as the last film
- [ ] Audio persona (bed genre, narration yes/no and register, SFX density) matches brand tone

## Checklist B — Technical (before final audit)

- [ ] `recon/brand-tokens.md` was written by `motion_recon` (measured), not by hand
- [ ] `harvest.mjs` ran; the real logo is used via `src`; no retyped wordmark
- [ ] Every `ui-frame` has a focal target or a state change; no unchanged screenshot
- [ ] Stats are recon numbers
- [ ] 8–16 shots, one idea each, ≤ 8 words on screen; hook in the first 3s
- [ ] `ambient` on (or direction.md says why not); every shot > 1.6s has a second act; exits are motion
- [ ] Narration is ONE read (`audio.vo`), `motion_align` ran, every shot has a `cue`, `motion_sync` applied — audit shows max drift within −0.35…+0.15s, no fragmented clips
- [ ] Built shot by shot: first shots saved before the rest were written; `motion_check` clean after each save
- [ ] Custom factories obey the seven invariants in §3.3
- [ ] Bed named; `mix.mjs` gate passed; mix extends ≥ 1s past `__DURATION()`
- [ ] SFX cue sheet from real times; `sfx.mjs build` ran with zero placement warnings
- [ ] `motion_audit` scorecard: zero ❌, longest quiet ≤ 1.5s, no shot under 1 ev/s
- [ ] No MP4 rendered unless the user asked
