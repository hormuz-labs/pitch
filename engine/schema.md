# Shot compiler — schema

`shots.js` assigns one data literal to `window.SHOTS`. The engine
(`../../engine/js/compiler.js`) turns it into DOM plus a paused GSAP master
timeline and exposes `__SEEK(t)`, `__DURATION()`, `__CUES()`, `__READY`, so the
studio can scrub it and `capture.mjs` can render it frame by frame.

`shots.js` is the **single source of truth**: the studio's scene strip, the
audio mixer and the renderer all read shot ids, `dur`, `vo` and `voDur` from
it. There is no separate timing file.

```js
window.SHOTS = {
  brand: {
    bg: "#FAF9F6",            // stage/paper color (measured from the product's site)
    ink: "#141413",           // text color
    accent: "#D97757",        // one accent
    font: '"Fraunces", Georgia, serif',   // CSS font stack for all type
    mono: '"JetBrains Mono", ui-monospace, monospace',   // optional, used by ui-frame's URL bar
    palette: { sage: "#9CB59B", night: "#1E2A24" },      // optional named colors → shot.bg = "sage"
    fonts: [                                             // optional self-hosted @font-face (deterministic renders)
      { family: "Fraunces", src: "assets/fonts/Fraunces.woff2", weight: "100 900" },
    ],
  },
  audio: { vo: "audio/vo.wav", voStart: 0.3 },  // ONE continuous read (omit for music-only)
    ambient: { kind: "hairlines", color: "ink" }, // the living stage — kind per direction.md Axis 1 (see "Density layer")
    motion: { exit: "scale", cutDur: 0.5 },  // default exit motion for every shot: up | down | scale | scatter | none; length of transitional cuts
  render: { shutter: 0.5, samples: 4, depth: 10 },   // optional: motion blur and bit depth of the MP4 (see "Render and grade")
  grade: { temperature: 5600, vignette: 0.3 },       // optional: the finish applied to every frame (see "Render and grade")
  shots: [ { id, type, dur, bg, ink?, cut?, exit?, beats?, cue?, ...typeFields } ],
};
```

## Density layer (what keeps a film alive)

The studio's philosophy: **something new happens on screen at least every
~1.2s.** An entrance-then-hold shot is a slide, not a shot. The engine gives
every shot three layers of life on top of the factory's own animation, and
`motion_audit` measures the result (no quiet stretch > 1.5s).

| Field | Where | Meaning |
|---|---|---|
| `ambient` | top level | `{ kind, color?: "accent"\|"ink"\|css, count?, seed?, blur?, opacity?, size? }` — a living stage *between* every shot's background and its content, continuous across cuts (positions are a function of film time), position-only. `kind` is the direction.md Axis-1 choice: `blobs` (soft blurred discs — deep space + glow), `light` (one large soft light source orbiting — studio backdrop), `blueprint` (a fine line grid panning — technical grid; `size` = cell), `hairlines` (a few 1px rules drifting — editorial light, terminal noir), `halftone` (a dot screen panning — duotone poster; `size` = cell), `shapes` (flat discs, bars and slabs drifting and turning — solid brand field), `grid` (blurred rounded tiles), `none`. `shot.ambient = false` hides it on one shot. |
| `motion.exit` / `shot.exit` | top / shot | `up` (default) \| `down` \| `scale` \| `scatter` \| `none` — the outgoing content leaves the frame in its last ~0.3s, so a cut is an arrival, not a freeze. `scatter` throws words/cards in random directions. |
| `beats` | shot | `[{ at, kind, sel?, text?, amount?, color?, y? }]` — mid-shot events for *any* type. `swap` (replace the text of `sel`, default the headline), `pulse` (scale pop on `sel`), `shake` (camera shake, needs CustomWiggle), `kick` (whole-shot scale hit on a beat), `flash` (one-frame color flash), `hide` / `show` (`sel`), `nudge` (move `sel` by `amount`/`y`). `at` defaults to evenly spaced. |
| `reveal: "words"` | word-cut, color-punch | Words arrive one after another (0.13s apart, `each` overrides); parts with `accent: true` pop harder and take the accent color. |
| `parts[].accent` | any `parts` | The keyword. Colored `--accent` (ink on accent backgrounds). One per line. |

Rule of thumb per shot: **entrance (0–0.6s) → second act (a beat, a line
swap, a second notification, a cursor) → exit (last 0.3s).** Shots shorter
than 1.6s need no second act.

## Narration spine (when direction.md chose a voice)

The voice is **one continuous read** of the whole script, placed once at
`audio.voStart`. The picture is cut *to* it: every shot names the phrase it
lands on (`cue`), `align.mjs` times every word of the read, and `sync.mjs`
sets the durations so each cued shot starts a hair before its word. Beats,
`word-build` lines and `more` notifications can be cued the same way, so
"INSTANT MAGIC." flashes as the narrator says *magic*. Never record a line
per shot — separate clips restart the voice's intonation every few seconds
and leave dead air between them.

## Common shot fields

| Field | Meaning |
|---|---|
| `id` | Stable label (`shot1`, `hook`, …). The studio's scene strip and the element inspector use it. |
| `type` | One of the types below, or a project-local type from `js/shots.custom.js`. |
| `dur` | Seconds. Typically 0.9–3.2 for type beats, 3–6 for a `ui-frame` demo. When narrated, `motion_sync` sets it from the cue words — you author the `cue`, not the number. A shot lasts exactly `dur`; a factory timeline that runs longer is compressed to fit (reported by the audit). |
| `bg` | `accent` \| `ink` \| `bg` \| a `brand.palette` name \| any CSS color. Text color is picked for contrast. |
| `ink` | Optional explicit text color for this shot. |
| `cut` | `hard` (default, one-frame cut), `punch` (incoming shot lands from 1.12× in 0.38s), or a **transition** that composites both shots for `cutDur` seconds (default 0.5, capped at 45% of the shot): `dissolve`, `wipe-left` \| `wipe-right` \| `wipe-up` \| `wipe-down` (the edge travels that way), `push-left` \| `push-right` \| `push-up` \| `push-down` (both shots slide), `iris` (a circle opens), `zoom` (the outgoing shot flies past the camera, the incoming arrives from behind it), `flip` (a card turn). The outgoing shot's exit motion is suppressed under a transition. Hard cuts stay the default — a transition is a motion-language decision (creative-direction.md Axis 3), one or two kinds per film, each where it says something. |
| `cutDur` | Length of this shot's transition in seconds (else `motion.cutDur`, else 0.5). |
| `carry` | Match cut: `{ from: ".logo-img", to: ".logo-img", dur?: 0.55, ease? }` on the incoming shot. A ghost of the outgoing shot's `from` element travels from where it sits at the cut to where `to` sits in this shot `dur` later, and `to` stays hidden until it lands — the same asset in both shots (the mark from `logo-sting` into `logo-cta`, a card into a `ui-frame`). Pairs with a hard cut; measured after fonts and assets load, so the geometry is what the frames show. |
| `exit` | Overrides `motion.exit` for this shot (`up` \| `down` \| `scale` \| `scatter` \| `none`). |
| `beats` | Mid-shot events — see "Density layer". |
| `ambient` | `false` hides the ambient stage on this shot. |
| `cue` | The script phrase this shot lands on (`"step two"`). `motion_sync` starts the shot ~0.12s before that word. Beats, `word-build` lines and `device-notif` `more` items take `cue` too (→ `at`, `lineAt`, `moreAt`). |
| `vo`, `voDur` | **Legacy per-shot clip — do not use.** More than one fails `motion_audit` (fragmented narration). |
| `drift` | `false` disables the slow rest travel (scale 1.045, x +10, y −8 over the shot). `driftScale` / `driftX` / `driftY` override it. |

## Types

| type | Fields |
|---|---|
| `word-build` | `lines: [{parts: [{text, weight, accent?}]}]` — a sentence assembles word by word in the centre; each further line replaces the last (previous words scatter). `each` (gap between words, 0.13), `align: "left"`, `seed`. The reference-film cadence ("Coding stops you from **launching**?" → "From now it **WON'T**."). |
| `pile` | Chaos beat: `items: [{kind: "window"\|"toast"\|"pill", title?, body?, x, y, rot?, w?, tone?: "error"\|"warn"\|"ok"\|"plain"}]` land one after another (`every`, default fits 55% of the shot), `anchor: parts` headline appears over them, then everything blows away at `blowAt` (default D−0.55; `blow: false` keeps it). 5–8 items. |
| `type-field` | `lines: [{text, weight: thin\|heavy}]` stacked top-left; optional `chrome: [{kind: sms\|bot-pill\|progress, x, y, …}]` floating cards |
| `overlay-type` | `lines: [{parts: [{text, weight}]}]` shown one after another over a ghost phone; `seed` |
| `word-cut` | `parts: [{text, weight, accent?}]` or `text` — one centered line, scale-in; `reveal: "words"` for word-by-word |
| `type-wipe` | `parts` — one centered line sliding in from the right with a char wipe |
| `color-punch` | `text` or `parts` — a full-bleed accent card that punches in and keeps growing; `reveal: "words"` |
| `logo-sting` | `src` (harvested logo/wordmark image), `markSvg` (inline SVG string), `word`, `accentFirst`, `tag`, `mode: mark\|wordmark`, `size: hero`, `vignette` |
| `logo-cta` | same lockup fields as `logo-sting` plus `pill` (typewriter CTA line) |
| `icon-marquee` | `anchor: parts` centered headline; `rows: [{y, items}]` — item is `{src, label, tile?, bg?, round?}` (a harvested logo), `{icon, label}` (built-in channel icon), `{kind:"avatar", src, label}`, `{kind:"pill", label}`, or `{label}` |
| `device-notif` | `notif: {app, src?, iconBg?, kicker, body, tint, ink, meta, call?, sub?}` — `app` is sms/whatsapp/telegram/viber/email/voice/flash, or give `src` for the product's own icon. `more: [notif, …]` drops further notifications in mid-shot, pushing earlier ones down (`moreAt: [s, …]` to place them; `tilt: false` to stop the phone rocking) |
| `stat-counter` | `value`, `prefix?`, `suffix?`, `decimals?`, `from?`, `label` (parts or string). Numbers come from recon. |
| `lottie` | a Lottie file driven frame by frame from the timeline — `src` (a harvested `.json`, `recon/harvested.json` kind `lottie`, or one the user supplied), `height` (720), `width` (= height), `x`/`y` (centred), `fit: contain\|cover`, `from`/`to` (frames; default the whole file at its own rate, looping if the shot is longer), `speed`, `loop: false`, `enter: rise\|scale\|none`, `caption` (parts) + `captionPos`. Mascots, product animations, icon sets — the product's own motion. |
| `rive` | a Rive `.riv` scrubbed from the timeline — `src`, `artboard?`, `animation?` (name; default the file's default animation), `from` (s), `speed`, plus the `lottie` geometry, `enter` and `caption` fields. Needs `motion_scaffold({ rive: true })`. |
| `device-3d` | the product's screen on a real object: `device: slab\|card\|phone\|laptop` (decide it), `src` (a harvested screenshot or a mined frame for the screen, cover-fit; `align: top\|center`), `turn: { from: [x°, y°], to: [x°, y°], ease? }` (decide it — without one the console warns and a house move plays), `color` (body; default the ink), `light`, `shadow` (0–1), `fov`, `enter: "none"` to skip the arrival from depth, `hover: false`, `caption` + `captionPos`. Real geometry — thickness, bevels, a laptop base — under a key light, a rim in the accent and a cast shadow; use a dark `bg` or the shadow vanishes. No custom factory; `ShotKit.three` is for what this does not do. |
| `ui-frame` | the product itself — see below |

### `ui-frame` — the product demo shot

A harvested screenshot (or native `html`) inside a frame, with a semantic
camera move to one hotspot and an optional cursor click. All coordinates are
fractions (0–1) of the visible screen area, so nothing needs DOM measurement
and the render stays deterministic.

```js
{
  id: "demo", type: "ui-frame", dur: 5, bg: "bg",
  src: "assets/harvested/dashboard.png",   // or html: "<div class=…>…</div>" for a native rebuild
  frame: "browser",                        // browser (1560×900) | phone (430×880) | none (1600×900)
  url: "app.acme.com/deals",               // browser address bar text
  width, height, offsetX, offsetY,         // optional frame geometry overrides (px)
  align: "top center",                     // object-position of the screenshot
  enter: "rise",                           // rise | scale | none
  caption: [{ text: "See every ", weight: "thin" }, { text: "deal.", weight: "heavy" }],
  captionPos: "top",                       // top | bottom
  focus: {                                 // ONE hotspot per shot (attention camera)
    x: 0.62, y: 0.28, w: 0.22, h: 0.12,    // hotspot rect; scale is derived from w unless given
    scale: 2.2, at: 0.9, duration: 0.72, ease: "power4.inOut",
    hold: 1.2, release: true, releaseScale: 1.06, landX: 960, landY: 540,
  },
  cursor: { x: 0.73, y: 0.34, at: 1.9, then: "assets/harvested/deal-open.png", leave: true },
  layers: {                                // parallax: pieces cut from the SAME screenshot by motion_screenshot({ layers })
    w: 1920, h: 1080,                      //   the screenshot's CSS size (the tool prints this whole block)
    items: [                               //   rect in screenshot px; depth 1 = page chrome, 2 = an overlay nearest the viewer
      { src: "assets/harvested/app.layer-1.png", x: 0, y: 0, w: 1920, h: 72, depth: 1 },
      { src: "assets/harvested/app.layer-3.png", x: 760, y: 300, w: 560, h: 380, depth: 2 },
    ],
  },
  tilt: { y: 6, x: 2, at: 0, dur: 4, ease: "sine.inOut" },   // the frame turns from −y..+y / +x..−x degrees while layers shift by depth
}
```

`layers` and `tilt` are how a flat screenshot gains depth: the base plate is
the screen with the layers lifted off it, each layer sits exactly over its
own pixels, and the focus camera moves a layer away from the hotspot (and
grows it) by its depth, the `rise` entrance staggers layers by depth, and
`tilt` slides them as the frame turns. Cut layers where the product really
has planes — a modal over a page, a sticky header over a scroll, a sidebar —
not to decorate a screen that is one surface.

Camera rules the type enforces: scale and pan move together in one eased
tween; the camera settles before the cursor acts; at most one focus per shot
(use two `ui-frame` shots for two targets, or a `cursor.then` swap for the
consequence). Skip `focus` when the whole screen is the point.

## Render and grade

Two optional top-level blocks decide what the encoder adds to the frames.
The studio's Export button and `motion_render` read both; flags on the tool
override for one render. Both are direction.md decisions — a shutter belongs
to a Fluid or Kinetic motion language, a grade to the palette's finish —
never a default.

| Block | Fields |
|---|---|
| `render` | `shutter` 0–1: fraction of each frame interval the shutter is open (0.5 = a 180° film shutter, 1 = frame blending; 0 = off, crisp). `samples` 2–16: captures averaged per frame (4 is enough at 60fps; the render takes `samples`× longer). `depth: 10` for 10-bit output so soft glows and gradients stop banding (H.264 High 10, or HEVC Main 10 with `codec: "hevc"` for Apple devices; 8-bit H.264 plays everywhere). `crf`. |
| `grade` | Applied in RGB before the video conversion, then in YUV: `temperature` (K, 6500 neutral; 5000 warm, 8000 cool), `curves` (a preset — `vintage`, `cross_process`, `darker`, `lighter`, `increase_contrast`, `linear_contrast`, `medium_contrast`, `strong_contrast`, `negative`, `color_negative` — or `{ master, r, g, b }` point strings like `"0/0 0.5/0.58 1/1"`), `lut` (a `.cube`/`.3dl` file in the project, e.g. one the user supplied), `vibrance` −2–2, `contrast` 0–3, `brightness` −1–1, `gamma`, `saturation` 0–3, `vignette` 0–1, `grain` 0–100 (temporal film grain, added after the shutter so it is not averaged away). `motion_review` sheets show the graded frames. |

Every render is converted to BT.709 limited range explicitly and tagged so,
whatever these blocks say — players stop shifting the brand colours.

## Custom shot types

When no built-in type shows a beat well, add one **in the project**, never in
the engine.

**The whole GSAP set is registered and yours to use** — `motion_scaffold`
loads all of it from `../../assets/gsap/` and the compiler registers whatever
it finds, so a custom factory can call any of these without touching
index.html:

| plugin | what it buys a shot |
|---|---|
| `Flip` | an element moving between two layouts as one continuous motion — a card leaving a grid to become the hero |
| `MorphSVGPlugin` | one shape becoming another: a logo mark morphing into an icon, a chart turning into a check |
| `DrawSVGPlugin` | a stroke drawing itself — underlines, connectors, a signature, a route on a map |
| `MotionPathPlugin` | anything travelling a curve rather than a straight line |
| `Physics2DPlugin` / `PhysicsPropsPlugin` | gravity, throw, bounce — debris, confetti, cards falling out of frame |
| `Draggable` + `InertiaPlugin` | a thrown/flicked element that carries momentum and settles |
| `ScrollTrigger` / `ScrollSmoother` / `ScrollToPlugin` | a scrolled UI shot: drive a fake page scroll off the timeline |
| `Observer` | unified pointer/wheel/touch input for an interactive-looking beat |
| `CSSRulePlugin` | animating `::before` / `::after` — sweeps and masks with no extra DOM |
| `EaselPlugin` / `PixiPlugin` | a canvas stage, when DOM cannot do the effect |
| `SplitText`, `ScrambleTextPlugin`, `TextPlugin` | the type treatments the built-in types already use |
| `CustomEase`, `CustomWiggle`, `CustomBounce`, `RoughEase`, `SlowMo`, `ExpoScaleEase` | the easing vocabulary; the shared named eases are `whip`, `slamHard`, `settle`, `shake` |

`window.__PLUGINS` lists what registered on the page. Everything still has to
run on the returned timeline — see Rules; a plugin does not excuse a bare
`gsap.to`.

Declare it in the project:

```html
<script src="js/shots.custom.js"></script>   <!-- after factories.js, before compiler.js -->
```

```js
// js/shots.custom.js
(function () {
  const { h, qs, splitChars, mixedLine, rng, EASE } = window.ShotKit;
  window.ProjectShotFactories = {
    "split-compare": {
      mount(el, shot, spec) { el.dataset.bg = shot.bg || "bg"; el.appendChild(h(`…`)); },
      animate(el, shot, D, spec) { const tl = gsap.timeline(); /* tweens on the timeline only */ return tl; },
    },
  };
})();
```

`window.ShotKit` also exposes `revealWords(tl, root, at, {each})` and
`scatterWords(tl, root, at, seed)` for the word-by-word cadence, the canvas
and asset helpers below, and the
compiler registers every GSAP plugin the thin shell loads: CustomEase (named
eases `whip`, `slamHard`, `settle`), CustomWiggle (`shake`, `shakeSoft`),
CustomBounce, ScrambleTextPlugin, Physics2DPlugin, MotionPathPlugin,
EasePack (`rough`, `slow`, `expoScale`), SplitText, TextPlugin —
`window.__PLUGINS` lists what loaded. Use them: a scramble decode, a physics
scatter, a motion-path fly-in are one line each.

### Real 3D, Lottie and Rive in a custom type

The built-in `device-3d` type covers the common case (the product's screen on
a slab, card, phone or laptop, turning). The helpers below are for what it
does not do — a stack of the product's cards in depth, an extruded mark, a
scene of several objects.

| helper | what it gives a factory |
|---|---|
| `ShotKit.three(el, { fov?, shadows?, alpha?, width?, height?, x?, y? })` | a three.js stage the size of the shot: `{ THREE, scene, camera, renderer, canvas, texture(src) }`. World units are CSS pixels on the z = 0 plane (a 1200-unit box is 1200px wide), the camera looks down −z. Build meshes, lights and shadows in `mount`; tween `mesh.rotation` / `mesh.position` / material values on the returned timeline in `animate`. The stage redraws itself after every timeline render (both seek directions) — never call `render()` yourself, never use `requestAnimationFrame`. `texture(src)` loads a harvested screenshot or photo and holds the page's readiness until it is in. Lit, shadowed, textured geometry — a device turning to show its thickness, a stack of cards in real depth, an extruded mark — where CSS 3D cannot go. |
| `ShotKit.lottie(el, { src, x, y, width, height, fit })` | `{ anim, holder, drive }`; `drive(tl, { at, dur, from, to, speed, loop })` sets the frame as a function of the shot's time. |
| `ShotKit.rive(el, { src, x, y, width, height, fit, artboard, animation })` | `{ rive, canvas, drive }`; `drive(tl, { at, dur, from, speed, animation })` scrubs the animation's time. |
| `ShotKit.ready(promise)` | any other async asset a factory loads: the render waits for it (15s bound) so the first frame is complete. |
| `ShotKit.frameHook(el, render)` | a redraw callback for your own canvas (2D or WebGL) run after every timeline render while the shot is on. |
| `ShotKit.coverMap(natW, natH, boxW, boxH, align)` | where an `object-fit: cover` image lands — for positioning over a screenshot. |

`mount` builds DOM once; `animate` returns a timeline of length ≤ `D`. Rules:
everything on the returned timeline (no CSS animations, no bare `gsap.to`, no
`Math.random` — use `rng(seed)`), selectors scoped to `el`, no infinite
opacity/brightness loops, and every image from `assets/`.

## Rules

- **Density.** 8–16 shots, average 1.5–2.8s, type beats ≤ 3.2s, `ui-frame`
  ≤ 6s, narrated shots start on their `cue` word (sync.mjs). No stretch longer than 1.5s without
  a designed event. `motion_audit` enforces all of this.
- One idea per shot. Headlines only (≤ 8 words on screen).
- Hard cuts by default; `punch` for a beat that lands; a transition kind or a
  `carry` only where direction.md gave it a job — never a dissolve between
  two type beats.
- Brand from recon: `brand.bg/ink/accent/font` are measured values, `fonts` self-hosted.
- Logos are the product's own files (`logo-sting.src`, marquee `src`), never retyped or redrawn.
