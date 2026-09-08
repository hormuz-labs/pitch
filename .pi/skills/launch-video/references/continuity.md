# Continuity — why a launch film holds the viewer

Two reference films measured frame by frame (`docs/studies/`): a 33s SaaS
launch ad with **no cut at all**, and a 40s promo with thirty whole-frame
turnovers. They read the same way — as one piece — for the same reason:
**almost nothing arrives new.** Density is not what does it. The second film
runs 3.4 events/s on the audit's own metric, five times the floor, and would
still be slides if its shots did not come out of each other.

## The transition is the next subject

Measured at 8 fps from 23.6s in the promo:

| t | on screen |
|---|---|
| 23.6–24.5 | a line on the off-white ground; a black bar wipes left→right through it |
| 24.6–25.0 | the bar keeps going, then **rotates** — it is edge-on, not flat |
| 25.0–25.4 | it turns in 3D, thickens, and a camera bump appears: the wipe bar **is the phone** |
| 25.5–26.5 | the phone lands on a disc, the next line on its screen |

The device that clears the last shot is the thing the next shot is about. The
viewer never re-orients, so every feature reads as the consequence of the last
one. Over 40s one red form is restated eighteen times — dot, cube, pill, the
vertices of a mesh, square, diamond, octahedron, nib, wipe bar, phone, panel,
capsule, circle, toggle — and nothing else is ever the subject.

Those are the reference's shapes. Yours is **the product's object**: the file
it takes, the message it sends, the card it issues, the cursor that does the
work, its mark at the end. Name it in `direction.md` and write its chain as one
line — `words → folder → laptop → phones → bar → check → card → star → logo`
was the no-cut film's. A chain with a gap in it is two films.

## The three joins, in fields

| the reference does | write |
|---|---|
| **transform** — the thing on screen becomes the next thing | an actor with `kind: "shape"` posed `w`/`h`/`r` (bar → pill → disc → card) or a `path` pose (MorphSVG); an `element` actor born `from: "#shot .sel"` and posed on; an actor that lands `into` the next shot's element |
| **push** — the camera moves into a part of what is there | `cut: "zoom"` / `"zoom-out"`, a `zoom` beat, `ui-frame` `cursor.zoom` |
| **carry** — one element travels across the cut to where it sits next | `carry: { from, to }` on the incoming shot; an actor `anchor`ed to a `line` slot then to a `.logo-img` |
| the frame fills, and the next thing is born from the colour | `cut: "flood"`, a `flood` beat |
| the picture leaves, the object stays | `motion.exit: "blur"` under an actor with `hold: true` |

An actor with poses in consecutive shots crosses a `hard` cut untouched —
that is the mechanism. `pitch motion schema --section actors` has every pose
field. `pitch motion check` counts the boundaries with nothing crossing them and
warns past a third; a `punch` is the cut you keep, on a beat, two or three
in a film. A `dissolve` or a `wipe-left` on its own joins nothing.

## The line builds a word at a time

The promo's opener, frame-accurate:

| t | |
|---|---|
| 0.055 | "OK, YOU ARE" — fully formed in **one frame**; no fade, no typing |
| 0.721 | "A BUSINESS" adds below (one frame) |
| 1.488 | "OWNER" adds below, in the accent, ruled (one frame) |
| 2.221 | the block is replaced by "YOU HELP PEOPLE" at ~2.5×; it settles over 0.5s |

Arrivals 0.67s and 0.77s apart; a 2.2s shot holds three events. The word is
never animated — it is there, and the composition settles after it. The
no-cut film measured the same: a word adds sharp in one frame, the line
settles 12 frames. In the engine: `line` with `steps`, one `add` per word
(the engine's add is one frame + a 0.4s settle), the noun last in `accent`,
`replace` for the next thought, `align: "left"` when the block should grow
from a fixed anchor instead of re-centring. That is what a long shot that does
not read as long is made of — never a longer `dur`.

## Rhythm the two share

Bursts of 0.2–0.5s, holds of 0.3–0.8s, whole-frame turnovers every ~0.75s
in the promo; `expo.out` in, `power3.in` out; nothing bounces. A flat ground
that flips between the brand's two grounds on the floods; one accent, one ink,
one pale — no gradient, no glow, no grain, in either film.
