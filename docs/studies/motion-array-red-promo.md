# Study: red-and-black business promo (40.1 s, 1920×1080, 30 fps)

Reference supplied by the user (`aftereffects/ref/preview.mp4`, a Motion Array template — the
watermark is on screen at 36–37 s). Measured, not estimated: 1 201 frames, per-frame change
scores, and a replica of **our own audit metric** — sampled every 0.25 s at 960×540, every 4th
pixel, tolerance 8/channel, an event at ≥ 0.6 % of the frame — so every density number below is
directly comparable to what `motion_audit` prints. Working frames in `aftereffects/ref/frames/`
and `extra/` (outside the repo).

The user's own summary of why it works: *"same square shape becomes a diamond, then it morphs into
a mobile shape, then it morphs into a mesh… so it all looks like one video."* The measurements
below say the same thing more precisely, and add a second mechanic they named: the line builds
**one word at a time**, so a long shot never reads as a long shot.

## 1. The one structural fact: the transition **is** the next subject

This film has 30 whole-frame turnovers in 40 s (median gap 0.75 s), so it is not a no-cut film like
the LangEase chain. What makes it read as one piece is that almost nothing arrives *new*. The
device that clears the last shot is the thing the next shot is about.

The clearest case, measured at 8 fps from t = 23.6 (`extra/`, and the strip in the working files):

| t | what is on screen |
|---|---|
| 23.6–24.5 | "TO PROMOTE ALL OVER THE WORLD" on the off-white ground; a **black bar wipes left→right**, eating the line |
| 24.6–25.0 | the bar keeps going, then **rotates**: it is edge-on, not flat |
| 25.0–25.4 | it turns in 3D, thickens, and a camera bump appears — the wipe bar was a **phone** all along |
| 25.5–26.5 | the phone lands on a red disc and settles, its screen reading "AND TO TELL PEOPLE WHO YOU ARE" |

A wipe is normally the cheapest transition there is. Here it costs nothing extra and buys the whole
next scene, because the bar and the phone are one object. The viewer never re-orients.

The second case, 8 fps from t = 14.4:

| t | what is on screen |
|---|---|
| 14.5 | a small red **rectangle** drops in, top-centre |
| 14.6–15.2 | it rotates 45° and scales up — square → **diamond** |
| 15.3 | facets appear: it is a 3D **octahedron**, now larger than the frame and cropped by the left edge |
| 15.4–16.0 | "AND DISCOVER" arrives beside it — grey ghost, then accent red, then ink, over three frames |
| 16.0–17.0 | "NEW FEATURES" **adds** below in accent; both hold; black floods |

Note the octahedron is deliberately **cropped off the left edge** at hero scale. Our `motion_review`
currently reads "an edge touched" as a fault; here it is the composition.

## 2. The chain

One red form, restated about eighteen times. Nothing else is ever the subject:

dot → the crossing of a red/black X → a dot travelling a drawn path → cube → cube receding →
pill label → the vertices of a mesh → a disc split by a bar → square → diamond → octahedron →
pen nib → a black wipe bar → **phone** → the disc behind the phone → a panel inside a black frame →
a diamond at the crossing of an X → capsule → a rounded mass rising from below → a full-frame
circle → a toggle.

The palette never moves: one red (`#DF5620` on the cube face), near-black (`#262626`), an off-white ground (`#F1EEED`), one grey. Ground
flips white↔black on the floods and is otherwise flat — no gradient, no glow, no grain.

## 3. The line builds a word at a time

Frame-accurate, from the per-frame change score over the opener:

| t | event |
|---|---|
| 0.055 | "OK, YOU ARE" is there — **fully formed in one frame**, no fade, no typing |
| 0.721 | "A BUSINESS" **adds** on a second line (one frame) |
| 1.488 | "OWNER" adds on a third, in accent red with a rule under it (one frame) |
| 2.221 | the whole block is **replaced** by "YOU HELP PEOPLE" at ~2.5× size; it settles over 0.5 s |
| 3.221 | red floods the frame |

Two things worth copying. Every word lands in a **single frame** — the animation is the
composition settling afterwards, never the letters arriving. And the arrivals are 0.67 s and
0.77 s apart, so a 2.2-second shot contains three events. That is the answer to "a long shot that
does not look long": the shot is long, the reading is paced.

The block also grows **downward from a fixed anchor** rather than re-centring on each add.

## 4. Density — it would pass our audit clean

Measured with the audit's own metric:

| | this film | `motion_audit` |
|---|---|---|
| events | 135 in 39.75 s | — |
| events/s | **3.40** | warns under 0.70 |
| longest still stretch | **1.50 s** | warns over 1.50 s |
| stretches over 1.5 s | **0** | — |

Event sizes: 71 small (< 8 % of frame — a word adding, the dot moving), 34 mid, 30 whole-frame.

**So pacing is not what our films are missing.** This reference sits at nearly 5× our floor and
never trips the quiet rule. A film of ours can hit the same numbers and still read as slides,
because the audit measures *how much* changed between two samples and never asks whether what
arrived came from what was already there.

## 5. Why our films don't do this

The engine can do all of it. `engine/schema.md` has **actors** (one object posed across many
shots, `anchor`, `into`, `hold`, `out: "blur"`, crossing a cut untouched), **`carry`** (a match cut
on one element), `line.steps` with `add` / `replace` (the exact one-frame word arrival above), and
`MorphSVGPlugin` is registered for one shape becoming another.

What is missing is that nothing asks for it:

- `SKILL.md` names "one continuous take where an object is passed from shot to shot" **once**, as
  one of four alternatives, and never mentions `actors`, `carry`, `into` or a morph. The agent
  would have to find them by reading `motion_schema()`, which the skill points at only for
  built-in types and custom types.
- `references/designs/chain.md` — the grammar written in engine fields, from the LangEase
  measurement — was deleted in `68decfcd` ("the design docs go") together with `chapters.md`.
- `lib/design-rules.mjs` checks shot counts, durations, punches, breaths and the stage. **No rule
  looks at what connects two shots.** `chain.md`'s own checklist wanted one — "the audit warns when
  a third of them are plain cuts" — and it was never implemented.

The agent optimises against the gate. The gate has never once asked a shot where its subject came
from.
