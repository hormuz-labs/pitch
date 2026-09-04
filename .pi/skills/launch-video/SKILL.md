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

## Two rules above everything

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
(31 effect recipes for custom factories). References are pattern libraries,
never templates; `direction.md` outranks every example in them.

## Workflow — the user is watching the preview grow

**0. Recon.** `motion_recon` on the home page and one product page (different
`out`), `motion_screenshot` for 2–3 reference frames, `motion_harvest` for
the logo, screens and photos. Read `recon/brand-tokens.md` before a word of
direction; write `recon/assets.md` (what is available, what is official).
Fonts: recon self-hosts the brand's files and prints the `brand.fonts`
snippet; if it found none, choose a self-hostable equivalent by personality
(creative-direction.md Axis 2), never a CDN link. From the copy and the
screenshots, note what the product *is* and its 2–3 real value propositions
in its own words.

**1. Direction.** Read `creative-direction.md`; write `direction.md` deciding
all 8 axes with one line of recon evidence each, and end with the Uniqueness
Test: swap test (a competitor's logo must not fit), evidence audit, anti-
default check, one signature shot only this product could own. Narration is
a decision here, not a default.

**2. Shot list.** Present a table — `# | id | beat | type | dur | bg | copy /
asset | second act | focal target (ui-frame) | sound` — then keep going;
do not wait for approval unless the user is actively replying.
- One idea per shot, ≤ 8 words on screen; 8–16 shots, typically 20–40s.
  Type beats ≤ 3.2s, `ui-frame` ≤ 6s. Alternate type beat → product beat.
- Every shot names its second act. Every `ui-frame` names one focal target
  (measured from the screenshot); type/brand/stat/CTA shots get no camera.
- The first 3s are a designed hook, not a logo fading in. Mark 2–3
  boundaries `punch`; everything else is a hard cut; there are no crossfades.
- If narrated, **write the script first**: one paragraph at a human pace
  (1.9–2.4 words/s, ~60–70 words per 30s), then give every shot the `cue`
  phrase it lands on. The words decide the durations, so a 3s demo beat
  needs ~6–7 words over it, or a written pause. Never speed the voice up.

**3. Build shot by shot.** `motion_scaffold()`, then `shots.js` with `brand`
(from brand-tokens), `ambient: { kind: "blobs", color: "accent" }`,
`motion: { exit: "up" }` and the first 2–3 shots. Save — the user sees the
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
- A look the engine lacks becomes a project type in `js/shots.custom.js`
  (`motion_schema({ section: "custom shot types" })`, recipes in
  `effects-catalog.md`; then `motion_scaffold({ custom: true })`). Seven
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

**5. Gate.** `motion_audit({})`. Zero ❌. Quote the scorecard line in your
summary, then stop — the preview reloads on its own.

**6. Export — only when the user asks for an MP4 in chat.** `motion_audit`,
then `motion_render({ out: "renders/launch-<res>.mp4", out_res, fps: 60 })`,
then `motion_verify_duration`. Otherwise use `motion_render` only with
`from`/`to` to inspect one shot. Never concatenate segments, screencast, or
reach for Remotion/React/AI video.

## Shot edits (a scoped prompt naming a shot or elements)

Edit only that shot's entry in `shots.js` — its fields, `bg`, `cut`, `type` —
and keep its `dur` unless asked, because every later shot and the mix move
with it. A look with no field becomes a type in `js/shots.custom.js`. Verify
with `motion_audit` or a `from`/`to` render of that shot; never full-render.
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
could not run" is a useful report, "I built the 60-second video" is not.

## Before you stop

- `direction.md` decides 8 axes citing `recon/brand-tokens.md`; swap test
  passed; the signature shot is product-specific; fonts self-hosted.
- Real logo via `src`; every `ui-frame` has a focus or a state change;
  stats are recon numbers; hook in the first 3s; ≤ 8 words per screen.
- Built progressively with `motion_check` clean after each save; `ambient`
  on (or direction.md says why not); every shot > 1.6s has a second act.
- Narration is one read in `audio.vo`, aligned, every shot cued, synced —
  no per-shot clips. Bed named; mix gate passed, ≥ 1s past `__DURATION()`;
  SFX built with no warnings.
- `motion_audit`: zero ❌, no shot under 1 ev/s. No MP4 unless asked.
