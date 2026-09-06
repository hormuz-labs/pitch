# The move vocabulary — what a launch film is made of

A launch film is a sequence of **moves**: a word that inflates, a card that
flips, a button that splits, an image that stretches into the next scene.
Motion designers own a shared vocabulary of these; `jitter-catalog.md` is
that vocabulary as Jitter ships it today (408 templates), and this file is
the part of it a launch film uses, with the way to make each move in this
engine. Read this before the shot list, pick the moves in `direction.md`,
and write a `move` column in the shot table. A film with fewer than five
distinct moves from here is a slideshow with a shutter.

Three things this vocabulary replaces, because the last films did them and
they read as a template:

| never again | what it looked like | the move instead |
|---|---|---|
| a caret typing a query at hero scale as the opener | "Fall samples\|" for the first second | a **word camera** or a **snap** — the first second is a move, not a cursor; typing lives only inside a rebuilt prompt box, mid-film, after the viewer knows what the product is |
| rings expanding from a press | the `ripple` beat's outline rings around a pill | the control's own state change — the pill **grows**, the button **splits**, the toggle **snaps**, the field **expands** — or a `flood` when the press is the payoff |
| a screenshot of the website in a frame | the Dash results grid, captured, tilted, unchanging | the screen **rebuilt** natively (`ui-frame` with `html`) in the film's palette and type, from the screenshot as reference, so its rows, field, button and result each move on their own |

**Every move comes from the product.** A card flip is for a product that has
cards; a countdown for a launch with a date; a departures-board flip for a
travel product; a ripple for imagery, never for UI. The move is chosen by
what the beat says, in direction.md, with the evidence line every axis has.
Two moves that mean the same thing (elastic text and inflating text) never
share a film.

Legend for the *how* column: **field** — a shot field the engine has today;
**type** — a project type in `js/shots.custom.js` on the named plugin or
filter (`effects-catalog.md` has the recipe pattern); **engine** — nothing
today; write the type in the project and say so in your summary so it can
become a built-in.

## 1. Type — the film's spine

The sentence is the protagonist. It arrives as a move, and the camera stays
on one word at a time; the viewer is never handed a whole line to read.

| move | what it is | a launch film uses it for | how |
|---|---|---|---|
| **word camera** | the camera pushes into each word of the line in turn, the rest soft; the line is read by being travelled | the hook, every chapter's sentence, the claim — the default way a `line` is seen | field: `beats: [{ kind: "zoom", sel: ".lw:nth-child(1)", fill: 0.55, dur: 0.25, release: 0.5 }, { kind: "zoom", sel: ".lw:nth-child(2)", … }]` one per word, 0.35–0.6s apart, the noun last and biggest; **engine** for `line.camera: "words"` |
| **bold text snap** | stacked headline lines collide and settle, 2–3 frames of overshoot then still | the hook of a Kinetic or Elastic film; a two-line claim | field: `word-build` with two `lines` and `each: 0.08`; type: SplitText lines with `y` from ±120% and `ease: "expo.out"` |
| **tilted snap** | each line rotates in at a slight tilt (3–6°) and settles flat | editorial promos, a list of three facts | type: SplitText lines, `rotation: -5 → 0`, `expo.out`, stagger 0.12 |
| **inflating text** | letters swell from thin to fat, a soft morph, and settle | a playful brand's one big word; the payoff word | type: SplitText chars, `scale: 0.7 → 1.06 → 1` with `fontWeight` or `font-variation-settings "wght"` tweened on a variable font (recon self-hosts it), `filter: blur(6px → 0)`; **engine** for a `line.enter: "inflate"` |
| **elastic / stretch-snap** | the word stretches wide or tall and snaps back with a physical overshoot | a casual, punchy brand; one word per beat, never a sentence | type: `scaleX: 1.6 → 1` with `ease: "elastic.out(1, 0.5)"` on the word, `transformOrigin` at the reading edge |
| **sliding text reveal** | words slide up from behind a line mask, one line after the other | the deliberate title, the close before the mark | field: `word-build` with `each: 0.13`; type: SplitText `mask: "lines"`, `yPercent: 110 → 0`, `power4.out` (effects-catalog §1b) |
| **motion-blur text** | the line arrives sharpening from a directional blur, the last word last | fintech, app, "clean confident" lines | field: `line` `replace` steps (the new words land from 1.5× and a 20px blur) with `render.shutter: 0.5`; type: `filter: blur(14px) → 0` with `x` travel |
| **blur text scroller** | a column of words scrolls past blurred and decelerates onto the one that matters | "for X, Y, Z… and you", a list collapsing to the product's case | type: effects-catalog §1g (blur on the wrapper, `power3.out` deceleration) |
| **cascading text** | lines fall into place one after another, each landing separately | three features, three numbers | field: `cascade` with `html` items and `dir: "up"`; `word-build` for words |
| **text scramble** | characters cycle through glyphs and resolve to the word | a technical brand, a release date, a code | type: `ScrambleTextPlugin` (effects-catalog §1f) — once per film |
| **glitch reveal** | the line tears into RGB-split slices for 3–4 frames and resolves | an edgy, sport or streaming brand; never for a calm product | type: three clones offset ±6px in `x` with `mix-blend-mode: screen` in the brand's channels, `clip-path` slices via `CSSRulePlugin`, one burst |
| **type trail** | the word moves and leaves a fading trail of itself behind | a Kinetic film's one whip; a word crossing the frame | type: 5–8 clones staggered 1 frame apart with decreasing opacity, or `render.shutter: 0.8` on a fast `x` tween |
| **rotating word** | one slot in the sentence swaps through alternatives in a frame each | "for writers · producers · editors" | field: `line` part with `rotate` and `every` |
| **dots / lines / shape → text** | dots, rules or a blob rearrange into the word | a brand-name opener; the mark's shape becoming the wordmark | type: `MorphSVGPlugin` on an SVG text path from a shape; dots as `shape` actors with a text-outline target; **engine** for a `line.enter: "morph"` |
| **text extrusion** | the word gains depth, a 3D slab turning under the light | a countdown glyph, a giant number, a "3" that means three steps | type: `ShotKit.three` with `TextGeometry` + `ExtrudeGeometry` in the brand font (effects-catalog §5) |
| **looped / marquee text** | a line scrolls continuously without a seam | a strip of integrations, use cases, cities | field: `icon-marquee` with `{ label }` items |
| **countdown** | large numbers replace each other on the beat, the last one holding | a launch date, "3 steps", a timer the product beats | field: a `line` at `size: 320` with `replace` steps every 0.5–0.7s and `render.shutter`; type: extruded glyphs (above) for the one that matters |
| **counter** | a number climbs, from a blur, on a progress ring, on a halftone poster, in pixels | traction, a percentage, a saving | field: `stat-counter` (from recon, never invented); type: the blur counter sharpens with `filter: blur(10px) → 0` during the climb; a ring is `DrawSVGPlugin` on a circle; a halftone poster is the `halftone` stage under it |
| **bouncy period / zero gravity words** | the full stop bounces; words float weightless and settle | the object that becomes an actor (the period is the chain's birth); a playful close | field: a `text` or `shape` actor posed with `ease: "elastic.out"`; `Physics2DPlugin` for a float |

Rules for the spine: the camera moves to the words, the words do not fly at
the camera; the noun is the last and biggest word and takes the accent; a
line is 2–4 words on screen at once; ≥ 3 distinct type moves per film, each
used for the beat it means (a snap for a claim, a scramble for a date, a
countdown for a launch), never the same one twice in a row.

## 2. Imagery — what happens to a picture

For the product's own photography, generated plates and hardware shots.
**Never on a screenshot of the UI** (the UI is rebuilt, §3); an effect on a
captured screen is a screenshot with a filter on it.

| move | what it is | a launch film uses it for | how |
|---|---|---|---|
| **ripple** | a wave displacement travels across the image, edges bend and recover | a launch, a "drop", the moment before the reveal on the hero plate | type: SVG `<feTurbulence>` + `<feDisplacementMap>` on the image, `scale` and `baseFrequency` tweened on the timeline (attributes via `attr:`), 0.6–1.0s, once; **engine** for `image.effect: "ripple"` |
| **dithering** | the picture is rendered as an animated ordered-noise pattern and resolves to clean | a retro, terminal or indie brand's reveal | type: `ShotKit.frameHook` canvas — draw the image through an ordered-dither threshold whose bias tweens 1 → 0; or `<feTurbulence>` + `<feComponentTransfer type="discrete">` on the plate |
| **halftone / threshold / grainy clamp** | the image as a dot screen, as pure two-tone, or clamped to a few brand colours | duotone-poster films, media and music brands | field: `ambient: { kind: "halftone" }` for the stage; type: `<feColorMatrix>` + discrete `<feComponentTransfer>` on the image, tweened to the clean image |
| **pixel dissolve / pixelated mask** | the image fragments into a coarse pixel grid and dissolves in or out | a reveal for a pixel-art, retro or game brand; a transition between two plates | type: `ShotKit.frameHook` canvas drawing the image at a block size tweened 64px → 1px |
| **CRT** | scanlines, curvature, a phosphor glow over the image | a terminal-noir film's one reveal | type: a scanline overlay (`repeating-linear-gradient`) + `filter: contrast() saturate()` tweened; once |
| **image stretch transition** | the outgoing image stretches along one axis into a smear and the incoming arrives from it | the cut between two plates, two products, before → after | type: `scaleX: 1 → 12` with `filter: blur(20px)` on the outgoing, the incoming from `scaleX: 12 → 1`, both `power3.in/out`, 0.35s, under `render.shutter`; **engine** for `cut: "stretch"` |
| **image mask parallax** | the image moves inside a mask that moves the other way | an editorial plate under a line | type: `clip-path: inset()` tweened one way, the `<img>` `x` the other, `sine.inOut` |
| **nested images** | one image inside another inside another, each frame with its own drift | fashion, editorial, a product with photography | type: 2–3 nested frames each `overflow: hidden` with the inner `scale`/`x` drifting at different rates; the outer frame `r` from the brand |
| **split / negative-mask reveal** | the frame splits open (two halves part) or an inverted shape reveals what is behind | the product reveal after the claim | field: `cut: "wipe-*"` for one edge; type: two halves `xPercent: 0 → ±100` with `power4.inOut`, the reveal already moving beneath |
| **before / after** | split, swipe, slider, side by side | "we replace the slog" beats | type: `clip-path` on the after plate driven by a rule that travels; the rule is 2px of the accent |
| **blend-mode type** | the line multiplies or screens over the plate, a printed quality | editorial, media, duotone films | type: `mix-blend-mode: multiply|screen` on the `line`'s words over a plate; tween the plate, not the mode |
| **morph video mask** | a shape morphs while the plate is revealed inside it | a brand whose mark is a shape | type: `MorphSVGPlugin` on a `<clipPath>` path, from the mark to a full rect |
| **card flip** | a card turns 180° on Y showing its back, thickness visible at 90° | a payment card, a product card, "the other side" | type: two faces with `backface-visibility: hidden` in a `perspective: 1400px` wrapper, `rotationY: 0 → 180`, `power3.inOut` 0.6s; a 4px edge for thickness; `device-3d` `device: "card"` for a real one |
| **3D rotation / rotate-and-scale** | the object spins and tilts or arrives rotating and scaling | a hero object's entrance, a logo | field: `device-3d` `turn`; an actor pose with `rotation` and `scale` |
| **gooey** | two shapes merge like liquid as they meet | a playful brand's actors meeting, the two diamonds becoming one | type: SVG `<feGaussianBlur>` + `<feColorMatrix>` alpha contrast on a group of `shape` actors |
| **fluted glass** | a ribbed refraction over the plate | an iOS-like, premium UI film | type: `<feDisplacementMap>` with a vertical stripe map, `scale` tweened |

## 3. The product — rebuilt, never captured

The screenshot is the reference. The screen on screen is **built in DOM**, in
the film's own type and palette, with the product's real labels, real
structure and real content (a harvested photo where the product shows a
photo, the harvested logo, the recon numbers), so that every part of it can
move: rows land, a field expands, a toggle snaps, a button splits, the
result appears. Jitter's UI families are what this looks like done well.

| move | what it is | a launch film uses it for | how |
|---|---|---|---|
| **search bar reveal** | the field expands from a pill into frame, the caret arrives, the query types, results land beneath | search, Dash, a command palette — *the* "find it" beat | field: `ui-frame` with `html` for the field and results; the field's width tweened in the shot's own timeline via a project type, or a `shape` actor `{ w: 80 } → { w: 900 }` landing `into` the field |
| **the prompt** | a prompt box at UI scale, typed, a generate button with loading and done states, the result arriving | AI products — from the ask to the answer | field: `ui-frame` `html` with a `cursor` and `then`; typing here is fine (it is a prompt box at UI scale, not the opener) |
| **generate button** | the button presses, shows progress, becomes the result | the moment of creation | type: the button's own states in one timeline: press scale 0.96, a progress rule draws (`DrawSVG`), the label swaps, the result rises |
| **button split** | on press, the pill splits into two (the action and its count, the icon and the label) and settles | add-to-cart, share, "one click" | type: two halves in a flex pill, `gap: 0 → 12px` and each half `x`, `expo.out` 0.4s |
| **toggle snap / liquid glass toggle** | the knob crosses with a squash and the track fills | a setting, a permission, "on" | type: knob `x` + `scaleX: 1.2 → 1`, track `background` tweened; glass material from `mat-glass` |
| **button glow / trace** | a soft glow blooms behind the CTA once; an outline draws itself around the button | the CTA at the close | field: `halo` beat — **only** here and as the flood's pre-glow; type: `DrawSVG` on a rounded-rect outline |
| **floating action menu / side rail / nav bar** | a menu expands from a button; a rail slides in; the active state moves along a bar | navigation beats, "everything is one tap away" | type: `ui-frame` `html` with the menu's items entering `y: 12 → 0` stagger 0.05 |
| **feature list (Apple event)** | items land one after another, each with its own beat, the measured pace of a keynote | 3–5 facts about the product | field: `cascade` `dir: "up"` with `html` items; each item a fact from recon |
| **cards / stack / release notes** | cards reveal in a layered sequence; a stack of announcements, each pushing the last back | changelog, testimonials, plans | field: `cascade` with `dof`; type: a stack with `z` and `scale` per depth |
| **push notification (iOS / Android)** | a notification slides in with system timing, more stack beneath | a message arrives, an alert, a payment | field: `device-notif` with the product's `src` icon and `more` |
| **text messages** | bubbles arrive in a conversation, typing dots before each | a chat product, a story told in dialogue | field: `cascade` `dir: "up"` with bubble `html` items; type for the typing dots |
| **charts** | a bar chart grows, a line draws, a donut fills, a line morphs into a radar | traction, comparison, "before → after" data | type: `DrawSVG` for lines (effects-catalog §3c), bars `scaleY` from the baseline stagger 0.06, `MorphSVG` for line → radar; numbers from recon |
| **payment card reveal / digital wallet** | a card slides from a wallet, tilts to catch the light, flips | fintech | field: `device-3d` `device: "card"`; type: card flip (§2) |
| **departures board** | split-flap letters cycle to the destination | travel, logistics, "status" beats | type: per-char flaps, `rotationX: 0 → -90` then the new char `90 → 0`, stagger 0.03 |
| **screens: 3 / cascading / grid / slider / rotating / orbit** | several rebuilt screens arranged and moving as one composition | a suite, "every surface", mobile + desktop | field: `device-3d` `ring` for the orbit; `cascade` `dir: "left"` for the slider and the cascade; a grid is a `cascade` with `every: 0`; type for rotating phones (`ShotKit.three`) |
| **mockup on a device** | a rebuilt screen on a phone, a tablet, a laptop, turning | "on your phone", hardware | field: `device-3d` — the one place a captured frame is still allowed as the screen texture until the engine renders `html` to it; decide `device` and `turn` |

Rules for the product: the rebuild keeps the product's real hierarchy
(sidebar items, labels, buttons, the result cards) and drops what the beat
does not need; a rebuilt screen is never shown still — something inside it
moves within 0.3s of arriving and keeps moving; the cursor is a hand at hero
scale and a pointer inside the UI; one focus move per shot; the camera
settles before the control acts.

## 4. Reveals and transitions

| move | what it is | a launch film uses it for | how |
|---|---|---|---|
| **flood** | the frame floods with the accent from a point and retreats, uncovering the next shot | the cut that never reads as one; the payoff | field: `cut: "flood"` / `beats: [{ kind: "flood" }]` |
| **zoom / zoom-out** | the outgoing flies past the camera, the incoming arrives from behind it, or the reverse | hero scale ↔ UI scale | field: `cut: "zoom"` / `"zoom-out"` |
| **project teaser** | a grid of brand-colour blocks and image tiles flip and shuffle into the reveal | a portfolio drop, a collection, "coming" | type: a 3×3 grid of tiles, each `rotationY` flipping on its own beat with `expo.inOut`, colours from the palette, harvested photos on some tiles |
| **product reveal (kinetic)** | the product arrives on a beat-synced sequence of cuts: word, plate, word, product, mark | hardware, a drop, a launch with a date | the arc: `word-cut` × 3 at 0.4s, a `cut: "punch"` onto the plate, `image stretch` into the product, the mark |
| **split reveal** | two panels part to show what is behind | after the claim | type (§2 split) |
| **kaleidoscope / gradient logo reveal / holographic logo** | the mark surfaces from a folding pattern, from shifting gradient layers, or with a foil shimmer | the close, brands whose colour is the identity | type: `MorphSVG` petals; layered gradients `backgroundPosition` tweened; a conic-gradient sweep under `mix-blend-mode: overlay` on the harvested mark |
| **logo ripple / sliding name / blur logo switcher** | the mark pulses once and the wordmark slides out beside it; marks crossfade through a blur | the lockup | field: `logo-cta`, `carry` for the mark; type: the wordmark `clip-path` reveal |
| **before / after** | see §2 | | |
| **carry / actor** | one object crosses the cut | the chain | field: `carry`, actors |

## 5. The stage — life under everything

Position-only, constant opacity, in the brand's hues, one kind per film,
decided in creative-direction.md Axis 1. Jitter's backgrounds map to the
engine's `ambient` kinds:

| Jitter | `ambient.kind` |
|---|---|
| gradient background loop, haze, petals, vertical / diagonal sweep | `aurora` (hero type) or `blobs` (only when the site is dark-with-glow) |
| blur bubbles | `blobs` with a large `blur` |
| luma dot background, moving dots | `halftone` |
| moving lines, animated stripes | `hairlines` |
| perspective tunnel, kaleidoscope, inward echo loop, ring-scale loop | a project type on `ShotKit.frameHook`, used once, never under type |
| animated repeater, sliding squares, rotating crosses | `shapes` |

## Which moves the engine has today, in one line

`line` (steps, replace, keep, rotate, slot) · `zoom` beats for the word
camera · `word-build` · `cascade` · `pile` · `stat-counter` · `icon-marquee`
· `device-notif` · `device-3d` (turn, ring) · `ui-frame` (`html`, focus,
cursor, layers, tilt) · `lottie` / `rive` · actors (poses, morph, into) ·
cuts `flood`, `zoom`, `zoom-out`, `wipe-*`, `push-*`, `iris`, `flip`, `carry`
· beats `flood`, `zoom`, `blurout`, `halo` (CTA glow and pre-flood only),
`swap`, `pulse`, `kick`, `shake`, `flash`, `breath` · materials `glass`,
`pill`, `neumorph`, `aura` · `render.shutter`, `grade`.

Everything else above is a project type today. The ones worth becoming
built-ins, in the order films ask for them: the word camera on `line`,
`inflate` and `morph` entrances, `cut: "stretch"`, `image.effect: ripple |
dither | pixelate`, a `card` type with a flip, a `button` type with split /
snap / trace states, `device-3d` taking `html` as its screen.
