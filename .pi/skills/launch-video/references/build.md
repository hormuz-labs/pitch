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
- Write the **handoffs** into `direction.md`: for every carried object or
  matched cut, the exact box it occupies on both sides (x, y, width, height in
  film pixels). A carried object lands on the same pixels either side of the
  cut, or the cut jumps.

## The engine

Ask `pitch motion schema` for only what you use: no arguments lists the types
and sections; `--types a --types b` gives those types' fields; `--section
"actors,custom shot types"` gives sections. Read the common fields once.

When no built-in type shows a moment well, write one in the project:
`js/shots/<type>.js`, its styles in `css/shots/<type>.css`, registered with
`Object.assign(window.ProjectShotFactories ||= {}, { "<type>": ... })`.
`pitch motion check` links new files. The whole GSAP plugin set is loaded:
Flip for an element moving between layouts, MorphSVG for one shape becoming
another, DrawSVG for a traced stroke, MotionPath for travel on a curve.

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

- **Arrive decelerating, leave accelerating.** An `.out` ease to land
  (`expo.out`, `power3.out`), an `.in` ease to leave (`power2.in`,
  `power3.in`), `none` only for a continuous loop. Nothing bounces unless the
  product itself does.
- **Overlap.** Start the secondary moves a fraction after the lead, inside its
  movement, never after it finishes. A frame where everything starts together
  or stops together reads as a slide.
- **Hold to read, then go.** A state is fully formed and still while it is
  read; scrambling, flying-in and morphing time is not reading time.
- **No decoration.** A pulse, shake, flash or kick on a label that changed
  nothing distracts from the lead. Add motion that shows something happening.

## Joins

Choose each join for what the viewer should see next. The engine's fields:

| The join | Write |
|---|---|
| **becomes**: the thing on screen turns into the next thing | an actor with `kind: "shape"` posed `w`/`h`/`r` (bar → pill → disc → card), or a `path` pose (MorphSVG); an `element` actor born `from: "#shot .sel"` and posed on; an actor that lands `into` the next shot's element |
| **push**: the camera moves into a part of what is there | `cut: "zoom"` / `"zoom-out"`, a `zoom` beat, `ui-frame` `cursor.zoom` |
| **carry**: one element travels across the cut to where it sits next | `carry: { from, to }` on the incoming shot; an actor `anchor`ed to a slot, then to its next place |
| **flood**: the frame fills and the next scene is born from the colour | `cut: "flood"`, a `flood` beat |
| **stays**: the picture leaves, the object remains | `motion.exit: "blur"` under an actor with `hold: true` |
| **match**: a hard cut, same size, direction or subject either side | a plain cut; set both sides from the handoff boxes |

An actor posed in consecutive shots crosses a cut untouched; `hold: true` keeps
it after its last pose, so give it an `out` or `into` when its job ends. Every
pose field is in `--section actors`.

Stage a transformation: the old idea holds long enough to read, its supporting
copy clears, the object transforms, settles, then the new idea reveals. Leave
no duplicate source and destination objects, or old labels, after the landing.
Check the frames in between for clipping, twisted paths and leftover layers.

## Type

- A line can build in phrases, each fully formed in one frame; `line.steps`
  with `add` and `replace` does this. Whole lines and still type are as valid.
- Over a picture, words get a backing, a scrim or a quiet area. Aim for 4.5:1
  contrast on anything that must be read.
- Text that must move past other text fades out and back in at its
  destination rather than travelling through.
- Size for the delivery frame on a phone. Cut words before you shrink them.

## One scene at a time

Save complete shots and run `pitch motion check` after each, so the preview
keeps running. Then look at the scene before the next:
`pitch motion review --shots <id> --per_shot 3`, plus `--times` just before
and after its entry and exit when it carries or matches. Compare its landing
with the handoff box. Move on when it is right, not when it compiles.

## Imagery

Product detail from the real thing: `pitch motion screenshot --url … --selector
…` crops to the control that matters, `--layers auto` lifts floating pieces.
Generated stills (`pitch motion image`) are for supporting plates and objects
only; generated footage is the generated-video skill. Either is labelled a
concept in `direction.md`, and anything that warps is regenerated or dropped.

## Working habits

Make targeted edits instead of rewriting files. Join decided commands with `&&`
in one shell call; reuse schema already in context. For invalid arguments,
follow the returned help. If a host service is unavailable, report what failed;
never hand-write a measurement or claim a check passed.
