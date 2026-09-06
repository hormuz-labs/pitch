# Creative direction — deriving a bespoke look per product

Questions and option spaces, not a house style. Recon and product meaning
outrank every menu and range here; invent outside the menus when the evidence
supports it. Work the axes in order — later ones depend on earlier ones —
and write one line of **recon evidence** per choice. No evidence means you
are defaulting: go back to recon. The bar: the video looks like the product's
own design team spent a month on it, built from their exact tokens.

## Axis 0 — Design (the grammar)

Decided first, from the product model in `recon/assets.md`, and it shapes
every later axis. Two grammars were measured frame by frame from reference
films (`designs/chain.md`, `designs/chapters.md`):

| Design | The product | Evidence that picks it | What you must then write |
|---|---|---|---|
| **chain** — one continuous take | has one object the viewer already knows (a file, a message, a photo, a card, a cursor) and one job story: drop it in → it is processed → the result → what you do with it. Few screens, a mark worth landing on. 25–40s, music-only. | the hero copy names one thing and one verb; the demo footage follows one item through the product; the mark is simple enough to be born from a shape | **the chain**: 8–16 objects in order, each born from the previous, each a harvested file, a mined frame or a shape |
| **chapters** — prompt → product → payoff, repeated | is a suite or an editor: many screens, many jobs, features that are each a sentence a user would type. The real UI can carry 60% of the runtime. 45–90s, voice optional. | the site lists features as verbs ("choose a style", "add a voice"); the harvest found five or more distinct screens; the product has a prompt box, a search field, a menu | **the chapter table**: 6–9 rows of prompt · screen · cursor action · payoff, payoffs all different |

A product that fits both takes the chain when it has one object and
chapters when it has one product with many doors. A chapters film may run a
chain inside a chapter (the prompt pill becoming the UI's prompt box is an
actor). The design is written as `design` at the top of `shots.js`; the
audit judges the film by it.

## Axis 1 — Palette and background system

Extract, never invent: base/background, surface, primary text, 1–2 accents
from `recon/brand-tokens.md`. Light or dark is what the *product* ships — a
light SaaS app on a black void is a template. Derive tints by shifting
lightness, never by importing indigo. Then choose ONE background system:

| System | Looks like | Fits | Stage — `ambient` in shots.js |
|---|---|---|---|
| Editorial light | warm paper, ink type, one accent, hairlines | design tools, docs, calm/prosumer | `{ kind: "hairlines", color: "ink" }` |
| Solid brand field | the saturated primary full-bleed, giant type | bold consumer, creator tools | `{ kind: "shapes", color: "ink" }` flat geometry drifting |
| Studio backdrop | soft radial light behind the subject | hardware, mobile, premium | `{ kind: "light" }` one light source orbiting |
| Technical grid | blueprint grid, ticks, mono labels | infra, data, analytics, "precision" | `{ kind: "blueprint", size: 96 }` |
| Terminal noir | true black, phosphor text in the brand accent | CLIs, dev tools, hacker audience | `{ kind: "hairlines", opacity: 0.1 }` or `none` |
| Gradient mesh | mesh/aurora in the brand's own hues | brands whose site already uses gradients | `{ kind: "blobs", size: 900, blur: 160, opacity: 0.35 }` |
| Deep space + glow | near-black, blurred glow shapes | **only** when the site is dark-with-glow; vary hue, count, geometry | `{ kind: "blobs" }` — vary `count`, `seed`, `size` |
| Duotone poster | two-colour print, halftone, cut-outs | media, music, community, campaigns | `{ kind: "halftone", size: 14 }` |
| Bare stage | an off-white tinted toward the accent, nothing else; whitespace does the work | the continuous chain; light products with one object | `{ kind: "none" }` — the chain's stage; the actors are the life |
| Aurora | very soft discs in the brand's hues under hero type, bare under the product | prompt chapters; suites with a prompt box | `{ kind: "aurora", colors?: [...] }` with `ambient: false` on product shots |

The palette's **finish** is the `grade` block in shots.js (schema "Render
and grade"): temperature, a curve, a LUT the user supplied, vignette, grain.
Derive it from the site's own photography and surfaces — warm paper wants a
warm temperature and a touch of grain, a cold data product a neutral 6500K
and no vignette — and write the numbers into direction.md. No grade is a
decision too; a teal-and-orange grade on a product that has neither is
imported taste.

The stage is the first thing every frame shares, so it is the first thing
two films share: `blobs` belongs to two systems only, and the default film
has none of them. Deep space + glow was the old house default and is banned
without site evidence. The background may evolve across shots (hue per beat)
but never switches system mid-film.

## Axis 2 — Typography

The brand's own font, self-hosted via `brand.fonts` (recon saves the files
to `assets/fonts/`), never a CDN link. When it cannot be harvested, match
the personality with a self-hostable equivalent:

| Personality | Equivalents | Feels |
|---|---|---|
| Geometric grotesk | Space Grotesk, Archivo, Sora | modern tech |
| Neo-grotesk | Inter, Instrument Sans, Geist | understated — only if the brand uses one |
| Humanist | Nunito Sans, Source Sans 3, Albert Sans | friendly, consumer, health |
| Serif display | Fraunces, Newsreader, Instrument Serif | editorial, premium, fintech |
| Mono | JetBrains Mono, IBM Plex Mono, Geist Mono | dev tools, data |
| Rounded / display | Bricolage Grotesque, Gabarito | playful, creator, social |

Scale: **poster** (120–200px, few words, type is the visual) or **restrained**
(64–90px, room for UI). Tight tracking on display type (−0.02 to −0.04em),
≤ 8 words per screen, subtitles 24–32px at ~0.75 opacity. The type is
**travelled, not read**: the word camera pushes into one word at a time.
Use **≥ 3 distinct type moves** across the film from the lab's text
family (`motion_effects`: a snap, an inflate, a motion-blur arrival, a
scramble, a countdown, a stretch-snap, a mask reveal…), each for the beat
it means; a move the engine lacks is a lab port in `js/shots.custom.js`. A caret typing at
hero scale is not a type move.

## Axis 3 — Motion language (pick ONE)

| Language | Easings | Tempo | Transitions · `motion.exit` | Avoid | Fits |
|---|---|---|---|---|---|
| Precision | `expo.out`, `power4.inOut` | 0.4–0.6s entrances, 0.03s staggers | `cut: wipe-*` along the flow axis, snap `zoom` into the product · `none` (the cut is the move); no shutter | wobble, blur, dissolves | dev tools, infra, perf |
| Fluid | `power3.inOut`, long `sine` | 0.8–1.4s, overlapping | `zoom` and `dissolve` on 2–3 boundaries, a 3D turn (`ShotKit.three`) · `scale`; `render.shutter: 0.5` | snaps | premium, hardware, fintech |
| Elastic | `back.out(1.6)`, `elastic.out` | 0.5–0.8s, bouncy | `punch`, one `iris` · `scatter` | solemn fades | consumer, creator, social |
| Editorial | `power2.out`, opacity+y | calm, micro-motion holds | `push-*` flat pushes, rule draws · `down`; no shutter | 3D, whip pans | docs, design tools, serif brands |
| Kinetic | `power4.in/out`, beat-synced | very fast, 0.9–1.6s shots | whip `push-*`, `punch`, `carry` match cuts · `up`; `render.shutter: 0.5–0.7` | holds | hype launches, montage |
| Continuous | `expo.out` in, `power3.in` out, geometric shrinks, no bounce | an element every ~1s, holds 0.3–0.8s, never a still frame under a hold | actors across every boundary, `flood`, `zoom` / `zoom-out` between scales · `blur`; `render.shutter: 0.5` | empty frames, slides, dissolves, bounces | the chain and the chapters designs — explainers, AI/builder tools, suites |

`exit: "up"` on every shot of every film was the old default; the exit is the
language's, and two or three shots in any film override it (`shot.exit`) so
the cuts are not a metronome either.

Density is not a language choice: every language keeps an event every
≤ 1.5s — Editorial with rule draws and caption swaps, Fluid with layers,
Precision with wipes and cursor actions. `ambient` is on by default; off is a
direction.md decision with a reason. Boundaries are cut-first: hard cuts,
`punch` on 2–3 landings, the outgoing shot exiting with motion
(`motion.exit`: `up` / `down` / `scale` / `scatter`). A transition
(`cut: dissolve | wipe-* | push-* | iris | zoom | flip`) is the language's,
one or two kinds per film, each on a boundary where it says something — a
wipe along the axis the value flows, a zoom into the product the words
promised, a dissolve over a passage of time; a dissolve between two type
beats is a slideshow. `carry` is the match cut: the mark, the card, the
number travels from one shot into the next. Motion blur (`render.shutter`)
belongs to Fluid and Kinetic; Precision and Editorial stay crisp. Write the
language's parameters into direction.md and reuse them everywhere.

## Axis 4 — Dimensionality (pick one, name the shot that carries it)

| Depth | The device | Fits | Evidence it needs |
|---|---|---|---|
| Flat 2D | type and composition; `punch`, `drift` | Editorial, Precision, print brands | the site itself is flat |
| 2.5D | `ui-frame` with `layers` (+ `tilt`): the product's own modal, sidebar or sticky header lifted off its page by `motion_screenshot({ layers: "auto" })`, moving in parallax under the focus camera | any app whose screens have planes | the layered screenshot found ≥ 1 plane |
| 3D object | `device-3d` — the product's screen on a slab, card, phone or laptop, turning under a key light with a cast shadow; one field set, no code | "on your Mac", "on your phone", hardware, premium, a single hero surface | the product runs on a device, or the site shows one |
| 3D custom | `ShotKit.three` in a project factory: a stack of the product's cards in depth, an extruded mark, several objects | "one platform, many modules", a mark worth extruding | the depth *says* something about the product |

Write the choice into direction.md with the shot that carries it; "flat" is
a decision with a reason, not the absence of one. A film that could have
shown its product on the device it runs on, and did not, left value on the
table — and a 3D flyover with no idea behind it is the generic spectacle.
Camera focus per demo beat is decided in `attention-camera.md`, not here.

## Axis 5 — Composition axis

Horizontal flow (pipelines, "from X to Y") · vertical (feeds, docs, mobile)
· centred poster (manifesto, hero) · split-screen (before/after, us/them) ·
asymmetric editorial grid (design-literate audiences). One dominant axis
matching how the product's value flows; vary between shots for rhythm.

## Axis 6 — Shot format per beat

| The value prop is… | Show it with | Type |
|---|---|---|
| the app itself is great | the real product **rebuilt** from its reference frame, one part moving, one focus move, a click | `ui-frame` with `html` (`tilt`, `aura`, `focus`, `cursor`; the move inside it a project type or an actor) — 30–60% of a UI product's runtime; never `src` |
| the sentence is the scene | 2–4 words that change: a word adds, the line is replaced, one word is kept, the object sits between the words — and the camera travels it word by word | `line` with `steps`, `tone`, a `slot` for an actor, `zoom` beats on `.lw` (the word camera) |
| the sentence lands | a snap, an inflate, a tilted snap, a motion-blur arrival, a mask reveal | `word-build`, `line` `replace` steps, or a lab port from the text family (`motion_effects`) |
| the user types what they want | a prompt box *inside the rebuilt product*, typed at UI scale, the result arriving | `ui-frame` `html` with `cursor` and `then`; typing is never the hero-scale opener |
| one object moves through the product | the file that is dropped in, the card that becomes the grid, the button that becomes the mark | an `actor` posed across the shots (`motion_schema({ section: "actors" })`) |
| the clicked thing becomes the subject | the cursor presses, the camera pushes in, the rest blurs to white | `ui-frame` `cursor.zoom`, or `beats: [{ kind: "zoom", sel }]` |
| many of one thing | cards duplicating into a strip, comments arriving, rows cascading | `cascade` (`dir: "left"` / `"up"`, `dof`) |
| several screens at once | five mined frames on a ring, orbiting, seen from inside | `device-3d` with `ring` |
| the payoff lands | the frame floods with the accent and retreats; the control changes state (the pill grows, the button splits, the toggle snaps); a card flips; a stretch cut | `cut: "flood"`, a lab port from buttons, ui-elements or effects (`motion_effects`); never `ripple` rings |
| the picture has a moment | a ripple across the hero plate, a dither or pixel reveal, a halftone, a split reveal | a lab port from blur, effects or before-and-after (`motion_effects`), on plates and photos only |
| the launch has a date, a count | a countdown at poster scale; a counter from a blur; a progress ring | `line` `replace` steps at `size: 320`; `stat-counter`; `DrawSVG` ring |
| it's on your phone | the real mobile screen | `ui-frame` with `frame: "phone"`, or `device-3d` with `device: "phone"` turning |
| it runs on your Mac / a device | the screen on the object itself | `device-3d` (laptop, slab, card) with a harvested frame as the screen |
| the screen has planes | a modal over its page, a sidebar over a canvas | the rebuilt `html` with the modal and the sidebar as their own elements, moved by depth in a project type; `tilt` when 2.5D |
| the product moves | its own mascot, mark or animation | `lottie` / `rive` from a harvested `.json` / `.riv`, or the file the user sent |
| the moment that sells it is in their video | that exact frame, rebuilt | a mined frame (`assets/harvested/frames/<clip>/t<time>.jpg`) studied and rebuilt as `ui-frame` `html`; as the texture of a `device-3d` only |
| the site has no imagery at all | one object, a plate, a texture — in the palette, in the film's style | `motion_image` (never a screen, a logo or a person); a custom type or a `ui-frame`-less beat carries it |
| a message arrives | a notification landing | `device-notif` with the product's `src` icon |
| the old way is chaos | windows, toasts and pills piling up over the headline, then blown away | `pile` with `items` (`window` / `toast` / `pill`, `tone: "error"`), `anchor: parts`, `blowAt` |
| one line slides in and wipes on | a single centred line arriving from the right, character by character | `type-wipe` with `parts` |
| we replace a slog | old way vs product | custom split-compare, or two `word-cut` shots cut against each other |
| transformation | before → after | `ui-frame` with `cursor.then` |
| developers love it | typed command, real output | `ui-frame` with native `html` in `brand.mono` |
| scale / traction | one number rolling | `stat-counter` (recon numbers) |
| thesis / positioning | the words are the visual | `type-field`, `word-cut`, `word-build`, `overlay-type`, `color-punch` |
| plays with your stack | real integration logos | `icon-marquee` with harvested `src` items |
| open / close | lockup, CTA | `logo-sting`, `logo-cta` with the harvested logo |

A UI product's film that never convincingly shows the UI fails; an API
product's film that fakes a dashboard also fails — show code, diagrams, data
flow. Never the same format twice in a row; alternate dense and sparse. Every
format renders in the film's own palette and type — a terminal beat in an
editorial-light film is a paper-toned card in the brand's mono, not a black
hacker screen.

## Axis 7 — Narrative arc

| Arc | Beats | When |
|---|---|---|
| Problem → relief | hook → pain montage → reveal → 2 proofs → stats → CTA | the product replaces a workflow the viewer already hates — and only then |
| Demo-first | cold open inside the product → "this is X" → 2 features → CTA | products that look great immediately |
| Manifesto | thesis beats → belief → product as answer → one proof → CTA | category creators, poster type |
| Montage | sting → 5–7 vignettes on the beat → stats → CTA | feature-rich, Kinetic, hype |
| Metric-led | a number → what it means → how → proof → CTA | traction, "10×" claims |
| One idea | the film argues a single claim from five angles, no tour | a product with one sharp reason to exist |
| Reverse | the result first, then how it got there | products whose output is the point (renders, reports, code) |

Problem → relief is the arc every template picks; argue for it from the
product or pick another. Stats and a CTA are not owed to the ending — a film
may end on the product doing the thing, on the claim, or on a question. 8–16
shots, 20–40s, average 1.5–2.8s, and **not uniform**: the rhythm belongs to
the arc (a burst of three sub-second beats against one long product shot).

**The hook** (first ≤ 3s) is a kind, chosen here, never a logo fading in:

| Hook | Opens on |
|---|---|
| Cold open | inside the product, mid-action, no title |
| The number | one recon figure, huge, then what it means |
| The question | one line the viewer already asks themselves |
| The anti-statement | what the product refuses to be |
| The object | one UI element (a button, a cursor, a cell) doing one thing |
| The slam | word-per-beat type → colour slam on the trigger word (the lab: `motion_effects({ query: "colour slam on one word" })`) |
| Sound first | a black frame and the SFX, then the picture |

## Axis 8 — Audio persona (decide with Axis 3)

- **Narration: yes or no**, decided here. Kinetic 20–30s type-led films are
  usually stronger music-only; demo-led or explanatory films earn a voice.
  When yes: the voice is cast for the brand — Aoede bright, Kore warm, Leda
  sleek, Charon deep — with a reason in direction.md, and ONE delivery
  direction for ONE read: intimate-confident (premium), bright-energetic
  (consumer), dry-precise (dev), warm-credible (fintech). The arc lives in
  the copy's phrasing, never in separate clips.
- **Music** by language: minimal warm electronic (Fluid), upbeat indie
  (Elastic), sparse percussive (Precision), cinematic build (Manifesto),
  beat-driven (Kinetic — cut on the bed's beat map).
- **SFX density**: Kinetic/Elastic up to ~6 signature cues per 30s;
  Editorial almost none.

## Axis 9 — Words

On-screen copy and the read are where a film sounds like every other AI film
fastest. Rules:

- **The product's own register.** Recon saved the site's copy; write in its
  voice (terse and lowercase, or formal and precise, or playful) and lift
  its real nouns — feature names, UI labels, the words on its buttons.
- **One fact per shot.** Every line carries something only this product
  could say: a recon number, a named feature, a real integration, a specific
  moment in the UI. "Fast" is nothing; "recall in 40ms" is a shot.
- **Banned** on screen and in the script: Introducing · Meet X · Say goodbye
  to · Reimagined · Seamless · Effortless · Supercharge · Unlock · Elevate ·
  Welcome to the future · The future of · Built for teams · In seconds ·
  Game-changing · Next-generation · Powered by AI · All in one place ·
  Your X, simplified. If a line would fit the competitor's film, cut it.
- **Verbs over adjectives**; specific over grand; a sentence a person would
  say out loud over a headline a landing page would print.
- The script is written before the shot list when narrated (SKILL.md step
  2), and it is the same voice as the on-screen copy — one author.

## Three products, nothing shared

A CLI code-review tool: terminal noir in the brand's amber; JetBrains Mono +
a grotesk; Precision; flat; horizontal; terminal demo → diff → counter →
kinetic CTA; demo-first; dry VO over sparse percussion. A journaling app:
editorial paper with the brand's sage; Fraunces + humanist body; Editorial;
2.5D drift on the phone; centred; manifesto → phone demo → chaos-to-calm →
CTA; music-only piano. A data-pipeline platform: technical grid on their
exact `#0E1116`; mono labels + Archivo; Precision leaning Fluid; 2.5D;
horizontal; workflow graph → dashboard with one click → counters →
integrations → CTA; measured female VO over analog pads. That is the bar.
