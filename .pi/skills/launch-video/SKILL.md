---
name: launch-video
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
what comes out. Use the harvested logo wherever the mark appears. Everything
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
say why. (`design: "chain"` or `"chapters"` in `shots.js` makes the audit
hold you to that grammar's tells; leave it out and it judges by the general
rules.)

What reliably makes films worse, so don't: opening on a logo fade or a caret
typing; every shot the same length; a shot that enters and then holds;
near-black + glow orbs + glass + Inter as "the look"; `ripple` beats; copy
that would fit a competitor's film — Introducing, Meet X, Say goodbye to,
Seamless, Effortless, Supercharge, Unlock, The future of, In seconds,
Game-changing, Powered by AI, All in one place.

## The moves come from the effects lab

408 effects — every Jitter template rebuilt in the engine's own GSAP, plus
three.js, lottie and SVG filters — each with its code, eight frames and notes
on how it works and how it ports.

- `motion_effects({ query })` — describe the beat in plain words. Ask for
  `limit: 10`, read past the first hit, and search a beat that matters more
  than one way. Filter with `family`, `moves`, `libs`.
- `motion_effects({ slug })` — the effect whole. **Look at the strip** before
  porting.

Porting: its DOM goes in `mount(el, shot)`; `fx.timeline({ duration })`
becomes the `gsap.timeline()` that `animate(el, shot, D)` returns; times are
fractions of `D`; selectors scoped to `el`; `fx.rng` → `ShotKit.rng`; a
canvas or three.js `seek` → a tween with `onUpdate`.
`motion_schema({ section: "custom shot types" })` has the shape. The product's
own words, colours and counts go in; the lab's timing stays. Cite lab ids in
the shot table so the user can say "that one, but slower".

The engine's built-in types carry the spine — `motion_schema()` lists them,
`motion_schema({ types })` gives their fields — and a lab port is for what
they cannot show. Never read or edit `engine/js/*`.

## Build

1. `motion_scaffold()` (`{ custom: true }` once `js/shots.custom.js` exists),
   then `shots.js` with `brand`, the stage and the first two or three shots.
   Save early so the user sees the hook within minutes. `motion_check`.
2. Add a few shots, save, check, repeat. Every save is a complete evaluating
   literal. Port the lab effects early; the first port proves the pipeline.
   Everything lives on the returned timeline — no CSS animation, no bare
   `gsap.to`, no ticker, no `Math.random` — selectors scoped to `el`, optional
   targets guarded, text swaps via `tl.set`.
3. Audio — `references/audio.md`. Bed via `motion_find_audio`. Narration is
   one read: script (1.9–2.4 words/s) → `motion_tts` once → `audio.vo` →
   `motion_align` → `cue` on every shot → `motion_sync({ write: true })`.
   Then `motion_cues`, `motion_sfx({ mode: "build" })`, `motion_mix`.
4. `motion_audit({})`: zero ❌, read every ⚠️ (`references/pacing.md` says
   where its numbers come from: something new every ~1.2s, no quiet stretch
   over 1.5s, the fix is a beat or a cut, never a longer shot). Then
   `motion_review({})` and **look at every sheet** — clipped text, an empty
   frame, a colour that is not the brand's, a lab placeholder still on
   screen. Fix in `shots.js`, re-review what you touched. Quote the
   scorecard, say what the sheets showed, stop.
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
