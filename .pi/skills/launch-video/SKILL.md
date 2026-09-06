---
name: launch-video
description: Build a product launch film — promo, teaser, feature announcement, kinetic typography, "Apple-style" or narrated product video — as a shots.js shot list the shared GSAP engine compiles, its moves taken from the effects lab (motion_effects), previewed live in the studio, cut to one continuous narration read when narrated, and gated by motion_audit. Read this before starting any launch film.
---

# Launch films

A film is a **`shots.js` shot list**. The engine compiles it into DOM plus one
paused GSAP timeline; the studio previews `index.html` live and **reloads it
every time you save `shots.js`**; the user's Export button renders the MP4.

You are the director. The brief is theirs — what it is about, how long,
narrated or not, what it ends on. Everything else is yours: what it looks
like, what moves, what it says. Decide, build, and tell them what you made.

## The brief — settle it before a tool runs

If a question's answer would change the film, ask it. If it would not, decide
it yourself.

| ask when it is open | otherwise |
|---|---|
| **the product** — a URL, or files | use what was given |
| **the length** — a teaser, a launch film, a walkthrough | a length-defining word in the request decides; say what seconds you took |
| **what it covers** — everything, one feature, one release | the request names it, or the product has one job |
| **narration or music-only** | under ~40s is music-only; "script", "voiceover", "explain" means a voice |
| **where it ends** — the CTA | the site's primary call to action |

Ask once, in one message, every question together, the default you would take
in parentheses beside each — then stop and wait. Two to four is normal. When
they answer, or say "you decide", take the defaults and open your next reply
with the assumptions you took.

Never ask about the design, the look, the moves, the colours, the fonts, the
music, or the exact second count. Those are yours. Never re-ask something
already settled.

## Know the product before you design

Look at the site: `motion_recon` on the home page and one page that says what
the hero hides — docs, changelog, pricing. `motion_screenshot` for a couple
of reference frames. Read `recon/brand-tokens.md`.

What you need from it:

- **The palette and the type.** Real hex values; the real font self-hosted
  via `brand.fonts` (recon saves the files). When the font cannot be
  harvested, choose a self-hostable equivalent by personality.
- **The facts.** Real feature names, real numbers, real UI labels, the words
  on its buttons — and the register it writes in. One fact per shot, every
  one of them true.
- **The mechanism.** What goes in, what happens, what comes out, and the one
  thing a user only learns by using it. If the film cannot explain the
  product better than its own landing page, it is not worth making.

What you do **not** owe the site is its assets. A launch film is designed
motion in the brand's voice, not a collage of scraped screenshots. Use the
harvested logo where the mark appears, because a retyped wordmark is wrong.
Use a screen, a photo or a frame from their demo when that specific image
earns its place in that shot. Otherwise build the picture: type, shape,
colour, the product's own words, and the moves from the lab. Do not rebuild a
screen pixel by pixel to prove you looked at it, and never stall waiting for
an asset — say once what would help (the SVG mark, a 1080p recording) and
keep building. `motion_image` makes a brand-locked plate, object, texture or
illustration when the film needs an image nobody has.

## The moves come from the effects lab

The lab is 408 motion effects — every Jitter template rebuilt in the same
GSAP the engine runs, plus three.js, lottie and SVG filters — each with its
code, eight frames, and notes on how it works and how it ports.

- `motion_effects({ query })` — describe the beat in words: "a card flipping
  to reveal a price", "lines colliding and snapping out", "a counter rolling
  up out of a blur". Filter with `family`, `moves` or `libs`.
- `motion_effects({ slug })` — one effect whole: its notes, its source, and
  the path of its frame strip. **Look at the strip** before porting.

Porting one: its DOM goes in `mount(el, shot)`; its `fx.timeline({ duration
})` becomes the `gsap.timeline()` that `animate(el, shot, D)` returns; every
time is a fraction of `D`; every selector is scoped to `el`; `fx.rng` becomes
`ShotKit.rng`; a canvas or three.js `seek` becomes a tween with `onUpdate` on
the returned timeline. `motion_schema({ section: "custom shot types" })` has
the shape. The lab's placeholder words, colours and counts never survive the
port — the product's own go in, and the timing stays.

Five or more distinct moves per film, each cited by lab id in `direction.md`
and in the shot table, so the user can open the same effect in the gallery
and say "that one, but slower". The built-in types carry the spine — `line`,
`word-build`, `cascade`, `stat-counter`, `icon-marquee`, `ui-frame`,
`device-3d`, `pile`, `lottie`, `rive` — and a lab port is for what they
cannot show.

## The two designs

Every film is one of two grammars, measured frame by frame from reference
films. Decide from the product, write it as `design` at the top of
`shots.js`, and read that one file before the shot list:

- **`chain`** (`references/designs/chain.md`) — one continuous take: an
  object born from the words and passed from shot to shot until the mark.
  One object, one job story, few screens. 25–40s.
- **`chapters`** (`references/designs/chapters.md`) — a sentence at hero
  scale, the product doing the thing, a payoff; repeated. A suite or an
  editor with many jobs. 45–90s.

`motion_audit` judges the film by the one it names.

## Three rules

1. **Never a lazy frame.** Something new happens at least every ~1.2s. A shot
   is an entrance, a second act and an exit — never an entrance and a hold.
   `motion_audit` measures it: no quiet stretch over 1.5s, at least 0.7
   events per second. The fix is a step, a pose, a beat, a cursor, or cutting
   the shot. Never lengthening it.
2. **Not the same film twice.** The design, the stage, the rhythm, the hook,
   the moves and the words are decided for *this* product in `direction.md`,
   and every film has one **signature** — the thing only this product could
   own. Near-black with glow orbs, glass and Inter is a template, not a look.
   Banned copy: Introducing · Meet X · Say goodbye to · Seamless ·
   Effortless · Supercharge · Unlock · The future of · In seconds ·
   Game-changing · Powered by AI · All in one place. If a line would fit the
   competitor's film, cut it.
3. **The first second is a move.** Never a logo fading in, never a caret
   typing at hero scale. A snap, the word camera, a countdown, a plate
   rippling. The `ripple` beat (rings from a press) is banned; a press is the
   control changing state, or a `flood`.

**Length is approximate.** 54s and 67s are the same minute. The material
decides; you report what it came out at. "Shorter" means cut a shot, never
rush a read or pad a tail.

## The engine is a tool, not a file

`motion_schema()` lists the shot types and the sections; `motion_schema({
types })` gives their exact fields and the DOM classes they mount;
`motion_schema({ section })` for `actors`, `density layer`, `custom shot
types`, `render and grade`. Ask it for what you are writing. Never read
`engine/js/*`, and never edit the engine. `motion_scaffold()` writes
`index.html` in the one order that compiles (`{ custom: true }` once
`js/shots.custom.js` exists). Every `motion_*` tool that needs a page drives
the CloakBrowser over CDP; there is no Chromium and `playwright install` is
never the answer.

Read on demand: `designs/chain.md` or `designs/chapters.md` (the one you
chose, before the shot list), `creative-direction.md` (deciding the look),
`pacing.md` (where the gate's numbers come from), `audio.md` (bed,
narration, SFX, mix).

## Workflow

**1. Direction.** Read `creative-direction.md`, write `direction.md`: the
brief as settled; the design with its evidence; the look — palette, type,
stage, motion language — each with a line of evidence from recon; the arc and
the hook; the moves, five or more lab ids each with the beat it serves; the
signature; and, for a chain, the chain written as one line of objects with no
gap, or for chapters, the chapter table.

**2. Shot list.** A table: `# | id | type | move (lab id) | dur | copy | cut
| sound`. Present it and keep going; do not wait for approval. One idea per
shot, 2–4 words on a `line`. Rhythm lives in the `dur` column — bursts of
half-second beats against one long shot, never the same number down the page.
If narrated, write the script first (1.9–2.4 words/s) and give every shot the
`cue` phrase it lands on.

**3. Build.** `motion_scaffold()`, then `shots.js` with `design`, `brand`,
the stage, the exit, and the first two or three shots. Save — the user sees
the hook within minutes. `motion_check`. Add two to four shots, save, check,
until it is complete. **Every save is a complete, evaluating literal.** Build
the ported types early; the first port proves the pipeline. Their invariants:
everything on the returned timeline (no CSS animation, no bare `gsap.to`, no
ticker, no `Math.random` — use `rng(seed)`); selectors scoped to `el`; no
infinite glow loops; guard optional targets; text swaps via `tl.set`; time as
fractions of `D`.

A `ui-frame` gets at most one `focus` move, two to five in the whole film,
and its cursor acts after the camera settles, never mid-move.

**4. Audio.** `audio.md` has the craft. Bed via `motion_find_audio`.
Narration is one read: script → `motion_tts` once → `audio.vo` in `shots.js`
→ `motion_align` → `cue` on every shot → `motion_sync({ write: true })`. Then
`motion_cues`, `motion_sfx({ mode: "build" })`, `motion_mix`.

**5. Gate, then look.** `motion_audit({})`: zero ❌, and read every ⚠️. Then
`motion_review({})` and **look at every sheet** — clipped text, an empty
frame, three identical frames, a colour that is not the brand's, a lab
effect's placeholder still on screen. Fix in `shots.js`, re-review what you
touched, re-audit if a `dur` moved. Quote the scorecard line, say what the
sheets showed, and stop.

**6. Export — only when the user asks for an MP4 in chat.** `motion_audit`,
then `motion_render({ out, out_res, fps: 60 })`, then
`motion_verify_duration`. Never concatenate segments or screencast.

## Shot edits

A prompt naming a shot or an element edits only that shot's entry — its
fields, `bg`, `cut`, `steps`, its actor poses — and keeps its `dur` unless
asked, because everything after it moves. A look with no field is a lab query
and a port. "That one, but slower" names a lab id: read it whole and retime.
Verify with `motion_review({ shots: [id] })`; never full-render.

## When a host tool fails

You have no network and no host access, so you cannot install or provision
anything. **Report what failed and what is undone, and stop.** Never
reimplement a tool in the workspace and never hand-write the file it produces
— `audio/vo-words.json`, `audio/cues.json`, `recon/brand-tokens.json` are
measurements, and a plausible substitute is a fabricated result every later
tool will trust. If `motion_effects` fails, say so and build from the
engine's own types; never paste an effect from memory and call it a lab port.
Never call a film built when a gate never ran.

## Before you stop

- The brief was settled first, and the assumptions you took are in writing.
- `direction.md` names the design, the look with its evidence, five or more
  lab ids with their beats, and the signature.
- Every ported effect carries the product's own content and the lab's timing.
- The first shot is a move. No `ripple`. `breath` beats before the payoffs.
- Built progressively, `motion_check` clean after each save.
- Narration is one read, aligned, cued, synced. The mix gate passed.
- `motion_audit` zero ❌. `motion_review` sheets seen. No MP4 unless asked.
