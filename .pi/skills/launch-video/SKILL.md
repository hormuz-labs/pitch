---
name: launch-video
description: Build a product launch film — promo, teaser, feature announcement, kinetic typography, narrated product video — as a shots.js shot list the shared GSAP engine compiles, its moves drawn from the effects lab (`pitch effects`), previewed live in the studio and gated by pitch motion audit. Read this before starting any launch film.
---

# Launch films

A film is a **`shots.js` shot list**. The engine compiles it into DOM plus one
paused GSAP timeline; the studio previews `index.html` live and reloads it
every time you save; the user's Export button renders the MP4.

You are the director. The brief is theirs; the film is yours. Decide, build,
then tell them what you made and why.

## The brief — two questions, as buttons

"A launch video" is not a brief. It is a **cinematic film**, a **product
walkthrough**, a **3D render**, a **teaser**, a **feature announcement**, a
**kinetic-typography manifesto** — six different films from the same product,
and no amount of recon tells you which one they meant. That is the one thing
you cannot decide for them, so ask it with `ask_user`, which draws the options
as buttons they click:

1. **Before you build anything** — the kind, and anything else that changes
   the whole film. One `ask_user` call, at most three questions, each option
   with a one-line hint saying what it means for the film, the one you would
   pick yourself first:
   - `kind` — Cinematic · Product walkthrough · 3D render · Teaser · Feature
     announcement · Kinetic typography. Use the ones that fit THIS product,
     not all six.
   - `length` — ~15s teaser · ~30s standard · ~60s full — when they gave none.
   - `voice` — Music only · Narrated — only above ~40s; under that it is
     music, and not a question.

   Then **end your turn** and wait. Never ask about the look, the moves, the
   colours, the fonts or the music: those are yours.

2. **After recon, before `direction.md`** — what the film is about. A product
   has more in it than 30 seconds can hold, and now you have seen it: offer
   its real features, in its own words off its own pages, as a `multi: true`
   question, plus the ending (Download · Sign up · Just the mark). Three or
   four options, drawn from what recon actually found — never a generic list.

Both rounds can be one call when the first turn already gave you the product
(a URL you have reconned, or files in the workspace). "You decide" means take
your own first option for each, say so in a line, and get on with it.

Do not ask a third time, do not ask anything you can answer by reading the
site or the shelf, and never let a question stall the build once it is
answered.

### What each kind actually changes

The answer is not a label on the same film. It decides the material:

| kind | the stage | where the moves come from | the object |
|---|---|---|---|
| Cinematic | designed motion, no chrome | `text`, light, camera families | a form — the mark, a shape that becomes the product |
| Product walkthrough | `ui-frame` with a cursor, real screens pushed into | `ui`, `device-3d`, cursor moves | the cursor, or the card it drags |
| 3D render | three.js / an isometric stage | the `3d` and `three` libs in the lab | the object itself, turning |
| Teaser | one idea, ~15s, mostly type | `text`, `word-cut`, hard cuts | one word, restated |
| Feature announcement | the feature on screen, named | `ui` + `stat-counter` + `line` steps | the thing the feature makes |
| Kinetic typography | type IS the picture, no UI | the 69 `text` moves | a line, one word at a time |

Everything else — palette, fonts, rhythm, the signature — comes from recon and
from you, in every one of them.

## Know the product

`pitch motion recon` on the home page and one page that says what the hero hides
(docs, changelog, pricing); `pitch motion screenshot` a couple of frames; read
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
screenshots; `pitch motion image` makes an image nobody has. Never stall for an
asset — say once what would help and keep building.

## Make it this product's film

Write `direction.md`, a few lines each: what the film is about in one
sentence; the look (palette, type, stage, finish, each with its evidence from
recon); the arc and the hook; the rhythm; **the object** (below); and the
**signature** — the one thing only this product could own. Then the shot
table: `# | id | type | move (lab id) | dur | copy | cut | joins | sound`.
Present it and keep building; do not wait for approval.

The structure is open — chapters cut on the beat, a manifesto, a demo with a
cursor, something you invent for this product — but the joins are not.

## One object, and the transition is the next subject

What keeps a viewer on a launch film is that almost nothing arrives new
(`references/continuity.md`, measured). The bar that wipes a line away
turns edge-on and is the phone the next shot is about; the square becomes
the diamond becomes the mesh. One object, restated, and the viewer never
re-orients. Name it in `direction.md` — this product's: its file, its
message, its card, its cursor, its mark; never a reference's shapes — and
write its chain as one line. Then let it cross: an **actor** posed on both
sides of every cut (`pitch motion schema --section actors` — `anchor`,
`into`, `hold`, `w/h/r` and `path` poses that morph), a `carry` for a match
cut on one element, a `flood` or a `zoom` where the frame itself is the
join. `pitch motion check` counts the boundaries nothing crosses; over a third and
the film reads as slides however dense it is. A `punch` is the cut you keep,
on a beat, two or three in a film.

The same is true inside a shot. A line arrives **one word at a time**, each
fully formed in a single frame, 0.6–0.8s apart: `line` with `steps`, one
`add` per word, the noun last in `accent`, `replace` for the next thought.
A 2.2s shot then holds three events and never reads as a hold — that is
the answer to "enough time to read, not enough to get bored", not a longer
`dur`.

Plan to the gate, not after it. `pitch motion audit` notes a picture that sits
still past 1.5s or averages under 0.7 changes a second. Those are the
reference films' numbers and a suggestion, not a rule: answer a note with a
beat or a cut, or keep the hold and say why in direction.md — a lab effect
ported whole keeps its own timing, and a counter never gets a film rebuilt.
What does get rebuilt at the end is a shot list that only enters, so every
shot in the table has **three acts** — it arrives, something changes, it
leaves — and the `move` column names all three. A lab effect ported whole
already has them: its timeline is the acts, and `pitch motion check` does not
judge a project type. `beats` exist for the built-in types that only enter
(`line`, `logo-cta`, `stat-counter`…) — a `swap`, a `flood`, a `breath`.
**Never add a `pulse`, `kick`, `shake` or `halo` to a ported effect to
answer a note** — that is copy jiggling, and it is what the user cuts.

**An effect is used in the form it was defined.** Its composition — how
many things are on the stage, their sizes, their arrangement — is the
effect as much as its timing: three forms piling up stay three forms;
a grid of cards stays a grid. Put the product's words, colours and counts
in; do not reduce it to one big thing, and do not add a kicker above it.
A whole desktop screenshot is the one thing that never reads at 1080p —
push into the part the copy is about, or rebuild that part as `html`.

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

- `pitch effects list` — the whole shelf, one line each: id, length, the
  libraries and the move it makes. **Read it once, early**, and you have seen
  every option instead of guessing at eight at a time. Narrow it with
  `--moves flip-3d`, `--libs three`, or by family: `pitch effects text list`
  (a family is a subcommand; `pitch effects --help` lists them).
- `pitch effects search a card flipping to reveal a price` — the same shelf
  scored against words, when you know the move but not where it lives.
- `pitch effects show text/bold-text-snap` — the effect whole. **Look at the
  strip** before porting.

The lab is a directory, so an effect added to it is listed the moment it is
there. Nothing is indexed ahead of time and there is nothing to rebuild.

Porting: its DOM goes in `mount(el, shot)`; `fx.timeline({ duration })`
becomes the `gsap.timeline()` that `animate(el, shot, D)` returns; times are
fractions of `D`; selectors scoped to `el`; `fx.rng` → `ShotKit.rng`; a
canvas or three.js `seek` → a tween with `onUpdate`; the lab's 1280×720
stage is the film's 1920×1080 at 1.5×. **Masks clip.** A reveal that hides
overflow at line-height ≤ 1 cuts every descender and accent at hero size:
give the mask `padding: .16em .08em .24em` with the same negative margin,
start hidden text at yPercent 140, keep the longest line inside 1760px.
`pitch motion schema --section "custom shot types"` has the shape. The product's
own words, colours and counts go in; the lab's timing and composition stay. Put
`lab: "<id>"` on the shot and cite it in the table so the user can say
"that one, but slower".

`pitch motion schema` lists the built-in types, `pitch motion schema --types <type>` gives
their fields. A custom type is **one file**: `js/shots/<type>.js` (its styles
in `css/shots/<type>.css`), registered with
`Object.assign(window.ProjectShotFactories ||= {}, { "<type>": … })`;
`pitch motion check` links each new file into index.html. The engine and the vendor
libraries are not on disk for you; read only what you edit (`shots.js`,
`js/shots/*.js`, `direction.md`) and reference everything else through the
tools.

## Build

**One `bash` call, several `pitch` commands.** Everything below that is two
decided steps in a row goes in one call, joined with `&&` — reading the schema
for three sections, checking after a save, listing the lab and reading one
effect. The last run spent six turns on six schema lookups before it had
written a line. Turns are the cost; a batch is free.

**One shot at a time, and the film runs after every one.** The user is
watching the preview; a film that appears all at once at minute nine is a
blank stage for nine minutes. Measured on a real run: the scaffold landed at
5:29, then twelve custom-type files went in before a single shot existed, and
the first frame appeared at 9:05. Every shot you add is a save, and every save
is a film that plays end to end — shorter than the last one, never broken.

1. `pitch motion scaffold` writes index.html and a starter `shots.js` — the brand
   recon measured and a **placeholder opener** built from the site's own h1,
   so there is already a frame on the stage. Replace it with your hook, add
   the stage and the `actors` block and one or two more shots **using
   built-in types only**, and save. `pitch motion check` — it prints the shot-list
   warnings the audit will raise, the plain boundaries among them; fix them
   now. The user should be watching a film inside three or four minutes.
2. Then one lab effect at a time: write its `js/shots/<type>.js` (+ its css),
   put its shot in `shots.js`, **save, `pitch motion check`, and only then start
   the next**. Never write a batch of type files before the shots that use
   them — an unused type is a file the check cannot judge and the user cannot
   see. Every save is a complete evaluating literal.
   Everything lives on the returned timeline — no CSS animation, no bare
   `gsap.to`, no ticker, no `Math.random` — selectors scoped to `el`, optional
   targets guarded, text swaps via `tl.set`. One type per file
   (`js/shots/<type>.js`, `css/shots/<type>.css`): a change to one type is a
   small edit, and a `write` over an existing file past 12KB is refused —
   read the lines you change and `edit` them.
3. Audio, once the **picture is settled** — every shot in, every `dur` you
   intend. Narration and the mix are measured against the cut, so a shot
   retimed afterwards costs the whole pass again (that same run paid for two
   full audio passes, ~2 minutes each). `references/audio.md`. Bed via `pitch motion find-audio`. Narration is
   one read: script (1.9–2.4 words/s) → `pitch motion tts` once (it re-records by
   itself if a take comes back rushed) → `audio.vo` → `pitch motion align` →
   `cue` on every shot → `pitch motion sync --write`. Then `pitch motion cues`,
   one `pitch motion sfx --mode query --event impact,whoosh_deep,…` for every
   event the film needs, a cue sheet written to the budget (~6 signature
   cues per 30s, one per shot), `pitch motion sfx --mode build` (★ marks the
   signature cues the budget counts), `pitch motion mix`.
4. `pitch motion audit`: zero ❌. A ⚠️ is a note: pacing notes name the still
   stretch — answer with a beat or a cut, or keep it and say why in
   direction.md — that closes the note; never a longer shot
   (`references/pacing.md` has the numbers). Then `pitch motion review`: fix every line of its clipped-type
   and off-brand-ground reports, and **look at every sheet** — an empty frame, a colour
   that is not the brand's, a lab placeholder still on screen, an edge
   touched. Fix in `shots.js`, then `pitch motion review --shots <ids>` for what
   you touched — not another audit unless a `dur`, a cue or a beat changed,
   and then `pitch motion audit --shots <ids>` for those shots only: it samples
   their stretch on the same grid, in a quarter of the time.
   Audio-only changes (a breath, a level) and a `direction.md` edit need no
   audit at all. Quote the scorecard, say what the sheets showed, stop.
5. Export only when the user asks for an MP4: `pitch motion audit`,
   `pitch motion render --out <file> --out-res 1920x1080 --fps 60`, `pitch motion verify-duration`.

Length is approximate: the material decides and you report what it came out
at. "Shorter" means cut a shot, never rush a read.

## Edits

A prompt naming a shot edits that shot's entry and keeps its `dur` unless
asked. "That one, but slower" names a lab id: read it whole and retime.
Verify with `pitch motion review --shots <id>`, never a full render.

## When a tool fails

There is no network and no host. Report what failed and what is undone, and
stop. Never hand-write a measurement (`audio/vo-words.json`,
`audio/cues.json`, `recon/brand-tokens.json`), never paste an effect from
memory and call it a lab port, never call a film built when a gate never ran.
