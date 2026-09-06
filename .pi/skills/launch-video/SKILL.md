---
name: launch-video
description: Build a product launch film — promo, teaser, feature announcement, kinetic typography, "Apple-style" or narrated product video — as a shots.js shot list the shared GSAP engine compiles, in one of two measured grammars (the continuous chain, or prompt chapters), its moves found in the effects lab (motion_effects) and ported as project types, previewed live in the studio, cut to one continuous narration read when narrated, and gated by motion_audit. Read this before starting any launch film.
---

# Launch films

A film is a **`shots.js` shot list**. The engine compiles it into DOM plus one
paused GSAP timeline; the studio previews `index.html` live and **reloads it
every time you save `shots.js`**; the user's Export button renders the MP4.
You are the creative director: never ask what effects they want — measure the
brand, choose the design, find the moves in the lab, build, and say what you
made. But the **brief is theirs**: what the film is about, how long, narrated
or not, what it ends on. When the request leaves one of those open and the
answer would change the film, ask before recon (the Brief step below) — one
message, every open question at once, a default beside each — and wait.

## The two designs

Two reference films were measured frame by frame (`references/designs/`).
Every launch film is one of them, decided from the product in step 1:

| | **chain** — `references/designs/chain.md` | **chapters** — `references/designs/chapters.md` |
|---|---|---|
| the film is | one continuous take: an object born from the words, dropped into the product, becoming the next object, until the mark | prompt → product → payoff, repeated: a sentence landed at hero scale and travelled word by word, the product rebuilt and tilted with a cursor acting, a payoff that floods or morphs |
| fits | a product with one object and one job story; few screens; 25–40s; music-only | a suite or an editor with many screens and jobs; 45–90s; voice optional |
| the unit | an `actor` crossing shots | a `chapter` of shots |
| the cuts | none that show: an actor, a `carry`, a `flood` or `exit: "blur"` on every boundary | on a `flood` or on the beat; `zoom` / `zoom-out` between hero and UI scale |
| the type | a `line` of 2–4 words seen by the **word camera**, the noun in `accent`, the object in a `slot` | a `line` landed as a **snap** and read by the word camera; rotators; typing only inside the rebuilt prompt box |
| the stage | bare (`ambient none`), off-white, `motion.exit: "blur"` | white, `aurora` under type, `ambient: false` under product |
| the product | rebuilt screens as `cascade` cards and `ui-frame` `html`; a `device-3d` for the turn | rebuilt screens in tilted `ui-frame` `html`, the field / rows / button each moving |

What both share: the object persists across scale changes, blur is the
grammar for depth and for exits, one or two things on screen, the real
product every moment — **rebuilt, never captured** — the noun in the accent
rather than a weight change, expo-out arrivals and nothing that bounces, a
`breath` before every payoff, and a 180° shutter. Both are made of
**moves**, and the moves live in the **effects lab** (next section). Five or
more distinct moves per film, each chosen for what the beat says. A chapters
film may run a chain inside each chapter. Write `design: "chain" |
"chapters"` at the top of `shots.js`; `motion_audit` judges the film by that
grammar.

## The effects lab — where every move comes from

The lab is 408 motion effects, every Jitter template rebuilt in HTML/CSS/JS on
the same GSAP the engine runs (plus three.js, lottie, SVG filters), each with
its code, a strip of eight frames, and notes on what it does and how it
ports. It is far too much to read, so it is a tool:

- `motion_effects({ query })` — describe **what the beat needs**, in words:
  "a card flipping to reveal a price", "lines colliding and snapping out", "a
  counter rolling up out of a blur", "a button that splits when pressed".
  Semantic search over the notes; 8 hits with the move, the primitives and
  the libraries each uses. Filter with `family` (text, logos, buttons,
  charts, counters, devices, icons, morph, backgrounds, gradients, blur,
  before-and-after, ui-elements, websites, showreels, the-click / the-edit /
  the-prompt / the-route / the-stack / the-track / the-vault …), `moves`
  (`["flip-3d"]`) or `libs` (`["three"]`).
- `motion_effects({ slug })` — one effect whole: the notes (the move, how it
  is built, what to change to make it the product's, how it ports, caveats),
  the source, and the path of its `strip.jpg`. **Look at the strip** before
  you port anything: eight frames tell you in one glance whether the move
  is the one the beat needs.
- No arguments lists the families.

How a lab effect becomes a shot:

1. Query for the beat, not for a name. Read two or three candidates whole.
   Pick by the strip and the `how`, and by what the product earns (a card
   flip for a product with cards, a countdown for a dated launch, a route
   for a product that moves things).
2. Port it as a **project type** in `js/shots.custom.js`
   (`motion_schema({ section: "custom shot types" })`): the effect's DOM
   goes in `mount(el, shot)`, its `fx.timeline({ duration })` becomes the
   `gsap.timeline()` that `animate(el, shot, D)` returns, every time a
   fraction of `D`, every selector scoped to `el`, `fx.rng` →
   `ShotKit.rng`, a `fx.register` canvas or three.js seek → a tween with
   `onUpdate` on the returned timeline. GSAP and its plugins are already
   registered by the scaffold; assets load from the film's own
   `../../assets/`. The notes' `port` line says what does not port directly.
3. **Rebuild the content.** The lab's placeholder copy, colours, images and
   counts are never on screen: the product's own words, `brand` tokens, a
   harvested or rebuilt screen, the real number. Keep the timing and the
   eases — they are the move.
4. Name it: `direction.md`'s moves line and the shot table's `move` column
   cite the lab id (`text/bold-text-snap`), so the user can open the same
   effect in the lab's gallery and say "that one, but slower".

Never iframe or `<script>`-include an effect page in the film; never leave a
lab effect's placeholder text or palette in a shot; never port two effects
that do the same job. The built-in types cover the spine — `line` with the
word camera, `word-build`, `cascade`, `stat-counter`, `icon-marquee`,
`ui-frame`, `device-3d`, `lottie`, `rive` — and a lab effect is for the beat
they cannot show. Which beat wants which family:

| the beat | look in |
|---|---|
| the hook, a claim landing | text, video-titles, morph |
| a feature list, three facts | text (cascade, list), ui-elements |
| a number, traction, a date | counters, charts |
| the product doing its job | ui-elements, buttons, devices, the-click / the-edit / the-prompt / the-route / the-stack / the-track / the-vault (whole rebuilt-product scenes) |
| a picture having a moment | blur, blend-modes, gradients, backgrounds, effects |
| a before/after, a comparison | before-and-after, websites |
| the mark, the close | logos, brand |
| a transition or a reveal | effects, morph, blur |

## Three rules above everything

1. **Brand from evidence, product rebuilt.** Every hex and font comes from
   `motion_recon`; every logo is a harvested file; every screen is
   **rebuilt in DOM** from a harvested screenshot or a mined frame — the
   capture is the reference you study, never the thing on screen. A
   screenshot in a frame is the tell of a template; a rebuilt screen whose
   field expands, whose rows land and whose button splits is a film. Two
   products must give two unmistakable films. Near-black + glow orbs +
   glass + Inter is banned without evidence from the product's own site; so
   is retyping a wordmark.
2. **Never a lazy frame.** Something new happens on screen at least every
   ~1.2s. A `line` changes in steps, an actor is always mid-move, a product
   shot has a dolly and a cursor. `motion_audit` is the judge — no quiet
   stretch > 1.5s, ≥ 0.7 events/s, the design's own shot and length limits —
   and its per-shot table tells you which shot is lazy. Fix it (a step, a
   pose, a beat, a cursor — or cut the shot). Never lengthen. Never argue.
3. **Not the same film twice.** The design, the chain or the chapter table,
   the stage kind, the exit, the rhythm, the hook, the moves, the voice and
   the words are decided for *this* product in `direction.md`, and every
   film has one **signature**: the object only this product could own
   living as an actor across the film, or a lab effect ported and made the
   product's in `js/shots.custom.js`. Copy every AI writes ("Introducing",
   "seamless", "effortless", "say goodbye to", "the future of", "in
   seconds", "supercharge", "unlock") is banned. `motion_audit` warns on the
   tells; `motion_review` shows you the frames.
4. **The first second is a move, and no rings.** The film never opens on a
   caret typing a query; the hook lands as a word camera, a snap, a
   countdown, a plate rippling — a move from the lab. The `ripple` beat
   (rings expanding from a press) is banned; press feedback is the
   control's own state change or a `flood`. `halo` is the CTA's one glow
   and the flood's pre-glow, nothing else.

**Length is approximate.** "A 60-second video" means about a minute; 54s and
67s are the same film. Never stretch a shot, pad the tail, rush the read or
add a shot you do not believe in to hit a number. The material decides the
duration; you report what it came out at. "Shorter" means cut a shot.

## The engine is a tool, not a file

- `motion_schema()` lists the shot types and sections;
  `motion_schema({ types })` gives the exact fields **and the DOM classes**
  each type mounts (for `beats.sel`, `anchor`, `into`); `motion_schema({
  section: "actors" })` for the object across shots, `"design"` for the two
  grammars, `"density layer"` for the stage, exits and beats, `"custom shot
  types"` before the first port. Ask it for what you are writing. Do not
  read `engine/js/*` — it is 80KB you would re-send on every later turn —
  and never edit the engine.
- `motion_scaffold()` writes `index.html` (all GSAP plugins, three.js,
  lottie, `shots.js`, the engine, in the one order that compiles);
  `motion_scaffold({ custom: true })` once `js/shots.custom.js` exists.
  Never write the page by hand.
- `motion_effects` is the lab (above). Do not `ls` or `grep` the effects
  directory: the tool's index is the shortest path to the right one.
- Every `motion_*` tool that needs a page drives the CloakBrowser over CDP.
  There is no Chromium anywhere and `playwright install` is never the answer.

References in this directory, read on demand: `designs/chain.md` and
`designs/chapters.md` (the grammar you chose — mandatory before the shot
list), `creative-direction.md` (the brief), `pacing.md` (why the numbers),
`audio.md` (bed, narration, SFX, mix), `attention-camera.md` (`ui-frame`
focus). References are pattern libraries, never templates; `direction.md`
outranks every example in them.

## Workflow — the user is watching the preview grow

**Brief — settle what only the user can decide, before a single tool runs.**
Read the request, the earlier turns and whatever is already in the
workspace (a dropped recording, a `direction.md` from a previous session).
For each item below: if it is stated, or safely inferable from the request,
write it down; if it is genuinely open **and the choice would change the
film**, it goes in the question. Never guess silently at these — a 30s
music-only teaser and a 75s narrated feature walkthrough are two different
films, and rebuilding is more expensive than asking.

| item | ask when | otherwise |
|---|---|---|
| **the product** — URL, or files if there is no site | no URL, no files, and the name is ambiguous or unknown to you | use what was given |
| **the length** — ~30s teaser, ~60s launch, ~90s walkthrough | not stated and no length-defining phrase ("teaser", "hero video", "full walkthrough") | the phrase decides; name the seconds you took from it |
| **what it covers** — the whole product, one feature, one release | the site or the request shows more than one product, feature or plan and the request does not name which; or "the launch" with no release named and the changelog has several | the request names it; a single-product site with one job is the whole product |
| **narration or music-only** | not stated and the length is ≥ 45s, or the request mentions a script, a voice, or "explain" | a teaser under 40s is music-only; "narrated"/"voiceover"/"script" means a voice |
| **where it ends** — the CTA: the URL, "available now", a waitlist, a date, a price | nothing on the site says what happens next, or the site offers several (free tier vs enterprise, waitlist vs GA) | the site's primary CTA, quoted |
| **the audience** — customers, developers, investors, a keynote crowd | the site sells to two audiences and the copy would differ (a devtool with a marketing page and API docs) | the site's own register |
| **language** of on-screen copy and read | the site is not in English, or the user writes in one language and the site in another | the site's language |

Ask in one message, each question on its own line with the default you
would take in parentheses — "How long? (I'd make it ~60s, the site has
four screens worth showing.)" — then **stop and wait**. Do not run
`motion_recon`, `motion_scaffold`, or write `shots.js` before the answer:
the length picks the design, the scope picks the recon pages, the voice
picks the script. Two to four questions is normal; more than five means you
are asking what recon would tell you.

When they answer, or when they said "you decide", "just make it", or gave
answers once already: take the defaults, and the **first line of your next
reply lists every assumption you took** ("~60s, whole product, music-only,
ends on 'Start free'"). A brief that arrived complete needs no question and
no pause — go straight to recon. Never re-ask a settled item later in the
session; a mid-build change of length or scope is the user's to make, and
is a shot edit, not a restart.

What is never a question: the design, the effects, the moves, the stage,
the colours, the fonts, the exact second count, the music genre, whether to
use a cursor — you decide those from recon, the lab and `direction.md` — and
anything a page on the site already answers (the tagline, the pricing, the
feature names). Asks for **assets** (the SVG logo, a 1080p recording, font
files) are not brief questions: they never block; relay them after the
harvest and keep building.

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
  now a still at `assets/harvested/frames/<clip>/t<time>.jpg` — the
  **reference** you rebuild that screen from (its layout, labels, the
  result it shows), and the texture of a `device-3d` screen. It is never
  the `src` of a `ui-frame`.
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
- **The brief, first**: the answers from the Brief step — product, length,
  scope, voice, CTA, audience, language — each marked *stated*, *inferred
  from …* or *asked*. Every axis below has to agree with it; the length
  band and the scope are the first evidence for the design.
- **Axis 0, the design**: `chain` or `chapters`, with the evidence (one
  object and one job story, or many screens and many jobs). Then read
  `designs/<design>.md` end to end.
- For a chain: **the chain**, written as one line of objects with no gap,
  and which harvested file or mined frame each object is. For chapters:
  **the chapter table** — 6–9 rows of prompt · screen · cursor action ·
  payoff, the payoffs all different.
- The other 9 axes with one line of recon evidence each: stage kind, type,
  motion language, dimensionality, composition, shot formats, arc, audio
  persona, words. **The moves line**: the five or more lab effects this film
  owns — `motion_effects` queried per beat, each cited by id, with the beat
  it serves and why this product earns it — and which are built-in fields
  versus ports into `js/shots.custom.js`. The **devices line**: `device-3d`
  (single or `ring`), `ui-frame` + `layers`, `lottie` / `rive`, actors, a
  transition kind, `render.shutter`, `grade`, `motion_image` — used (which
  shot, what evidence) or not (why). End with the Uniqueness Test: swap
  test, evidence audit, anti-default check, the signature named.

**2. Shot list.** Present a table — `# | id | chapter/object | type | move
(lab id) | dur | copy / rebuilt from | steps · actors · beats | cut |
sound` — then keep going; do not wait for approval unless the user is
actively replying.
- One idea per shot, 2–4 words on a `line`, ≤ 8 anywhere. A chain film
  6–16 shots, 25–40s; a chapters film 8–40 shots, 45–90s. A `line` with
  steps or a shot posing actors is a scene and may run to 6s; a plain type
  beat ≤ 4s in a chapters film (≤ 6s in a chain, where a line is a
  scene); a `ui-frame` ≤ 6s.
- Every boundary is decided by the design: an actor pose across it, a
  `carry`, `cut: "flood"`, `zoom` / `zoom-out`, a blur exit — or, in a
  chapters film, a hard cut on the beat. Never a dissolve between two type
  beats.
- Every product shot names the reference it is rebuilt from (a harvested
  file or a mined frame by time stamp), what the rebuild keeps (the field,
  the rows, the button, the result), which part moves and how (the move),
  its `tilt`/`aura`, and what the cursor does.
- The hook is a move: the first shot's `move` column is never "typing".
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
  parts with `tone`, `rotate` for alternatives, a `slot` where an actor
  sits — and the **word camera**: `zoom` beats on `.lw:nth-child(n)`, one
  per word, the noun last, so the line is travelled rather than read. Never
  `typing` at hero scale; a typed prompt is a prompt box inside a rebuilt
  `ui-frame`, mid-film.
- An **actor** is any object that lives through a boundary: declare it once
  (`image`, `text`, `shape`, or `element` born from a shot's element) and
  pose it in every shot it passes — `anchor` on a slot or a mark, `into`
  when it lands as an element, `w`/`h`/`r`/`path` poses for a morph chain,
  `blur` for depth, `out` when it leaves.
- The product: `ui-frame` with **`html`** — the screen rebuilt from its
  reference in the film's type and palette, the product's real labels and
  content, its moving part (the field expanding, the rows landing, the
  button splitting, the toggle snapping, the result arriving) animated in
  a project type or by an actor landing `into` it — with `tilt`, `aura`, a
  `focus` or a `cursor` (`hand: true` at hero scale, `zoom` when the
  clicked thing becomes the subject, `cursors` for collaborators). Never
  `src` on a `ui-frame`; `motion_audit` flags it. `device-3d` with a
  decided `device` and `turn` (the one place a mined frame is still the
  screen texture), or `ring` with five frames; `cascade` for cards and
  rows; `lottie` / `rive` for the brand's own motion.
- Beats for what the types do not: `flood` inside a shot, `zoom` into an
  element or a word, `blurout`, `breath` before a payoff, `halo` under the
  CTA once. Never `ripple`; a press is the control changing state.
- The signature and every lab move are project types in
  `js/shots.custom.js`, ported as the lab section says, then
  `motion_scaffold({ custom: true })`. Build them early — the first port
  proves the pipeline. Seven invariants: everything on the returned
  timeline (no CSS animation, no bare `gsap.to`, no ticker, no
  `Math.random` — `rng(seed)`); selectors scoped to `el`; no infinite
  opacity/glow loops; no `filter: blur()` on background-clipped text; guard
  optional targets; text swaps via `tl.set`; time everything as fractions
  of `D`.

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
no word camera or no flood, no breaths, no actors, a screenshot as the
product, a ripple). Then `motion_review({})`
and **look at every sheet**: clipped or overflowing text, words over a busy
image, an actor covering what it should sit beside, an empty frame, three
identical frames, a colour or face not in `recon/brand-tokens.md`, a
rebuilt screen that never changes, a lab effect's placeholder still on
screen, anything that looks captured. Fix in `shots.js`, `motion_review({
shots })` for the ones you touched, `motion_audit` again if any `dur`
moved. Two rounds unless a defect is still visible. Quote the scorecard
line and say what the sheets showed and what you fixed, then stop — the
preview reloads on its own.

**6. Export — only when the user asks for an MP4 in chat.** `motion_audit`,
then `motion_render({ out: "renders/launch-<res>.mp4", out_res, fps: 60 })`
— it applies the film's `render` and `grade` blocks — then
`motion_verify_duration`. Never concatenate segments, screencast, or reach
for Remotion/React/AI video.

## Shot edits (a scoped prompt naming a shot or elements)

Edit only that shot's entry in `shots.js` — its fields, `bg`, `cut`, `type`,
its `steps`, its actor poses — and keep its `dur` unless asked, because
every later shot and the mix move with it. A look with no field is a lab
query and a port in `js/shots.custom.js`; "that one, but slower" names a lab
id — `motion_effects({ slug })` and retime the port. Verify with
`motion_review({ shots: [id] })` and, if `dur` moved, `motion_audit`; never
full-render.
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
fabricated result every later tool will trust. If `motion_effects` fails,
say so and build from the engine's types; never paste an effect from memory
and call it a lab port. Never call the film built when a gate never ran:
"the audio is done; `motion_check` could not run" is a useful report, "I
built the 60-second video" is not. If you finish the film without a step
the user asked for — a music-only cut when they asked for narration — the
first line of your summary says so.

## Before you stop

- The brief was settled before recon: every open item that would change the
  film was asked in one message, or the assumption taken is in the first
  line of the reply; the film is the length band, scope, voice and CTA the
  user chose, and `direction.md` records which were stated, inferred or
  asked.
- `direction.md` names the design with evidence, and the chain (no gap) or
  the chapter table (6–9 rows, payoffs all different); the 9 axes cite
  `recon/brand-tokens.md`; the devices line answers every device; the moves
  line names ≥ 5 lab effects by id with their beats; the signature is
  named; fonts self-hosted; no banned phrase on screen or in the read.
- `recon/assets.md` has the product model and "what the landing page fails
  to show", and the film shows it; the harvest's frame sheets were looked
  at and the asks were relayed in the first reply.
- `shots.js` carries `design`; every object that crosses a boundary is an
  actor; every product shot is a rebuilt screen (`html`, never `src`) with
  a part that moves, a cursor, a focus or a dolly; the first shot is a move,
  not a caret; no `ripple` beat anywhere; `breath` beats before the
  payoffs; the mark is a harvested file and the last thing on screen.
- Every lab port in `js/shots.custom.js` carries the product's own content
  and the lab's timing; its id is in the shot table; the strip was looked
  at before the port.
- Built progressively with `motion_check` clean after each save.
- Narration is one read in `audio.vo`, aligned, every shot cued, synced —
  no per-shot clips. Bed named; mix gate passed, ≥ 1s past `__DURATION()`;
  SFX built with no warnings.
- `motion_audit`: zero ❌, no shot under 1 ev/s, no design ⚠️ left
  unanswered. `motion_review` sheets seen: no clipped text, overlap or empty
  frame. No MP4 unless asked.
