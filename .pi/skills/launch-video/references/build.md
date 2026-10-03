# Build

## Shared pieces first

Before any scene:

- `pitch motion scaffold` writes `index.html` and a starter `shots.js` with the
  brand from recon and a placeholder opener. Replace the opener; never write
  the page by hand.
- Set the film's colours, fonts and format once in `shots.js` from
  `recon/brand-tokens.json`. Extra treatment colours go in `brand.palette`.
- Build any object several scenes share (a 3D model, the carried card, the
  product's mark) once.
- Write the **handoffs** into `direction.md`: for every matched cut, the
  exact box its subject occupies on both sides (x, y, width, height in film
  pixels), or the cut jumps. A morph measures its own ends.

## The engine

Ask `pitch motion schema` for only what you use: no arguments lists the types
and sections; `--types a --types b` gives those types' fields; `--section
"actors,custom shot types"` gives sections. Read the common fields once.

A row's effect becomes a type in the project (`references/effects.md`):
`js/shots/<type>.js`, its styles in `css/shots/<type>.css`, registered with
`Object.assign(window.ProjectShotFactories ||= {}, { "<type>": ... })`.
`pitch motion check` links new files. Place its arrivals on `s.beatTimes` (the
beats inside the shot, written by `pitch motion sync`), never on round seconds.
Every GSAP plugin is loaded (`--section "custom shot types"`).

## Every frame renders the same every time

Export seeks the page frame by frame. So every animated value is a function of
timeline time:

- All animation on the shot's returned timeline; state changes with `tl.set`.
- No timers, `requestAnimationFrame` loops, CSS animations or transitions,
  `Date.now`, or unseeded randomness. A free-running animation or a one-way
  callback breaks seeking.
- Explicit start states, so seeking backward reproduces the frame.
- Repeats count toward duration: `.6D + .3D` with `repeat: 1` ends at `1.2D`.
- Selectors stay scoped to the shot.

## Motion on the timeline

- **Start from rest, settle long.** Leave the ease off: `move`, the default,
  speeds up from rest and settles over the last two thirds. An `.out` ease is
  at full speed on its first frame, so a long travel on it pops; keep
  `expo.out` for short arrivals out of a mask or a blur. Leave on
  `power3.in`; `none` only for a loop. Nothing bounces unless the product does.
- **Build in reading order, on the beat.** The subject, then what it does,
  then its label, each on its own beat. A pulse, kick or shake on an element
  standing still is appear-then-dance, and pulls the eye off the lead.
- **Settle, never stop.** An arrival's tail runs through the read (a long
  `move` over most of the hold) on top of the shot's slow drift: slow
  motion reads, a freeze reads as a stall. Scrambling, flying in and morphing
  time is not reading time.
- **Aim, never guess.** A cursor, arrow or travelling object goes to where its
  target really is: `ShotKit.aim(cursor, button)` measures it (call it before
  any `tl.set` start state). Typed coordinates click beside the button.

## Joins

The stage never cuts, so a join is something elements do. Choose each for what
the viewer should see next:

| The join | Write |
|---|---|
| **becomes**: one thing turns into the next | `morph: { from, to }` on the incoming shot (a pill opens into the card, a word travels into the headline); `to: "ground"` grows a dot into the next scene's ground; inside a shot, `ShotKit.morph` |
| **makes room**: what is there rearranges for the newcomer | `ShotKit.reflow` for a line; a layout's parts tweened to their new places |
| **leaves**: the old pieces go one by one as the new arrive | `exit`, varied from join to join |
| **push**: the camera moves into a part of what is there | a `zoom` beat (another zoom beat pans on), `ui-frame` `cursor.zoom` |
| **flood**: the frame fills and the next scene is born from the colour | `cut: "flood"`, a `flood` beat |
| **stays**: an object outlives several shots | an actor; `hold: true` keeps it past its last pose, so give it an `out` or `into` |
| **match**: a hard cut, same size, direction or subject either side | a plain cut; set both sides from the handoff boxes |

No cut moves a whole shot, and neither may a type: sliding the composition as
one page fails the audit. Stage a transformation: the old idea holds long
enough to read, its supporting copy clears, the object transforms, settles,
then the new idea reveals. Check the frames in between for clipping and
leftover layers.

## Type

- No word just appears: every line arrives through its row's text effect (or
  `line.steps`, `word-build`, `type-wipe`), unlike the shot before it; a line
  built word by word makes room with `ShotKit.reflow`.
- Over a picture, words get a backing, a scrim or a quiet area. Aim for 4.5:1
  contrast on anything that must be read.
- Size for the delivery frame on a phone. Cut words before you shrink them.

## One scene at a time

Save complete shots and run `pitch motion check` after each, so the preview
keeps running. Then look at the scene before the next:
`pitch motion review --shots <id> --per_shot 3`, plus `--times` just before
and after its entry and exit when it morphs or matches. Compare its landing
with the handoff box. Move on when it is right, not when it compiles. Make
targeted edits; reuse schema already in context.

## Imagery

Product detail from the real thing: `pitch motion screenshot --url … --selector
…` crops to the control that matters, `--layers auto` lifts floating pieces.
Generated stills (`pitch motion image`) are for supporting plates and objects
only; generated footage is the generated-video skill. Either is labelled a
concept in `direction.md`, and anything that warps is regenerated or dropped.
