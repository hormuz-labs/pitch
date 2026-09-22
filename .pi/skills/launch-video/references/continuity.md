# Continuity — connecting scenes

Continuity is the viewer understanding why the next scene follows this one.
Build it through the sequence of ideas, consistent visual language, matched
framing or motion, and sound that carries across a cut. A question followed
by its answer or a feature followed by its result can connect with a clean
cut. Neither a persistent object nor a particular transition is required.

Two reference films measured frame by frame use object
handoffs especially well: a 33s SaaS launch ad with no cut and a 40s promo
with thirty whole-frame turnovers. These are examples of one approach,
not a requirement that every launch film keep a shape on screen.

## Make transformation a useful part of the film

Consider shape/object transformations when they explain a connection instead
of defaulting every beat to another card entrance. Start with the
product's mechanism: an input becomes an output, a selection becomes a detail,
or scattered items resolve into one organized result. Choose the connection
in `direction.md`; if a morph serves it, study `pitch effects morph list --limit 8` and read the
chosen source before adapting it. A film can mix transformations and clean
cuts; do not morph unrelated objects just to add motion.

The runtime already loads **MorphSVGPlugin**, **DrawSVGPlugin** and GSAP.
For simple geometry, animate width, height, corner radius, position and rotation
to turn a bar into a pill or a panel into its next state. For an actual SVG
silhouette change, use a shape actor's `path` pose (see
`pitch motion schema --section actors`) or a bespoke factory with MorphSVG on
the shot's GSAP timeline. Use DrawSVG for a traced reveal, not as a substitute
for changing shape. Fetch the applicable schema or lab source rather than
inventing pose fields. Keep all animation on the seekable timeline; no timers
or free-running animations.

Stage the handoff: hold the old idea long enough to read, clear its supporting
copy, transform the focal object, then settle and reveal the new idea. The
object carries the viewer's eye to the next focus. Do not leave duplicate
source and destination objects or old labels competing after the landing.
Check intermediate frames as well as both endpoints for clipping, unexpected
path twisting and leftover layers. Use explicit initial states so seeking
backward reproduces the same transformation.

## The transition is the next subject

Measured at 8 fps from 23.6s in the promo:

| t | on screen |
|---|---|
| 23.6–24.5 | a line on the off-white ground; a black bar wipes left→right through it |
| 24.6–25.0 | the bar keeps going, then **rotates** — it is edge-on, not flat |
| 25.0–25.4 | it turns in 3D, thickens, and a camera bump appears: the wipe bar **is the phone** |
| 25.5–26.5 | the phone lands on a disc, the next line on its screen |

The device that clears the last shot is the thing the next shot is about.
Over 40s one red form is restated eighteen times — dot, cube, pill, the
vertices of a mesh, square, diamond, octahedron, nib, wipe bar, phone, panel,
capsule, circle, toggle. Each transformation gives it a new role in the
composition. It is not an extra dot floating above otherwise unrelated scenes.

When an object handoff fits, use something the product actually works with:
its file, message, card, cursor or mark. Describe that handoff in `direction.md`,
including where the object leaves or lands. A motif can disappear and return
later; a chapter can introduce a new subject. Do not invent an ornament to
fill a gap in an object chain.

## Optional object handoffs, in fields

| the reference does | write |
|---|---|
| **transform** — the thing on screen becomes the next thing | an actor with `kind: "shape"` posed `w`/`h`/`r` (bar → pill → disc → card) or a `path` pose (MorphSVG); an `element` actor born `from: "#shot .sel"` and posed on; an actor that lands `into` the next shot's element |
| **push** — the camera moves into a part of what is there | `cut: "zoom"` / `"zoom-out"`, a `zoom` beat, `ui-frame` `cursor.zoom` |
| **carry** — one element travels across the cut to where it sits next | `carry: { from, to }` on the incoming shot; an actor `anchor`ed to a `line` slot then to a `.logo-img` |
| the frame fills, and the next thing is born from the colour | `cut: "flood"`, a `flood` beat |
| the picture leaves, the object stays | `motion.exit: "blur"` under an actor with `hold: true` |

An actor with poses in consecutive shots crosses a `hard` cut untouched.
`pitch motion schema --section actors` has every pose field. Its layer sits
above the scenes: `hold: true` keeps it visible after its last pose, including
later scenes that do not name it. Prefer an explicit `out` or `into` when its
job ends. A dot, line or shape whose only job is to remain visible is not an
object handoff; leave it out.

The checker has no minimum number of actor-linked cuts. Pick hard cuts,
dissolves, wipes, punches or object handoffs for what the viewer should see
next, then review the actual transition and composition.

## Case study: a line built in phrases

The promo's opener, frame-accurate:

| t | |
|---|---|
| 0.055 | "OK, YOU ARE" — fully formed in **one frame**; no fade, no typing |
| 0.721 | "A BUSINESS" adds below (one frame) |
| 1.488 | "OWNER" adds below, in the accent, ruled (one frame) |
| 2.221 | the block is replaced by "YOU HELP PEOPLE" at ~2.5×; it settles over 0.5s |

These arrivals are 0.67s and 0.77s apart. The composition settles after each
phrase appears. `line.steps` with `add` and `replace` can implement this
technique; `align: "left"` grows from a fixed anchor. Use it when the sentence
benefits from staged reading. Whole-sentence reveals, static typography and
other rhythms are equally valid. The measured intervals and accent placement
belong to this reference, not to every line in a launch film.

## Reference-specific rhythm and finish

Bursts of 0.2–0.5s, holds of 0.3–0.8s, whole-frame turnovers every ~0.75s
in the promo; `expo.out` in, `power3.in` out; nothing bounces. A flat ground
that flips between the brand's two grounds on the floods; one accent, one ink,
one pale. These observations describe the references' style, not a palette,
easing or finish requirement. Choose those for the current treatment.
