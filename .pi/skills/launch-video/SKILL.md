---
name: launch-video
description: Build a product launch film — promo, teaser, feature announcement, kinetic typography, "Apple-style" or narrated product video — as a shots.js shot list the shared GSAP engine compiles, in one of two measured grammars (the continuous chain, or prompt chapters), previewed live in the studio, cut to one continuous narration read when narrated, and gated by motion_audit. Read this before starting any launch film.
---

# Launch films

A film is a **`shots.js` shot list**. The engine compiles it into DOM plus one
paused GSAP timeline; the studio previews `index.html` live and **reloads it
every time you save `shots.js`**; the user's Export button renders the MP4.
You are the creative director: never ask what effects they want — measure the
brand, choose the design, write the brief, build, and say what you made.

## The two designs

Two reference films were measured frame by frame (`references/designs/`).
Every launch film is one of them, decided from the product in step 1:

| | **chain** — `references/designs/chain.md` | **chapters** — `references/designs/chapters.md` |
|---|---|---|
| the film is | one continuous take: an object born from the words, dropped into the product, becoming the next object, until the mark | prompt → product → payoff, repeated: a sentence typed at hero scale, the real UI tilted with a cursor acting, a payoff that floods or morphs |
| fits | a product with one object and one job story; few screens; 25–40s; music-only | a suite or an editor with many screens and jobs; 45–90s; voice optional |
| the unit | an `actor` crossing shots | a `chapter` of shots |
| the cuts | none that show: an actor, a `carry`, a `flood` or `exit: "blur"` on every boundary | on a `flood` or on the beat; `zoom` / `zoom-out` between hero and UI scale |
| the type | a `line` of 2–4 words, the noun in `accent`, the object in a `slot` | a `line` with `typing` in a `glass` container; rotators |
| the stage | bare (`ambient none`), off-white, `motion.exit: "blur"` | white, `aurora` under type, `ambient: false` under product |

What both share: the object persists across scale changes, blur is the
grammar for depth and for exits, one or two things on screen, the real
product every moment, the noun in the accent rather than a weight change,
expo-out arrivals and nothing that bounces, a `breath` before every payoff,
and a 180° shutter. A chapters film may run a chain inside each chapter.
Write `design: "chain" | "chapters"` at the top of `shots.js`; `motion_audit`
judges the film by that grammar.

## Three rules above everything

1. **Brand from evidence.** Every hex and font comes from `motion_recon`;
   every logo and screen is a harvested file or a mined frame. Two products
   must give two unmistakable films. Near-black + glow orbs + glass + Inter
   is banned without evidence from the product's own site; so is retyping a
   wordmark.
2. **Never a lazy frame.** Something new happens on screen at least every
   ~1.2s. A `line` changes in steps, an actor is always mid-move, a product
   shot has a dolly and a cursor. `motion_audit` is the judge — no quiet
   stretch > 1.5s, ≥ 0.7 events/s, the design's own shot and length limits —
   and its per-shot table tells you which shot is lazy. Fix it (a step, a
   pose, a beat, a cursor — or cut the shot). Never lengthen. Never argue.
3. **Not the same film twice.** The design, the chain or the chapter table,
   the stage kind, the exit, the rhythm, the hook, the voice and the words
   are decided for *this* product in `direction.md`, and every film has one
   **signature**: the object only this product could own living as an actor
   across the film, or a project-local type in `js/shots.custom.js`. Copy
   every AI writes ("Introducing", "seamless", "effortless", "say goodbye
   to", "the future of", "in seconds", "supercharge", "unlock") is banned.
   `motion_audit` warns on the tells; `motion_review` shows you the frames.

**Length is approximate.** "A 60-second video" means about a minute; 54s and
67s are the same film. Never stretch a shot, pad the tail, rush the read or
add a shot you do not believe in to hit a number. The material decides the
duration; you report what it came out at. "Shorter" means cut a shot.

## The engine is a tool, not a file

- `motion_schema()` lists the shot types and sections;
  `motion_schema({ types })` gives the exact fields **and the DOM classes**
  each type mounts (for `beats.sel`, `anchor`, `into`); `motion_schema({
  section: "actors" })` for the object across shots, `"design"` for the two
  grammars, `"density layer"` for the stage, exits and beats. Ask it for what
  you are writing. Do not read `engine/js/*` — it is 80KB you would re-send
  on every later turn — and never edit the engine.
- `motion_scaffold()` writes `index.html` (all GSAP plugins, three.js,
  lottie, `shots.js`, the engine, in the one order that compiles). Never
  write the page by hand.
- Every `motion_*` tool that needs a page drives the CloakBrowser over CDP.
  There is no Chromium anywhere and `playwright install` is never the answer.

References in this directory, read on demand: `designs/chain.md` and
`designs/chapters.md` (the grammar you chose — mandatory before the shot
list), `creative-direction.md` (the brief), `pacing.md` (why the numbers),
`audio.md` (bed, narration, SFX, mix), `attention-camera.md` (`ui-frame`
focus), `effects-catalog.md` (recipes for project types — 40KB, so `grep`
its `## ` headings for the one you need). References are pattern libraries,
never templates; `direction.md` outranks every example in them.

## Workflow — the user is watching the preview grow

**0. Recon — know more than the landing page.** The film has to explain the
product better than its own site does, or nobody pays for it.
- `motion_recon` on the home page and one product page (different `out`),
  and on the pages that say what the hero hides: docs, changelog, pricing,
  a README. The changelog is what they are proud of; the docs hold the
  mechanism.
- `motion_screenshot` for 2–3 reference frames; `motion_harvest` for the
  logo, screens, photos, videos and any Lottie / `.riv` the site plays. **The
  harvest hands you a contact sheet per clip — look at every one.** The
  moment that sells the product is forty seconds into their demo, and it is
  now a still at `assets/harvested/frames/<clip>/t<time>.jpg` for a
  `ui-frame`, a `device-3d` screen, a `ring`, a `cascade` card or an actor.
- Read `recon/brand-tokens.md` before a word of direction; `recon/harvested.json`
  says what each file is — never read the image or SVG files themselves.
- Write `recon/assets.md`: what is available, what is official, and the
  **product model** — the mechanism (what goes in, what happens, what comes
  out), the before/after, the one non-obvious thing a user only learns by
  using it, and *what the landing page fails to show*. Never invent a
  number or a feature to fill it.
- **Ask for what the site could not give.** The harvest ends with "Ask the
  user for": the logo as SVG, a 1080p recording, the key screenshots, the
  mark as Lottie/Rive, font files. Put that list in your first reply, then
  **keep building** with what you have. A file that arrives later is a
  shot edit, not a restart.
- **Generate what no one has.** When the site has no imagery, `motion_image`
  makes a brand-locked still: a `plate`, an `object` (the thing the product
  is about — the chain's first actor when the site has no picture of it), a
  `texture`, an `illustration`, an `icons` set. Never a screen, a logo or a
  person; `motion_audit` fails a product shot with a generated `src`. Two
  or three per film at most.
Fonts: recon self-hosts the brand's files and prints the `brand.fonts`
snippet; if it found none, choose a self-hostable equivalent by personality
(creative-direction.md Axis 2), never a CDN link.

**1. Direction.** Read `creative-direction.md`; write `direction.md`:
- **Axis 0, the design**: `chain` or `chapters`, with the evidence (one
  object and one job story, or many screens and many jobs). Then read
  `designs/<design>.md` end to end.
- For a chain: **the chain**, written as one line of objects with no gap,
  and which harvested file or mined frame each object is. For chapters:
  **the chapter table** — 6–9 rows of prompt · screen · cursor action ·
  payoff, the payoffs all different.
- The other 9 axes with one line of recon evidence each: stage kind, type,
  motion language, dimensionality, composition, shot formats, arc, audio
  persona, words. The **devices line**: `device-3d` (single or `ring`),
  `ui-frame` + `layers`, `lottie` / `rive`, actors, a transition kind,
  `render.shutter`, `grade`, `motion_image` — used (which shot, what
  evidence) or not (why). End with the Uniqueness Test: swap test,
  evidence audit, anti-default check, the signature named.

**2. Shot list.** Present a table — `# | id | chapter/object | type | dur |
copy / asset | steps · actors · beats | cut | sound` — then keep going; do
not wait for approval unless the user is actively replying.
- One idea per shot, 2–4 words on a `line`, ≤ 8 anywhere. A chain film
  8–16 shots, 25–40s; a chapters film 12–40 shots, 45–90s. A `line` with
  steps or a shot posing actors is a scene and may run to 6s; a plain type
  beat ≤ 3.2s; a `ui-frame` ≤ 6s.
- Every boundary is decided by the design: an actor pose across it, a
  `carry`, `cut: "flood"`, `zoom` / `zoom-out`, a blur exit — or, in a
  chapters film, a hard cut on the beat. Never a dissolve between two type
  beats.
- Every product shot names its screen (a harvested file or a mined frame by
  time stamp), its `tilt`/`aura`, and what the cursor does.
- Rhythm is written into the `dur` column: bursts of 0.2–0.5s beats against
  one long product shot, not the same number down the column.
- Copy per shot is a fact about this product in its own register (a real
  feature name, a real number, a real UI label, a line lifted from its
  site) — never a slogan that would fit its competitor.
- If narrated, **write the script first** (1.9–2.4 words/s), then give every
  shot the `cue` phrase it lands on. Never speed the voice up.

**3. Build shot by shot.** `motion_scaffold()`, then `shots.js` with
`design`, `brand` (from brand-tokens), the `ambient`, `motion.exit`,
`render` and `grade` direction.md decided, the `actors` block, and the first
2–3 shots. Save — the user sees the hook within minutes. `motion_check`.
Add 2–4 shots, save, `motion_check`, until the list is complete. **Every
save is a complete, evaluating literal**; a half-written array shows the
user an error.
- A `line` is the type beat: `steps` of `add` / `replace` / `keep` / `out`,
  parts with `tone`, `rotate` for alternatives, `typing` with `container:
  "glass"` for a prompt, a `slot` where an actor sits.
- An **actor** is any object that lives through a boundary: declare it once
  (`image`, `text`, `shape`, or `element` born from a shot's element) and
  pose it in every shot it passes — `anchor` on a slot or a mark, `into`
  when it lands as an element, `w`/`h`/`r`/`path` poses for a morph chain,
  `blur` for depth, `out` when it leaves.
- The product: `ui-frame` with `tilt`, `aura`, a `focus` or a `cursor`
  (`hand: true` at hero scale, `zoom` when the clicked thing becomes the
  subject, `cursors` for collaborators), `layers` when the screen has real
  planes (`motion_screenshot({ layers: "auto" })` prints the field);
  `device-3d` with a decided `device` and `turn`, or `ring` with five mined
  frames; `cascade` for cards and rows; `lottie` / `rive` for the brand's own
  motion.
- Beats for what the types do not: `halo` and `ripple` on a press, `flood`
  inside a shot, `zoom` into an element, `blurout`, `breath` before a payoff.
- The signature — and any look the engine lacks (confetti, an extruded
  glyph, a card that flips into eight) — is a project type in
  `js/shots.custom.js` (`motion_schema({ section: "custom shot types" })`,
  recipes in `effects-catalog.md`; then `motion_scaffold({ custom: true })`).
  Build it early. Seven invariants: everything on the returned timeline (no
  CSS animation, no bare `gsap.to`, no ticker, no `Math.random` —
  `rng(seed)`); selectors scoped to `el`; no infinite opacity/glow loops;
  no `filter: blur()` on background-clipped text; guard optional targets;
  text swaps via `tl.set`; time everything as fractions of `D`.

**4. Audio** (`audio.md` has the craft; the tools have the parameters).
1. Bed: if the user picked one it is already in `audio/`; otherwise
   `motion_find_audio` and copy to `audio/music.mp3`. Name it in your
   summary. Nudge `dur`s so cuts and rotator swaps land on the bed's beats.
2. Narration, only if direction.md chose it — **one read, cut to words**:
   script → `audio/vo.txt` → `motion_tts({ script })` once → in `shots.js`
   `audio: { vo: "audio/vo.wav", voStart: 0.3 }` → `motion_align` → `cue`
   on every shot → `motion_sync` to see the plan, `motion_sync({ write:
   true })` to apply. Re-run after any change to script or cues.
3. SFX: `motion_cues` (it also exports the `breath` beats), then
   `motion_sfx({ mode: "build", duration })`, zero placement warnings. Every
   whoosh belongs to a move on screen; ~6 signature cues per 30s.
4. `motion_mix({ duration: <__DURATION()>, music, sfx })` (`music_only:
   true` without narration). It ducks the bed at every `breath` and verifies
   by extraction; a failing gate means re-mix, never render.

**5. Gate, then look.** `motion_audit({})`: zero ❌, and read every ⚠️ —
they name the design's tells (a chain whose cuts show, a chapters film with
no typed prompt or no flood, no breaths, no actors). Then `motion_review({})`
and **look at every sheet**: clipped or overflowing text, words over a busy
image, an actor covering what it should sit beside, an empty frame, three
identical frames, a colour or face not in `recon/brand-tokens.md`, a UI
screenshot that never changes. Fix in `shots.js`, `motion_review({ shots })`
for the ones you touched, `motion_audit` again if any `dur` moved. Two
rounds unless a defect is still visible. Quote the scorecard line and say
what the sheets showed and what you fixed, then stop — the preview reloads
on its own.

**6. Export — only when the user asks for an MP4 in chat.** `motion_audit`,
then `motion_render({ out: "renders/launch-<res>.mp4", out_res, fps: 60 })`
— it applies the film's `render` and `grade` blocks — then
`motion_verify_duration`. Never concatenate segments, screencast, or reach
for Remotion/React/AI video.

## Shot edits (a scoped prompt naming a shot or elements)

Edit only that shot's entry in `shots.js` — its fields, `bg`, `cut`, `type`,
its `steps`, its actor poses — and keep its `dur` unless asked, because
every later shot and the mix move with it. A look with no field becomes a
type in `js/shots.custom.js`. Verify with `motion_review({ shots: [id] })`
and, if `dur` moved, `motion_audit`; never full-render.
Element targets map to fields: `.lw`/`.line-box` → a `line` step or part;
`.actor` → an actor pose; `.word`/`.type-line`/`.type-center` →
`lines`/`parts`/`text`; `.cascade-item` → a `cascade` item; `.ui-frame` →
`src`/`focus`/`cursor`/`tilt`; `.logo-lockup` → `logo-sting`/`logo-cta`.

## When a host tool fails

You have no network and no host access, so you cannot install what it is
missing or provision it. **Report exactly what failed and what is undone, and
stop.** Never reimplement the tool in the workspace and never hand-write the
file it produces — `audio/vo-words.json`, `audio/cues.json`,
`recon/brand-tokens.json` are measurements, and a plausible substitute is a
fabricated result every later tool will trust. Never call the film built
when a gate never ran: "the audio is done; `motion_check` could not run" is
a useful report, "I built the 60-second video" is not. If you finish the
film without a step the user asked for — a music-only cut when they asked
for narration — the first line of your summary says so.

## Before you stop

- `direction.md` names the design with evidence, and the chain (no gap) or
  the chapter table (6–9 rows, payoffs all different); the 9 axes cite
  `recon/brand-tokens.md`; the devices line answers every device; the
  signature is named; fonts self-hosted; no banned phrase on screen or in
  the read.
- `recon/assets.md` has the product model and "what the landing page fails
  to show", and the film shows it; the harvest's frame sheets were looked
  at and the asks were relayed in the first reply.
- `shots.js` carries `design`; every object that crosses a boundary is an
  actor; every product shot is a real screen with a cursor, a focus or a
  dolly; `breath` beats before the payoffs; the mark is a harvested file
  and the last thing on screen.
- Built progressively with `motion_check` clean after each save.
- Narration is one read in `audio.vo`, aligned, every shot cued, synced —
  no per-shot clips. Bed named; mix gate passed, ≥ 1s past `__DURATION()`;
  SFX built with no warnings.
- `motion_audit`: zero ❌, no shot under 1 ev/s, no design ⚠️ left
  unanswered. `motion_review` sheets seen: no clipped text, overlap or empty
  frame. No MP4 unless asked.
