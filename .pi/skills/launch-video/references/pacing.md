# Pacing — where the numbers come from

**Something new happens on screen at least every ~1.2 seconds, and nothing
ever just sits there.** A shot is an entrance, a second act and an exit —
never an entrance followed by a hold. `motion_audit` measures this.

## The reference

A 37.5s product explainer, measured with scene detection and per-second frame
difference: one hard cut, ~34 distinct on-screen events, no stretch longer
than ~1.5s with nothing new, a stage layer always drifting, text arriving word
by word with the accent word last, 3–6 overlapping elements per beat.
Individual moves are 0.3–0.6s with expo eases; there are simply many of them.
Energy is **density and layering**, not speed.

The failure mode is the opposite film: narration setting the durations, every
shot an entrance then a hold, a whole desktop where one control should be.
The fix is one read cut to words, a second act in every shot, and a stage —
planned in the shot table, not discovered by the gate. A lab effect ported
whole brings its own acts and its own composition; nothing is added to it.

## What the gate says

The rows marked *note* are the reference films' numbers, said as a ⚠️: answer
them with a beat or a cut, or keep the hold and say why in direction.md. A lab
effect ported whole keeps its timing. Everything else is a ❌.

| Rule | Limit |
|---|---|
| Shots | 4–40 |
| Average shot length | ≤ 3.6s |
| Any one shot | ≤ 6s |
| Hook | first shot ≤ 3.5s |
| Narration | one read, every shot cued, drift −0.35…+0.15s |
| Longest quiet stretch | ≤ 1.5s — *note* |
| Events per second | ≥ 0.7 (the references run 2–3) — *note* |
| Fails | a caret typing as the opener; a `ripple` beat |
| Warnings, while building (`motion_check`) | a built-in type over 1.5s with nothing after its entrance (a project type is its own acts and is not judged); `word-cut` / `type-wipe` / `color-punch` / `type-field` / `overlay-type` with no `lab` port behind it; a whole screen in a browser frame with no `focus`, `cursor.zoom` or layers; a still screenshot as the product |
| Warnings, at the gate | no `breath` beats; no `punch` cuts; a bare stage with no actors |
| Boundaries (`motion_check` and the gate) | over a third of the cuts with nothing crossing them — no actor on both sides, no `carry`, no `flood` or `zoom`. Density is not continuity: a reference measured at 3.4 events/s reads as one piece because the wipe *is* the next subject (`continuity.md`) |
| Clipped type (`motion_review`) | hero type measured against its mask and the stage edge at every frame: a run cut at the settled frame, or bigger than its mask mid-move (a snap scaled past its row), is listed with the fix |

Both reference films measured 2.3 and 2.5 events per second, longest still
frame 0.83s, and never a frame with nothing moving. The answer to a pacing
note is a `line` step, an actor pose, a beat or a cursor — or cutting the
shot. Never lengthening it.

## Density is required; uniformity is not

Dense films that all cut every 2.5s are one film. Rhythm belongs to the arc:
a run of three 0.8s words, then a 5s product shot where the cursor does three
things; a 1.2s stat against a 3s manifesto line. `motion_audit` warns when
every `dur` sits within ±0.45s of the average — the metronome — and the
answer is to split one shot and merge two, never to lengthen.
