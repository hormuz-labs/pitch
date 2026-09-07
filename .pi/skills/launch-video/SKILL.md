---
name: launch-video
tools: motion
description: Build a product launch film — promo, teaser, feature announcement, kinetic typography, narrated product video — as a shots.js shot list the shared GSAP engine compiles, its moves drawn from the effects lab (motion_effects), previewed live in the studio and gated by motion_audit. Read this before starting any launch film.
---

# Launch films

A film is a **`shots.js` shot list**. The engine compiles it into DOM plus one
paused GSAP timeline; the studio previews `index.html` live and reloads it
every time you save; the user's Export button renders the MP4.

You are the director. The brief is theirs; the film is yours. Decide, build,
then tell them what you made and why.

## The brief

Ask only what would change the film — the product (URL or files), roughly
how long, what it covers, narrated or music-only (under ~40s: music), where
it ends — once, all in one message, each with the default in parentheses,
then wait. Never ask about the look, the moves, colours, fonts or music.
"You decide" means take the defaults and say so.

## Know the product

`motion_recon` on the home page and one page that says what the hero hides
(docs, changelog, pricing); `motion_screenshot` a couple of frames; read
`recon/brand-tokens.md`. Take from it the real palette and type (self-host
the font via `brand.fonts`), the real facts (feature names, numbers, the words
on its buttons, its register) and the mechanism: what goes in, what happens,
what comes out. (`recon/brand-tokens.json` is the same measurement for the
tools — nothing to read there.) Look once at the saved logo (`assets/logo/`)
and use it wherever the mark appears; if what recon saved is not the mark, say
so and set the wordmark in the brand's type. Recon also self-hosts the
product's font files into your `assets/fonts/`; when it saved none, the
brand font is a system stack — the shared assets are not the brand. Everything
else is designed motion in the brand's voice, not a collage of its
screenshots; `motion_image` makes an image nobody has. Never stall for an
asset — say once what would help and keep building.

## Make it this product's film

Write `direction.md`, a few lines each: what the film is about in one
sentence; the look (palette, type, stage, finish, each with its evidence from
recon); the arc and the hook; the rhythm; and the **signature** — the one
thing only this product could own. Then the shot table:
`# | id | type | move (lab id) | dur | copy | cut | sound`. Present it and
keep building; do not wait for approval.

The structure is open. One continuous take where an object is passed from
shot to shot, chapters cut on the beat, a manifesto, a demo with a cursor,
something you invent for this product — pick what the product asks for and
say why.

Plan to the gate, not after it. `motion_audit` notes a picture that sits
still past 1.5s or averages under 0.7 changes a second. Those are the
reference films' numbers and a suggestion, not a rule: answer a note with a
beat or a cut, or keep the hold and say why in direction.md — a lab effect
ported whole keeps its own timing, and a counter never gets a film rebuilt.
What does get rebuilt at the end is a shot list that only enters, so every
shot in the table has **three acts** — it arrives, something changes, it
leaves — and the `move` column names all three. Anything over 1.5s carries a
second act (`beats`, `steps`, an actor, a `focus`, a `cursor`) or is cut.

**One subject, centred, big.** The reference films keep one thing in the
middle of the frame and let it fill it: a word, a card, a control, a number.
A whole desktop is never the subject — crop to the control the copy is about
(`motion_screenshot({ selector })`, at 2×), rebuild that one piece as `html`,
or push into it with `focus` until it fills the frame.

What reliably makes films worse, so don't: opening on a logo fade or a caret
typing; every shot the same length; a shot that enters and then holds;
near-black + glow orbs + glass + Inter as "the look"; `ripple` beats; copy
that would fit a competitor's film — Introducing, Meet X, Say goodbye to,
Seamless, Effortless, Supercharge, Unlock, The future of, In seconds,
Game-changing, Powered by AI, All in one place.

## The moves come from the effects lab

408 effects — every Jitter template rebuilt in the engine's own GSAP, plus
three.js, lottie and SVG filters — each with its code, eight frames and notes
on how it works and how it ports. Look there for **everything** — how the
headline lands, how the number counts, how the card turns, how the logo
resolves — before you reach for a built-in. Type never just slides in: the
`text` family alone has 69 moves, and `word-cut`, `type-wipe`,
`color-punch`, `type-field` and `overlay-type` are placeholders the check
flags. The built-ins that carry the product itself — `ui-frame`,
`device-3d`, `logo-sting`, `logo-cta`, `stat-counter`, `line` with steps —
stay.

- `motion_effects({ query })` — describe the beat in plain words. Ask for
  `limit: 10`, read past the first hit, and search a beat that matters more
  than one way. Filter with `family`, `moves`, `libs`.
- `motion_effects({ slug })` — the effect whole. **Look at the strip** before
  porting.

Porting: its DOM goes in `mount(el, shot)`; `fx.timeline({ duration })`
becomes the `gsap.timeline()` that `animate(el, shot, D)` returns; times are
fractions of `D`; selectors scoped to `el`; `fx.rng` → `ShotKit.rng`; a
canvas or three.js `seek` → a tween with `onUpdate`; the lab's 1280×720
stage is the film's 1920×1080 at 1.5×. **Masks clip.** A reveal that hides
overflow at line-height ≤ 1 cuts every descender and accent at hero size:
give the mask `padding: .16em .08em .24em` with the same negative margin,
start hidden text at yPercent 140, keep the longest line inside 1760px.
`motion_schema({ section: "custom shot types" })` has the shape. The product's
own words, colours and counts go in; the lab's timing stays. Put
`lab: "<id>"` on the shot and cite it in the table so the user can say
"that one, but slower".

`motion_schema()` lists the built-in types, `motion_schema({ types })` gives
their fields. The engine and the vendor libraries are not on disk for you;
read only what you edit (`shots.js`, `js/shots.custom.js`, `direction.md`)
and reference everything else through the tools.

## Build

1. `motion_scaffold()` writes index.html and a starter `shots.js` — the
   brand recon measured, `shots: []` — so the first thing you write is a
   shot. `{ custom: true }` once `js/shots.custom.js` exists; it links
   `css/custom.css` for those types' styles. Put the stage and the first two
   or three shots in and save early so the user sees the hook within
   minutes. `motion_check` — it prints the shot-list warnings the audit will
   raise; fix them now.
2. Add a few shots, save, check, repeat. Every save is a complete evaluating
   literal. Port the lab effects early; the first port proves the pipeline.
   Everything lives on the returned timeline — no CSS animation, no bare
   `gsap.to`, no ticker, no `Math.random` — selectors scoped to `el`, optional
   targets guarded, text swaps via `tl.set`. Edit files in place; never
   rewrite a file you have not just read — a 30KB rewrite from memory is
   where the edits that could not find their text came from.
3. Audio — `references/audio.md`. Bed via `motion_find_audio`. Narration is
   one read: script (1.9–2.4 words/s) → `motion_tts` once (it re-records by
   itself if a take comes back rushed) → `audio.vo` → `motion_align` →
   `cue` on every shot → `motion_sync({ write: true })`. Then `motion_cues`,
   `motion_sfx({ mode: "build" })` (★ marks the signature cues the budget
   counts), `motion_mix`.
4. `motion_audit({})`: zero ❌. A ⚠️ is a note: pacing notes name the still
   stretch — answer with a beat or a cut, or keep it and say why in
   direction.md; never a longer shot (`references/pacing.md` has the
   numbers). Then `motion_review({})`: fix every line of its clipped-type and
   subject reports, and **look at every sheet** — an empty frame, a colour
   that is not the brand's, a lab placeholder still on screen, an edge
   touched. Fix in `shots.js`, then `motion_review({ shots: [...] })` for what
   you touched — not another audit unless a `dur`, a cue or a beat changed.
   Audio-only changes (a breath, a level) need `motion_cues` and `motion_mix`,
   never a re-audit. Quote the scorecard, say what the sheets showed, stop.
5. Export only when the user asks for an MP4: `motion_audit`,
   `motion_render({ out, out_res, fps: 60 })`, `motion_verify_duration`.

Length is approximate: the material decides and you report what it came out
at. "Shorter" means cut a shot, never rush a read.

## Edits

A prompt naming a shot edits that shot's entry and keeps its `dur` unless
asked. "That one, but slower" names a lab id: read it whole and retime.
Verify with `motion_review({ shots: [id] })`, never a full render.

## When a tool fails

There is no network and no host. Report what failed and what is undone, and
stop. Never hand-write a measurement (`audio/vo-words.json`,
`audio/cues.json`, `recon/brand-tokens.json`), never paste an effect from
memory and call it a lab port, never call a film built when a gate never ran.
