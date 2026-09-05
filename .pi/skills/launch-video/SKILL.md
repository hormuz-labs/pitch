---
name: launch-video
description: Build a product launch film — promo, teaser, feature announcement, kinetic typography, "Apple-style" or narrated product video — as a shots.js shot list the shared GSAP engine compiles, previewed live in the studio, cut to one continuous narration read, and gated by motion_audit. Read this before starting any launch film.
---

# Launch films

A film is a **`shots.js` shot list**. The engine compiles it into DOM plus one
paused GSAP timeline; the studio previews `index.html` live and **reloads it
every time you save `shots.js`**; the user's Export button renders the MP4.
You are the creative director: never ask what effects they want — measure the
brand, write the brief, build, and say what you made.

## Three rules above everything

1. **Brand from evidence.** Every hex and font comes from `motion_recon`;
   every logo and screen is a harvested file. Two products must give two
   unmistakable films. Near-black + glow orbs + glass + Inter is banned
   without evidence from the product's own site; so is retyping a wordmark.
2. **Never a lazy frame.** Something new happens on screen at least every
   ~1.2s. Every shot is *entrance → second act → exit* on a persistent
   `ambient` stage. Six five-second shots with one entrance each is a
   slideshow. `motion_audit` is the judge — 8–16 shots, average ≤ 3.4s (aim
   1.5–2.8), no quiet stretch > 1.5s, ≥ 0.7 events/s — and its per-shot
   table tells you which shot is lazy. Fix it (add a beat, a line, `more`, a
   pile item, a cursor — or cut the shot). Never lengthen. Never argue.
3. **Not the same film twice.** Films built from the house habits all look
   like one film: `ambient: blobs`, `exit: "up"`, a hook → pain → reveal →
   stats → CTA arc, ten built-in types, a 2.5s cut every 2.5s, one voice,
   and copy every AI writes ("Introducing", "seamless", "effortless", "say
   goodbye to", "the future of", "in seconds", "supercharge", "unlock").
   None of these is a default any more. The stage kind, the exit, the rhythm,
   the arc, the voice and the words are decided for *this* product in
   `direction.md`, and every film has one **signature shot**: a project-local
   type in `js/shots.custom.js` that only this product could own.
   `motion_audit` warns on the tells; `motion_review` shows you the frames.

**Length is approximate.** "A 60-second video" means about a minute; 54s and
67s are the same film. Never stretch a shot, pad the tail, rush the read or
add a shot you do not believe in to hit a number. The material decides the
duration; you report what it came out at. "Shorter" means cut a shot.

## The engine is a tool, not a file

- `motion_schema()` lists the shot types and sections;
  `motion_schema({ types })` gives the exact fields **and the DOM classes**
  each type mounts (for `beats.sel` and element targets). Ask it for what you
  are writing. Do not read `engine/js/*` — it is 60KB you would re-send on
  every later turn — and never edit the engine.
- `motion_scaffold()` writes `index.html` (all GSAP plugins, `shots.js`, the
  engine, in the one order that compiles). Never write the page by hand.
- Every `motion_*` tool that needs a page drives the CloakBrowser over CDP.
  There is no Chromium anywhere and `playwright install` is never the answer.

References in this directory, read on demand: `creative-direction.md`
(the brief), `pacing.md` (why the numbers), `audio.md` (bed, narration,
SFX, mix), `attention-camera.md` (`ui-frame` focus), `effects-catalog.md`
(29 numbered recipes — 39KB, so open it only when you are writing a custom
factory, and `grep` its `## ` headings for the one recipe you need rather
than reading it whole). References are pattern libraries, never templates;
`direction.md` outranks every example in them.

## Workflow — the user is watching the preview grow

**0. Recon — know more than the landing page.** The film has to explain
the product better than its own site does, or nobody pays for it; that
takes knowing more than the hero copy.
- `motion_recon` on the home page and one product page (different `out`),
  and on the pages that say what the site's hero hides: docs, changelog,
  pricing, a GitHub README — whichever exist. The changelog is what they are
  proud of; the docs hold the mechanism.
- `motion_screenshot` for 2–3 reference frames; `motion_harvest` for the
  logo, screens, photos, videos and any Lottie / `.riv` the site plays
  itself (it becomes a `lottie` / `rive` shot). **The harvest hands you a
  contact sheet per clip — look at every one.** A poster is the first
  frame; the moment that sells the product is forty seconds in, and it is
  now a still at `assets/harvested/frames/<clip>/t<time>.jpg` you can put
  in a `ui-frame` or on a `device-3d`. Pick frames by their time stamp.
- Read `recon/brand-tokens.md` before a word of direction; `recon/harvested.json`
  says what each file is — never read the image or SVG files themselves.
- Write `recon/assets.md`: what is available, what is official, and the
  **product model** — the mechanism (what goes in, what happens, what comes
  out), the before/after, the one non-obvious thing a user only learns by
  using it, and *what the landing page fails to show*. That last line is the
  film's job. Never invent a number, a feature or a figure to fill it; when
  the site cannot answer, the ask below does.
- **Ask for what the site could not give.** The harvest ends with "Ask the
  user for": the logo as SVG, a 1080p recording, the key screenshots, the
  mark as Lottie/Rive, font files. Put that list — short, specific, with
  what each unlocks — in your first reply, then **keep building** with what
  you have. A file that arrives later is a shot edit, not a restart.
- **Generate what no one has.** When the site has no imagery and none has
  arrived, `motion_image` makes a brand-locked still: a `plate` behind a type
  beat, an `object` for the hook (the thing the product is about, or its
  metaphor, in direction.md's style), a `texture` for the stage, an
  `illustration` of the mechanism, an `icons` set for a marquee. It reads
  the palette from recon and refuses screens, logos, people and text — the
  product is always a harvested screenshot, a mined frame or a native
  rebuild, and `motion_audit` fails a product shot with a generated `src`.
  Look at what comes back; regenerate once with a sharper subject, then move
  on. Two or three generated files per film at most — a film made of
  generated pictures is a stock film.
Fonts: recon self-hosts the brand's files and prints the `brand.fonts`
snippet; if it found none, choose a self-hostable equivalent by personality
(creative-direction.md Axis 2), never a CDN link.

**1. Direction.** Read `creative-direction.md`; write `direction.md` deciding
all 9 axes with one line of recon evidence each — the stage `ambient.kind`,
the `motion.exit`, the rhythm, the hook kind, the arc, the voice and the
copy voice are all in there — and end with the Uniqueness Test: swap test (a
competitor's logo must not fit), evidence audit, anti-default check, the
signature shot named and what it will do, and the **devices line**: for
each of `device-3d`, `ui-frame` + `layers`, `lottie` / `rive`, `carry`, a
transition kind, `render.shutter`, `grade`, `motion_image` — used (which
shot, what evidence) or not (why). "Not, because the site is flat" is an answer; a
line left out is not. Narration is a decision here, not a default.

**2. Shot list.** Present a table — `# | id | beat | type | dur | bg | copy /
asset | second act | focal target (ui-frame) | sound` — then keep going;
do not wait for approval unless the user is actively replying.
- One idea per shot, ≤ 8 words on screen; 8–16 shots, typically 20–40s.
  Type beats ≤ 3.2s, `ui-frame` ≤ 6s. Alternate type beat → product beat.
- Every shot names its second act. Every `ui-frame` names one focal target
  (measured from the screenshot); type/brand/stat/CTA shots get no camera.
- The first 3s are a designed hook of the kind direction.md chose, not a
  logo fading in. Mark 2–3 boundaries `punch`; everything else is a hard cut.
  A transition kind (`cut: dissolve | wipe-* | push-* | iris | zoom | flip`)
  or a `carry` match cut only where direction.md gave it a job — one or two
  kinds per film, never a dissolve between two type beats.
- Rhythm is written into the `dur` column: a run of sub-second beats against
  one long product shot, not the same number down the column.
- Copy per shot is a fact about this product in its own register (a real
  feature name, a real number, a real UI label, a line lifted from its site)
  — never a slogan that would fit its competitor.
- If narrated, **write the script first**: one paragraph at a human pace
  (1.9–2.4 words/s, ~60–70 words per 30s), then give every shot the `cue`
  phrase it lands on. The words decide the durations, so a 3s demo beat
  needs ~6–7 words over it, or a written pause. Never speed the voice up.

**3. Build shot by shot.** `motion_scaffold()`, then `shots.js` with `brand`
(from brand-tokens), the `ambient` and `motion.exit` direction.md decided
(`motion_schema({ section: "density layer" })` lists the stage kinds), the
`render` shutter and `grade` finish if direction.md chose them
(`motion_schema({ section: "render and grade" })`), and the
first 2–3 shots. Save — the user sees the
hook within minutes. `motion_check`. Add 2–4 shots, save, `motion_check`,
until the list is complete. **Every save is a complete, evaluating literal**;
a half-written array shows the user an error.
- Every shot > 1.6s carries a second act: `beats`, `reveal: "words"` with
  one `accent: true` keyword, `word-build` lines, `pile` items,
  `device-notif.more`, a `cursor`/`focus`, a `stat-counter`, a `swap`.
- `logo-sting.src` / `logo-cta.src` / marquee `src` point at harvested
  files. `ui-frame.src` is a harvested screenshot with a `focus`, a `cursor`
  or a `cursor.then` swap — never an unchanged screenshot for a whole shot;
  `html` only when internal parts must animate, rebuilt faithfully.
- Numbers in `stat-counter` are recon numbers.
- A product screen that has real planes (a modal over its page, a sidebar,
  a sticky header) is a `ui-frame` with `layers`: `motion_screenshot({ url,
  out: "assets/harvested/<name>.png", layers: "auto" })` cuts it and prints
  the field; add `tilt` when direction.md is 2.5D.
- The product on the thing it runs on is one shot, no code: `{ type:
  "device-3d", device: "laptop" | "phone" | "slab" | "card", src: <a mined
  frame or screenshot>, turn: { from: [x°, y°], to: [x°, y°] }, caption }`
  on a dark `bg`. Decide `device` and `turn` from the product; the console
  warns when the house move plays.
- A harvested `.json` / `.riv` (or one the user sent) is a `lottie` / `rive`
  shot: `{ type: "lottie", src, height, caption }` — the brand's own motion.
- The signature shot — and any look the engine lacks — is a project type in
  `js/shots.custom.js` (`motion_schema({ section: "custom shot types" })`,
  recipes in `effects-catalog.md`; then `motion_scaffold({ custom: true })`).
  Real 3D (`ShotKit.three`: lit, shadowed, textured), a Lottie or a Rive file
  (`ShotKit.lottie` / `ShotKit.rive`, or the `lottie` / `rive` types) live
  there too; canvas stages redraw from the engine, never from your code.
  Build it early, not last: it is the shot the film is about. Seven
  invariants: everything on the returned timeline (no CSS animation, no bare
  `gsap.to`, no ticker, no `Math.random` — `rng(seed)`); selectors scoped to
  `el`; no infinite opacity/brightness/glow loops, light sweeps one-shot;
  no `filter: blur()` on background-clipped text and `display: inline-block`
  on any such element; guard optional targets (a null tween crashes the
  build); text swaps via `tl.set`, never callbacks; time everything as
  fractions of `D`, never absolute seconds (a factory longer than `dur` is
  compressed; > 1.6× fails the audit).

**4. Audio** (`audio.md` has the craft; the tools have the parameters).
1. Bed: if the user picked one it is already in `audio/`; otherwise
   `motion_find_audio` and copy to `audio/music.mp3`. Name it in your
   summary. Nudge `dur`s so cuts land on the bed's strong beats.
2. Narration, only if direction.md chose it — **one read, cut to words**:
   script → `audio/vo.txt` → `motion_tts({ script })` once → in `shots.js`
   `audio: { vo: "audio/vo.wav", voStart: 0.3 }` (delete any per-shot
   `vo`/`voDur`) → `motion_align` → `cue` on every shot and on the beats /
   lines / `more` items that should land on a word → `motion_sync` to see
   the plan, `motion_sync({ write: true })` to apply. Re-run align + sync
   after any change to script or cues. A squeezed beat gets more words,
   never a padded shot.
3. SFX: cue sheet from real shot starts (`motion_cues`) plus each factory's
   in-shot offsets → `motion_sfx({ mode: "build", duration })`, zero
   placement warnings. ~6 signature cues per 30s, one silent shot.
4. `motion_mix({ duration: <__DURATION()>, music, sfx })` (`music_only:
   true` without narration). It verifies by extraction; a failing gate means
   re-mix, never render.

**5. Gate, then look.** `motion_audit({})`: zero ❌, and read every ⚠️ —
they name the template tells. Then `motion_review({})` and **look at every
sheet**: clipped or overflowing text, words over a busy image, elements
overlapping or half off-canvas, an empty frame, three identical frames (no
second act), a colour or face not in `recon/brand-tokens.md`, a UI
screenshot that never changes. Fix in `shots.js`, `motion_review({ shots })`
for the ones you touched, `motion_audit` again if any `dur` moved. Two
rounds unless a defect is still visible. Quote the scorecard line and say
what the sheets showed and what you fixed, then stop — the preview reloads
on its own.

**6. Export — only when the user asks for an MP4 in chat.** `motion_audit`,
then `motion_render({ out: "renders/launch-<res>.mp4", out_res, fps: 60 })`
— it applies the film's `render` and `grade` blocks — then
`motion_verify_duration`. To look at a shot use `motion_review({ shots
})`; a `from`/`to` render only when the motion itself, not a frame, is in
doubt. Never concatenate segments, screencast, or reach for
Remotion/React/AI video.

## Shot edits (a scoped prompt naming a shot or elements)

Edit only that shot's entry in `shots.js` — its fields, `bg`, `cut`, `type` —
and keep its `dur` unless asked, because every later shot and the mix move
with it. A look with no field becomes a type in `js/shots.custom.js`. Verify
with `motion_review({ shots: [id] })` and, if `dur` moved, `motion_audit`;
never full-render.
Element targets map to fields: `.word`/`.type-line`/`.type-center` →
`lines`/`parts`/`text`; `.punch-card` → `color-punch`; `.mq-item` → a marquee
item; `.notif` → `device-notif.notif`; `.ui-frame` → `src`/`focus`/`cursor`/
`caption`; `.logo-lockup` → `logo-sting`/`logo-cta`.

## When a host tool fails

You have no network and no host access, so you cannot install what it is
missing or provision it. **Report exactly what failed and what is undone, and
stop.** Never reimplement the tool in the workspace and never hand-write the
file it produces — `audio/vo-words.json`, `audio/cues.json`,
`recon/brand-tokens.json` are measurements, and a plausible substitute is a
fabricated result every later tool will trust. A film cut to invented word
timings is not nearly right; its picture is unrelated to its voice. Never
call the film built when a gate never ran: "the audio is done; `motion_check`
could not run" is a useful report, "I built the 60-second video" is not. If
you finish the film without a step the user asked for — a music-only cut
when they asked for narration — the first line of your summary says so.

## Before you stop

- `direction.md` decides 9 axes citing `recon/brand-tokens.md`; swap test
  passed; the signature shot is a custom type built for this product; the
  stage kind, exit, hook and voice were chosen, not inherited; the devices
  line answers every device with evidence or a reason; fonts self-hosted;
  no banned phrase on screen or in the read.
- `recon/assets.md` has the product model and "what the landing page fails
  to show", and the film shows it; the harvest's frame sheets were looked
  at and the asks were relayed in the first reply.
- Real logo via `src`; every `ui-frame` has a focus or a state change;
  stats are recon numbers; hook in the first 3s; ≤ 8 words per screen.
- Built progressively with `motion_check` clean after each save; `ambient`
  on (or direction.md says why not); every shot > 1.6s has a second act.
- Narration is one read in `audio.vo`, aligned, every shot cued, synced —
  no per-shot clips. Bed named; mix gate passed, ≥ 1s past `__DURATION()`;
  SFX built with no warnings.
- `motion_audit`: zero ❌, no shot under 1 ev/s, no template ⚠️ left
  unanswered. `motion_review` sheets seen: no clipped text, overlap or empty
  frame. No MP4 unless asked.
