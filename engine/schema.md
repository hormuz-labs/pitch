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
  design: "chain",            // the film's grammar: "chain" | "chapters" (see "Design")
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
  ambient: { kind: "none" },                     // the stage — kind per direction.md Axis 1 (see "Density layer")
  motion: { exit: "blur", cutDur: 0.5 },         // default exit motion: up | down | scale | scatter | blur | left | right | none; length of transitional cuts
  actors: { folder: { src: "assets/harvested/folder.png", w: 320 } },   // objects that live across shots (see "Actors")
  render: { shutter: 0.5, samples: 4, depth: 10 },   // optional: motion blur and bit depth of the MP4 (see "Render and grade")
  grade: { temperature: 5600, vignette: 0.3 },       // optional: the finish applied to every frame (see "Render and grade")
  shots: [ { id, type, dur, bg, ink?, cut?, exit?, beats?, actors?, chapter?, cue?, ...typeFields } ],
};
```

## Design

Two grammars were measured frame by frame from reference films
(`references/designs/` in the skill). `design` names the one direction.md
chose; `motion_audit` judges the film by that grammar's rules.

| `design` | The film is | Its unit | Cuts | Type | Runs |
|---|---|---|---|---|---|
| `chain` | one continuous take: one object born from the words, dropped into the product, becoming the next object, until the mark | an **actor** crossing shots | none that show: an actor, a `carry`, a `flood`, or `exit: "blur"` into an arrival on every boundary | a `line` of 2–4 words, the noun in `accent`, the object in a `slot` | 25–40s, 8–16 shots |
| `chapters` | prompt → product → payoff, repeated: a sentence landed at hero scale and travelled word by word (`zoom` beats on `.lw`), the product rebuilt as `ui-frame` `html` and tilted with a cursor acting, a payoff that floods or morphs | a **chapter** (`shot.chapter`) | allowed on a `flood` or on the beat; `zoom` / `zoom-out` between hero and UI scale | a `line` landed as a move; rotators; the noun in `accent`; `typing` only in a prompt box inside the rebuilt UI | 45–90s, 12–40 shots |

A film may be a chain inside its chapters. What both share: an object
persists across scale changes, blur is the grammar for depth and exit, one
or two things on screen, the real product every moment, expo-out arrivals
and nothing that bounces, and a `breath` before every payoff.

## Density layer (what keeps a film alive)

The studio's philosophy: **something new happens on screen at least every
~1.2s.** An entrance-then-hold shot is a slide, not a shot. The engine gives
every shot three layers of life on top of the factory's own animation, and
`motion_audit` measures the result (no quiet stretch > 1.5s).

| Field | Where | Meaning |
|---|---|---|
| `ambient` | top level | `{ kind, color?: "accent"\|"ink"\|css, colors?, count?, seed?, blur?, opacity?, size? }` — a living stage *between* every shot's background and its content, continuous across cuts (positions are a function of film time), position-only. `kind` is the direction.md Axis-1 choice: `blobs` (soft blurred discs — deep space + glow), `light` (one large soft light source orbiting — studio backdrop), `blueprint` (a fine line grid panning — technical grid; `size` = cell), `hairlines` (a few 1px rules drifting — editorial light, terminal noir), `halftone` (a dot screen panning — duotone poster; `size` = cell), `shapes` (flat discs, bars and slabs drifting and turning — solid brand field), `grid` (blurred rounded tiles), `aurora` (three or four very soft discs in the brand's own hues — `colors: [...]`, else the accent and two tints of it — the stage under hero type; `opacity` 0.22), `none` (the bare stage of the continuous chain: whitespace does the work). `shot.ambient = false` hides it on one shot — the product shots of a chapters film sit on the bare stage while the type beats get the aurora. |
| `motion.exit` / `shot.exit` | top / shot | `up` (default) \| `down` \| `scale` \| `scatter` \| `blur` \| `left` \| `right` \| `none` — the outgoing content leaves the frame in its last ~0.3s, so a cut is an arrival, not a freeze. `blur` rises 70px and blurs to nothing over 9 frames: the continuous take's one exit, the next thing already there on the following frame. `left` / `right` accelerate the whole line off that side (ease-in). `scatter` throws words/cards in random directions. |
| `beats` | shot | `[{ at, kind, sel?, … }]` — mid-shot events for *any* type. `swap` (replace the text of `sel`, default the headline), `pulse` (scale pop on `sel`), `shake` (camera shake), `kick` (whole-shot scale hit), `flash` (one-frame color flash), `hide` / `show` (`sel`), `nudge` (move `sel` by `amount`/`y`), **`halo`** (a blurred disc of `color` blooms behind `sel`, `size` 900, `hold`, `fade: false` keeps it — the pre-flood glow, the press glow), `ripple` (**do not use** — rings from a press are the tell of a template and `motion_audit` fails it; a press is the control's own state change or a `flood`), **`blurout`** (`sel` blurs and fades in place over 0.3s), **`flood`** (the frame floods with `color` from `sel` — halo for `pre` 0.2s, solid for `hold` 0.08s, retreats to that point over `dur` 0.9s; `stay: true` leaves the frame that colour), **`zoom`** (the camera pushes into `sel` so it fills `fill` 0.6 of the width over `dur` 0.25s, everything else blurs (`dof: false` to keep it sharp); `release` seconds later it pulls back), **`breath`** (no picture: the music bed dips for `dur` 0.45s by `depth` 0.75 — the pause before a payoff; `motion_mix` reads them from `audio/cues.json`). `at` defaults to evenly spaced. |
| `reveal: "words"` | word-cut, color-punch | Words arrive one after another (0.13s apart, `each` overrides); parts with `accent: true` pop harder and take the accent color. |
| `parts[].accent` | any `parts` | The keyword. Colored `--accent` (ink on accent backgrounds). One per line. |

Rule of thumb per shot: **entrance (0–0.6s) → second act (a beat, a line
swap, a second notification, a cursor) → exit (last 0.3s).** Shots shorter
than 1.6s need no second act.

## Actors

An actor is **one object across many shots**: one element in a layer above
the shots, posed by each shot it passes through, tweened from wherever it was
to the new pose at that shot's start. Cuts stop mattering to it. The folder
that sat between two words is the same folder that drops into the laptop in
the next shot; the bar that counted to 100 is the pill that becomes the disc
the check draws in; the star that was a button lands as the full stop of the
last line and then becomes the mark. This is the chain.

```js
actors: {
  folder: { src: "assets/harvested/folder.png", w: 320 },                  // kind: image
  star:   { kind: "shape", path: "M50 0 C55 30 … Z", fill: "accent", w: 240, h: 240 },   // an SVG shape (MorphSVG morphs `path` poses)
  bar:    { kind: "shape", w: 1400, h: 80, r: 40, fill: "accent" },        // a rect / pill / disc: w, h, r tween between poses
  count:  { kind: "text", text: "63", size: 64, tone: "accent" },          // a word in the brand font
  pill:   { kind: "element", from: "#prompt .line-box" },                   // born from a shot's own element: cloned at that shot's last instant, at its measured place and size
},
shots: [
  { id: "any", type: "line", …, actors: { folder: { at: 3.1, anchor: ".slot-folder", enter: "scale-blur", hold: true } } },
  { id: "drop", type: "device-3d", …, actors: { folder: [
      { at: 0, x: 960, y: 300, scale: 1.4, dur: 0.5 },
      { at: 0.7, x: 960, y: 560, scale: 0.25, blur: 8, opacity: 0, dur: 0.45, ease: "power3.in", out: "fade" } ] } },
  { id: "end", type: "logo-cta", …, actors: { star: { at: 0, anchor: ".logo-img", dx: -160, scale: 0.35, into: ".logo-img" } } },
]
```

| Pose field | Meaning |
|---|---|
| `at`, `dur`, `ease` | when in the shot the move starts (0), how long (0.45s), the ease (`expo.out`; use `power3.in` for a drop or a leave) |
| `x`, `y` | the actor's centre in stage px (1920×1080) |
| `anchor: sel` | centre on this shot's element instead (a `line` slot `.slot-<name>`, a `.logo-img`, a `.ui-frame`), measured at the landing instant; `dx`/`dy` offset it |
| `scale`, `rotation`, `blur`, `opacity` | the transform and the depth cue — near is big and blurred, far is small and sharp |
| `w`, `h`, `r`, `fill`, `path` | a shape's geometry: bar → pill → disc → card is `w`/`h`/`r` poses; a `path` pose morphs an SVG shape |
| `enter` | first pose only: `scale-blur` (from 0.6× and 20px blur — the reference arrival), `fly` (from `from: {x, y}`, oversize, blurred), `fade`, `none` |
| `out` | the actor leaves at the end of this pose's shot (`outAt` seconds to place it): `blur` (rise and blur), `left` / `right`, `shrink`, `fade` |
| `into: sel` | lands into this shot's element, which stays hidden until it does (the mark, a card in a grid); the actor hides on landing |
| `hold: true` | keep the actor on after its last pose instead of leaving with that shot |

An actor with poses in consecutive shots crosses the cut untouched, so a
`hard` cut under a moving actor reads as one take. The layer sits above
every shot; what the actor covers is the shot's business.

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
| `dur` | Seconds. A `line` with steps or a shot posing actors is a scene and may run to 6s; a plain type beat 0.9–3.2s; a `ui-frame` demo 3–6s. When narrated, `motion_sync` sets it from the cue words — you author the `cue`, not the number. A shot lasts exactly `dur`; a factory timeline that runs longer is compressed to fit (reported by the audit). |
| `bg` | `accent` \| `ink` \| `bg` \| a `brand.palette` name \| any CSS color. Text color is picked for contrast. |
| `ink` | Optional explicit text color for this shot. |
| `chapter` | The prompt → product → payoff group this shot belongs to (`"create"`, `"style"`). The studio and the audit read the groups; the first shot of a group opens it. |
| `cut` | `hard` (default, one-frame cut), `punch` (incoming shot lands from 1.12× in 0.38s), or a **transition** that composites both shots for `cutDur` seconds (default 0.5, capped at 45% of the shot): `dissolve`, `wipe-left` \| `wipe-right` \| `wipe-up` \| `wipe-down`, `push-left` \| `push-right` \| `push-up` \| `push-down`, `iris`, `zoom` (the outgoing shot flies past the camera, the incoming arrives from behind it — the push-in from a screen to one of its parts), `zoom-out` (the outgoing shrinks into the frame, the incoming arrives from past the camera — the pull back from a part to the whole), `flip`, `flood` (a halo of `flood.color` blooms behind the outgoing shot for `flood.pre` 0.3s, the frame is that colour for one instant at the cut, and it retreats to `flood.at: {x, y}` (fractions, centre) over `cutDur`, uncovering the incoming shot — the cut that never reads as one). The outgoing shot's exit motion is suppressed under a transition. |
| `cutDur` | Length of this shot's transition in seconds (else `motion.cutDur`, else 0.5). |
| `carry` | Match cut on one element: `{ from: ".logo-img", to: ".logo-img", dur?: 0.55, ease? }` on the incoming shot — a ghost of the outgoing shot's `from` travels to where `to` sits in this shot. For an object that lives through more than one boundary, declare an actor instead. |
| `exit` | Overrides `motion.exit` for this shot. |
| `beats` | Mid-shot events — see "Density layer". |
| `actors` | `{ name: pose \| [pose, …] }` — see "Actors". |
| `ambient` | `false` hides the ambient stage on this shot. |
| `cue` | The script phrase this shot lands on (`"step two"`). `motion_sync` starts the shot ~0.12s before that word. Beats, `word-build` lines and `device-notif` `more` items take `cue` too (→ `at`, `lineAt`, `moreAt`). |
| `vo`, `voDur` | **Legacy per-shot clip — do not use.** More than one fails `motion_audit` (fragmented narration). |
| `drift` | `false` disables the slow rest travel (scale 1.045, x +10, y −8 over the shot). `driftScale` / `driftX` / `driftY` override it. |

## Types

| type | Fields |
|---|---|
| `line` | **The sentence as protagonist** — one line of 2–4 words that changes in `steps` over the shot. `size` (px; 84–110 for a chain line, 150–170 for a hero prompt), `align: "center"\|"left"`, `x`/`y` (the line's centre), `weight`, `container: "glass"\|"pill"` (a frosted or gradient pill that grows with the text), `typing: { cps: 22, caret: true, shrink?: 0.45, fit?: 1560 }` (chars appear one per 1/cps s behind a bar caret; a line that would outgrow `fit` px scales to `shrink` while typing goes on). `steps: [ { at, add: parts } \| { at, replace: parts } \| { at, keep: "style" \| index } \| { at, out: "blur"\|"left"\|"right"\|"fade"\|"shrink" } ]` — **add**: the new words are there in one frame and the line settles onto its new centre (0.4s expo-out, 8% oversize); **replace**: the old words shrink and blur out (5 frames), the new ones land from 1.5× and a 20px blur (8 frames); **keep**: every other word blurs out in place and the kept one slides to the centre — the word is now a button; **out**: the line leaves. `part: { text, tone: "ink"\|"accent"\|"muted"\|"gradient", weight?, rotate?: ["writer", "producer"], every?: 0.5 \| [0.67, 0.3, 0.33], slot?: "folder", w?: 320 }` — `tone` carries the hierarchy (never a weight change); `rotate` swaps the word through alternatives in one frame each, `every` the holds (shrinking toward the exit); a `slot` part reserves `w` px between the words for an actor (`anchor: ".slot-folder"`). Steps are the shot's second and third acts; a `line` with three or more steps may run to 6s. DOM: `.line-box` (the line), `.lw` (a word), `.slot-<name>`. |
| `cascade` | Items land one after another at one anchor and push the earlier ones away while those fall out of focus: `items: [{ src \| html, w?, h?, r? }]`, `every` (0.25), `dir: "up"` (comments, rows — each new one pushes the stack up) \| `"left"` (a strip of cards growing to the right, sliding left), `gap` (24), `x`/`y` (the anchor), `start`, `dof: false` to keep earlier items sharp, `enter: "fade"`, `scroll: px` (after the last item the set keeps travelling), `caption` + `captionPos`. The card duplicating into a strip; the comments arriving. |
| `word-build` | `lines: [{parts: [{text, weight, accent?}]}]` — a sentence assembles word by word in the centre; each further line replaces the last (previous words scatter). `each` (gap between words, 0.13), `align: "left"`, `seed`. |
| `pile` | Chaos beat: `items: [{kind: "window"\|"toast"\|"pill", title?, body?, x, y, rot?, w?, tone?: "error"\|"warn"\|"ok"\|"plain"}]` land one after another (`every`, default fits 55% of the shot), `anchor: parts` headline appears over them, then everything blows away at `blowAt` (default D−0.55; `blow: false` keeps it). 5–8 items. |
| `type-field` | `lines: [{text, weight: thin\|heavy}]` stacked top-left; optional `chrome: [{kind: sms\|bot-pill\|progress, x, y, …}]` floating cards |
| `overlay-type` | `lines: [{parts: [{text, weight}]}]` shown one after another over a ghost phone; `seed` |
| `word-cut` | `parts: [{text, weight, accent?}]` or `text` — one centered line, scale-in; `reveal: "words"` for word-by-word |
| `type-wipe` | `parts` — one centered line sliding in from the right with a char wipe |
| `color-punch` | `text` or `parts` — a full-bleed accent card that punches in and keeps growing; `reveal: "words"` |
| `logo-sting` | `src` (harvested logo/wordmark image), `markSvg` (inline SVG string), `word`, `accentFirst`, `tag`, `mode: mark\|wordmark`, `size: hero`, `vignette` |
| `logo-cta` | same lockup fields as `logo-sting` plus `pill` (typewriter CTA line). DOM: `.logo-img` / `.logo-mark` (an actor's `into` target). |
| `icon-marquee` | `anchor: parts` centered headline; `rows: [{y, items}]` — item is `{src, label, tile?, bg?, round?}` (a harvested logo), `{icon, label}` (built-in channel icon), `{kind:"avatar", src, label}`, `{kind:"pill", label}`, or `{label}` |
| `device-notif` | `notif: {app, src?, iconBg?, kicker, body, tint, ink, meta, call?, sub?}` — `app` is sms/whatsapp/telegram/viber/email/voice/flash, or give `src` for the product's own icon. `more: [notif, …]` drops further notifications in mid-shot, pushing earlier ones down (`moreAt: [s, …]` to place them; `tilt: false` to stop the phone rocking) |
| `stat-counter` | `value`, `prefix?`, `suffix?`, `decimals?`, `from?`, `label` (parts or string). Numbers come from recon. |
| `lottie` | a Lottie file driven frame by frame from the timeline — `src` (a harvested `.json`, `recon/harvested.json` kind `lottie`, or one the user supplied), `height` (720), `width` (= height), `x`/`y` (centred), `fit: contain\|cover`, `from`/`to` (frames; default the whole file at its own rate, looping if the shot is longer), `speed`, `loop: false`, `enter: rise\|scale\|none`, `caption` (parts) + `captionPos`. Mascots, product animations, icon sets — the product's own motion. |
| `rive` | a Rive `.riv` scrubbed from the timeline — `src`, `artboard?`, `animation?` (name; default the file's default animation), `from` (s), `speed`, plus the `lottie` geometry, `enter` and `caption` fields. Needs `motion_scaffold({ rive: true })`. |
| `device-3d` | the product's screen on a real object: `device: slab\|card\|phone\|laptop` (decide it), `src` (a harvested screenshot or a mined frame for the screen, cover-fit; `align: top\|center`), `turn: { from: [x°, y°], to: [x°, y°], ease? }` (decide it — without one the console warns and a house move plays), `color` (body; default the ink), `light`, `shadow` (0–1), `fov`, `offsetY` (px, positive moves the device up — a laptop's base needs room below), `enter: "none"` to skip the arrival from depth, `hover: false`, `caption` + `captionPos`. **`ring`**: several screens around the view axis, seen from inside — `ring: { srcs: [five mined frames], radius: 760, z: -250, lean: 0.55, spin: [-14, 14], offset: 0 }`, each lying along the ring and leaning in; `turn` tilts the whole ring, `exit3d: "through"` flies it past the camera at the end (the frame that then floods or becomes the bar). Real geometry — thickness, bevels, a laptop base — under a key light, a rim in the accent and a cast shadow; use a dark `bg` for a single device or the shadow vanishes; the ring stands on the bare stage. No custom factory; `ShotKit.three` is for what this does not do. |
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
  aura: true,                              // the accent's light spilling from under the frame's edge (the reference UI framing)
  caption: [{ text: "See every ", weight: "thin" }, { text: "deal.", weight: "heavy" }],
  captionPos: "top",                       // top | bottom
  focus: {                                 // ONE hotspot per shot (attention camera)
    x: 0.62, y: 0.28, w: 0.22, h: 0.12,    // hotspot rect; scale is derived from w unless given
    scale: 2.2, at: 0.9, duration: 0.72, ease: "power4.inOut",
    hold: 1.2, release: true, releaseScale: 1.06, landX: 960, landY: 540,
  },
  cursor: { x: 0.73, y: 0.34, at: 1.9, hand: true,            // hand: the big cartoon hand at hero scale
            then: "assets/harvested/deal-open.png", leave: true,
            zoom: { scale: 2.6, at: 1.0, dur: 0.3, dof: true, veil: 0.7, blur: 8 } },   // the click pushes the camera into the point and the rest of the screen blurs to white
  cursors: [{ label: "Kai", color: "#E24B7A", path: [{ x: 0.2, y: 0.7, at: 0.3 }, { x: 0.6, y: 0.6, at: 1.4 }] }],   // named collaborator cursors travelling waypoints
  layers: {                                // parallax: pieces cut from the SAME screenshot by motion_screenshot({ layers })
    w: 1920, h: 1080,                      //   the screenshot's CSS size (the tool prints this whole block)
    items: [                               //   rect in screenshot px; depth 1 = page chrome, 2 = an overlay nearest the viewer
      { src: "assets/harvested/app.layer-1.png", x: 0, y: 0, w: 1920, h: 72, depth: 1 },
      { src: "assets/harvested/app.layer-3.png", x: 760, y: 300, w: 560, h: 380, depth: 2 },
    ],
  },
  tilt: { y: 6, x: 2, at: 0, dur: 4, ease: "sine.inOut" },   // the frame turns from −y..+y / +x..−x degrees while layers shift by depth — the tilted card every product shot of the chapters grammar sits in
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
consequence, or `cursor.zoom` when the clicked thing becomes the subject).
Skip `focus` when the whole screen is the point.

## Materials

`material` on an actor, `container` on a `line`, `aura` on a `ui-frame`, or
the class on an element of a custom type:

| class / field | the look | from |
|---|---|---|
| `mat-glass` / `container: "glass"` | frosted: white 62%, 24px backdrop blur, hairline rim in the accent, soft accent shadow | the prompt pill, the Play pill, the search field |
| `mat-pill` / `container: "pill"` | the accent as a gradient pill with a soft glow, white type | "Creating…" |
| `mat-neumorph` | white-to-tint radial disc, accent rim, soft drop | the Done disc |
| `aura` | the accent's light spilling from under an edge | the UI frames, the selected card |

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
whatever these blocks say — players stop shifting the brand colours. Both
reference films run a 180° shutter: fast moves blur in proportion to their
speed, and a card flip or a fly-past reads as motion instead of strobing.

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
| `MorphSVGPlugin` | one shape becoming another: a logo mark morphing into an icon, a chart turning into a check (actors morph `path` poses with it) |
| `DrawSVGPlugin` | a stroke drawing itself — underlines, connectors, a signature, a route on a map, the check inside the disc |
| `MotionPathPlugin` | anything travelling a curve rather than a straight line — the comet arc |
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
a slab, card, phone or laptop, turning; or a ring of them). The helpers below
are for what it does not do — a stack of the product's cards in depth, an
extruded mark, a scene of several objects.

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

- **Density.** A chain film 8–16 shots, a chapters film 12–40; average
  ≤ 3.4–3.6s; plain type beats ≤ 3.2s, a `line` with steps or a shot posing
  actors ≤ 6s, `ui-frame` ≤ 6s; narrated shots start on their `cue` word
  (sync.mjs). No stretch longer than 1.5s without a designed event.
  `motion_audit` enforces all of this by the film's `design`.
- One idea per shot. Headlines only (≤ 8 words on screen; 2–4 on a `line`).
- Cuts by the design: a chain hides every boundary behind an actor, a carry,
  a flood or a blur exit; a chapters film cuts on a flood or the beat and
  zooms between hero and UI scale. A transition kind is a motion-language
  decision, one or two kinds per film — never a dissolve between two type
  beats.
- Brand from recon: `brand.bg/ink/accent/font` are measured values, `fonts` self-hosted.
- Logos are the product's own files (`logo-sting.src`, marquee `src`), never retyped or redrawn.
