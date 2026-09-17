---
name: launch-video
description: Direct and build a product launch film — promo, teaser, feature announcement, kinetic typography, narrated product video — with a product-specific visual concept and a shots.js timeline. Use built-ins, bespoke animation, or adapted effects as the treatment needs; preview live and verify with pitch motion audit and review. Read this before starting any launch film.
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
   - `voice` — Music only · Narrated — when that choice materially changes
     the story and the user has not settled it. Length alone does not decide.

   Then **end your turn** and wait. Never ask about the look, the moves, the
   colours, the fonts or the music: those are yours.

2. **After recon, before `direction.md`** — what the film is about. A product
   has more in it than 30 seconds can hold, and now you have seen it: offer
   its real features, in its own words off its own pages, as a `multi: true`
   question, plus the ending (Download · Sign up · Just the mark). Three or
   four options, drawn from what recon actually found — never a generic list.

Ask only about consequential choices the brief leaves open. Skip every choice
the user already settled or delegated to you; a complete brief needs no questions.

Both rounds can be one call when the first actionable request already gave you
the product (a URL you have reconned, or files in the workspace). "You decide"
means take your own first option for each, say so in a line, and get on with it.

Do not ask a third time, do not ask anything you can answer by reading the
site or the shelf, and never let a question stall the build once it is
answered.

### What each kind actually changes

The answer changes what carries the story. These are starting points, not
templates or required shot types:

| kind | what carries the story | decisions to make |
|---|---|---|
| Cinematic | imagery, a situation, a physical object, light or atmosphere | what the viewer discovers; framing, camera and moments of stillness |
| Product walkthrough | real product actions and their consequences | what to demonstrate, where attention goes, how much context stays visible |
| 3D render | an object, material or spatial process | geometry, lighting, camera path, scale and how the object changes |
| Teaser | one reveal or unanswered question | what to conceal, when to reveal it, whether words are needed |
| Feature announcement | a useful change made visible | the before/after, evidence and payoff |
| Kinetic typography | language and its visual form | typographic composition, reading rhythm, movement or deliberate stillness |

A kind does not prescribe a palette, an effect family, a cut rate or a text
entrance. A cinematic brief can be quiet; a teaser can be entirely an object.

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
brand font is a system stack — the shared assets are not the brand. Preserve
the product's identity and distinguish measured brand facts from your creative
choices. Recon is evidence about the product, not a complete art direction.
Look at supplied imagery and visual references as well as CSS tokens.
`pitch motion image` can make a still, object or illustration for the treatment.
For footage with no real source, read `generated-video` before generating it;
never invent product UI. Never stall for an asset — say once what would help
and keep building.

## Make it this product's film

**Choose a visual concept before browsing effects.** When the user has not
supplied a treatment, consider two genuinely different ways to tell this
product's story — different material, framing or narrative device, not two
palettes on the same sequence. Pick the stronger one yourself. This is a short
creative decision, not extra mockups or an approval round.

Write `direction.md`, briefly:

- **Idea and audience:** what the viewer should understand or feel, and the
  product fact that makes the idea specific. Note why this treatment won.
- **Visual system:** the dominant material (product UI, photography, objects,
  illustration, type, spatial geometry, or a deliberate mix); composition,
  scale, type hierarchy, palette, light and finish. Separate recon evidence
  from authored choices. Describe frames, not just adjectives like "premium".
- **Arc and rhythm:** the hook, development and payoff; what moves, what holds,
  where attention shifts, and the role of sound. Choose durations for those
  events and reading time. A held frame, a long take and a hard cut are valid.
- **Connections and signature:** how adjacent scenes relate, and how the
  product's mechanism shapes the film beyond its logo, colours and copy.

Then the shot table:
`# | id | subject/composition | type | action or hold | source (lab id if used) | dur | copy | cut/connection | sound`.
Present it and keep building; do not wait for approval. If changing the logo
and nouns would make the treatment fit any competitor, sharpen the concept
before writing more shots. Do not force every film into hook → feature cards
→ stat → logo, or add variation unrelated to the story.

## Continuity comes from the sequence

Each scene should follow the last in meaning, motion, composition or sound.
A question can cut to its answer, a feature to its result, a wide view to a
detail; matched framing, movement, typography, colour and an audio bridge
can carry the connection. A clean cut is a valid choice. There is no quota
of objects crossing cuts, and a film does not need a persistent actor.

An object handoff is one option (`references/continuity.md`): a product card
becomes the next shot's subject, or a cursor completes an action across a
cut. Use an **actor**, `carry`, `flood` or `zoom` when that specific handoff
helps the story. Give a shared actor a visible job and an exit or landing
(`out` / `into`). `hold: true` deliberately keeps it visible after its last
pose; use it only when that continued presence belongs in the composition.

Do not add a dot, line, orb or other floating shape merely to signal
continuity. Moving the same decoration around every scene does not connect
their ideas. A recurring motif may leave and return; it need not remain on
screen.

Text may arrive whole, build word by word, sit within an image, change layout,
or remain still. Use `line.steps` when paced reading serves the idea; choose
the interval and emphasis for that sentence. There is no universal accented
noun, easing curve, three-act shot pattern or entrance/exit requirement.

`pitch motion audit` reports pixel-change density, not storytelling quality.
Its default quiet-stretch and event-rate thresholds are diagnostics; choose
`--max_quiet` and `--min_eps` for the planned rhythm when appropriate. Review
a note against the treatment. Keep an intentional hold; fix an accidental
stall. Never add pulses, shakes, glows or cuts merely to raise a counter.
Check reading time at delivery size; crop, focus or rebuild a UI detail when
it cannot be read. An overview is valid when the whole interface is the point.

**Design at the film's scale from the first shot.** The stage is 1920×1080;
at a 960px-wide preview, 16px source text displays at only 8px. Choose the
subject's frame occupancy and essential text size before writing CSS. Enlarge
or isolate the actual checkout amount/control rather than reproducing a whole
phone at web-page font sizes. Apply a scale correction to upcoming shots too,
instead of rediscovering the same undersized hierarchy after every review.

## Use effects to serve the treatment

The effects lab contains hundreds of working GSAP, three.js, lottie and SVG
examples, each with code, frames and implementation notes. Built-in types,
bespoke factories and lab adaptations are equally valid. A simple reveal is
enough when the composition and story call for one; no lab-use quota applies.

- `pitch effects list` — the whole shelf, one line each: id, length, the
  libraries and the move it makes. Browse after choosing the treatment when
  you need to explore an implementation. Narrow it with
  `--moves flip-3d`, `--libs three`, or by family: `pitch effects text list`
  (a family is a subcommand; `pitch effects --help` lists them).
- `pitch effects search a card flipping to reveal a price` — the same shelf
  scored against words, when you know the move but not where it lives.
- `pitch effects show <id>` — a selected effect whole. **Look at the strip**
  before adapting it. Example ids in tool documentation are syntax examples,
  not recommended effects.

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
`pitch motion schema --section "custom shot types"` has the shape. Understand
the source's visual mechanism, then adapt its composition, count, typography,
material, timing and exit to the treatment. Preserve it whole only when that
is the right composition or the user requested a faithful reproduction.
The source notes describe that effect, not rules for the film. Put
`lab: "<id>"` on a shot genuinely derived from it, and note substantial changes
in the table; bespoke shots need no lab annotation.

`pitch motion schema` lists the built-in types, `pitch motion schema --types <type>` gives
their fields. A custom type is **one file**: `js/shots/<type>.js` (its styles
in `css/shots/<type>.css`), registered with
`Object.assign(window.ProjectShotFactories ||= {}, { "<type>": … })`;
`pitch motion check` links each new file into index.html. The engine and the vendor
libraries are not on disk for you; read only what you edit (`shots.js`,
`js/shots/*.js`, `direction.md`) and reference everything else through the
tools.

## Build

**Batch decided commands with `&&`.** Each model round trip re-reads the growing
conversation. Request only the schema needed for the chosen treatment; do not
load actors, materials or built-in types merely because an example lists them.
Reuse documentation already in context rather than fetching it again.

Use the syntax here directly; ask for help only when a needed option is
unknown. Read `common shot fields` once; get needed sections and types together,
e.g. `pitch motion schema --section "common shot fields" --types line,logo-cta`
for a film using those types. Custom factories need `--section "custom shot types"`.
Import a listed bed with `pitch motion find-audio --src "<listed path>" --copy_to audio/music.mp3`;
probe that workspace-relative path. Never probe an absolute library path.

**One shot at a time, and the film runs after every one.** Save and compile
each added shot so the preview grows while the user watches. Use `check`
during construction; early `review` is for a specific visual uncertainty,
not a mandatory review/read/polish loop after every shot. Review the complete
sequence together before making a batch of visual corrections.

1. `pitch motion scaffold` writes index.html and a starter `shots.js` — the brand
   recon measured and a **placeholder opener** built from the site's own h1,
   so there is already a frame on the stage. It is a loading placeholder,
   not a proposed hook or style. Replace it with the treatment's first shot,
   built-in or custom, and save. The engine adds no drift or exit by default;
   choose them explicitly only where wanted (`drift: true`, `exit`, or a
   film-wide `motion` setting). `pitch motion check` verifies the build.
2. Then one shot at a time: when custom, write its `js/shots/<type>.js` (+ its css),
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
   Include repeats and stagger in the time budget: at `.6*D`, a `.3*D` tween
   with `repeat: 1` ends at `1.2*D`, even with `yoyo: true`.
3. If narrated, record and sync before the visual gate: script
   (1.9–2.4 words/s) → `pitch motion tts` once (it prints the file it wrote)
   → `audio.vo` → `pitch motion align` →
   `cue` on every shot → `pitch motion sync --write` → `pitch motion check`.
   Music-only films skip this step.
4. Once all shots are present, **one full** `pitch motion audit`, followed by
   **one full** `pitch motion review`. Zero ❌. A ⚠️ is a note: pacing notes name the still
   stretch — review it against the planned rhythm; an intentional hold needs
   no animation added. `references/pacing.md` explains the measurement.
   In `pitch motion review`, fix accidental clipping and missing content,
   resolve unplanned palette differences, and **look at every sheet** against
   direction.md. Intentional image crops and authored treatment colours are
   valid; declare the latter in `brand.palette`. Check that source placeholders
   are gone and the film has the chosen composition, not a series of reskinned
   templates. Fix in `shots.js`, then `pitch motion review --shots <ids>` for what
   you touched — not another audit unless a `dur`, a cue or a beat changed,
   and then `pitch motion audit --shots <ids>` for those shots only: it samples
   their stretch on the same grid, in a quarter of the time.
   Collect the complete report, fix all affected shots in one batch, then run
   one scoped review for that batch. Do not check every CSS/JS edit separately
   or run a final full-film pass after scoped fixes already passed. Unchanged
   successful checks reuse their reports and frames. Harmless factory squeezes
   below 1.1× are ignored; do not hunt for an unnamed overrun.
5. Finish sound against the settled picture (`references/audio.md`). Read the
   audio reference before querying/building. `pitch motion check` already wrote
   the real labels to `audio/cues.json`; no separate cues call is needed.
   Query needed events once with a small shortlist (`--limit 3` per event),
   write the cue sheet as an object with a `cues` array and duration limits for
   sustained sounds, build once, then mix. Music-only uses `--music_only`;
   music leads, and `--sfx_db` controls its supporting effects. The mix names
   any local balance failure: fix that cue or trim, then re-mix.
   Audio-only changes (a breath, a level) and a `direction.md` edit need no
   visual audit. The preview and Export use `audio/mix.wav` automatically;
   do not search for or add audio wiring in index.html or shots.js. Once the
   mix and picture pass, quote the checks briefly, name the bed, and stop.
6. Export only when the user asks for an MP4: reuse the passing audit for the
   unchanged cut, then
   `pitch motion render --out <file> --out-res 1920x1080 --fps 60`, `pitch motion verify-duration`.

Length is approximate: the material decides and you report what it came out
at. To shorten, trim completed actions or remove a beat while preserving
the story and reading time.

## Edits

A prompt naming a shot edits that shot's entry and keeps its `dur` unless
asked. "That one, but slower" names a lab id: read it whole and retime.
Verify with `pitch motion review --shots <id>`, never a full render.

## When a tool fails

Correct argument/schema errors using the returned help. Fix validation
failures in a batch and re-run the affected gate. If a host service or
dependency is unavailable, report what failed and what is undone; stop rather
than attempting to provision it. Never hand-write a measurement (`audio/vo-words.json`,
`audio/cues.json`, `recon/brand-tokens.json`), never paste an effect from
memory and call it a lab port, never call a film built when a gate never ran.
