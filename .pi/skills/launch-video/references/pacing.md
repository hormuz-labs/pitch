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
shot an entrance then a hold, one element centred in an empty frame. The fix
is one read cut to words, a second act in every shot, and a stage.

## What the gate enforces

Naming a `design` is optional. A film that names none is judged by the
general column; `chain` and `chapters` add their own tells.

| Rule | chain | chapters | general |
|---|---|---|---|
| Shots | 6–16 | 8–40 | 4–40 |
| Average shot length | ≤ 3.6s | ≤ 3.4s | ≤ 3.6s |
| Plain type beat | ≤ 6.0s | ≤ 4.0s | ≤ 6.0s |
| A `line` with ≥ 3 steps, or a shot posing actors | ≤ 6s | ≤ 6s | ≤ 6s |
| `ui-frame` / product shot | ≤ 6s | ≤ 6s | ≤ 6s |
| Hook | first shot ≤ 3s | ≤ 3.5s | ≤ 3.5s |
| Narration | one read, every shot cued, drift −0.35…+0.15s | same | same |
| Longest quiet stretch | ≤ 1.5s | ≤ 1.5s | ≤ 1.5s |
| Events per second | ≥ 0.7 (the references run 2–3) | same | same |
| The design's tells (warnings) | no actors; a third of the boundaries plain cuts; no blur exits | fewer than two chapters; no word camera; no flood or scale cut | — |
| All | no `breath` beats; a bare stage outside a chain | | |

Both reference films measured 2.3 and 2.5 events per second, longest still
frame 0.83s, and never a frame with nothing moving. The fix for a failing
shot is a `line` step, an actor pose, a beat or a cursor — or cutting the
shot. Never lengthening it.

## Density is required; uniformity is not

Dense films that all cut every 2.5s are one film. Rhythm belongs to the arc:
a run of three 0.8s words, then a 5s product shot where the cursor does three
things; a 1.2s stat against a 3s manifesto line. `motion_audit` warns when
every `dur` sits within ±0.45s of the average — the metronome — and the
answer is to split one shot and merge two, never to lengthen.
