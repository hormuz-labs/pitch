# Pacing — where the numbers come from

**Something new happens on screen at least every ~1.2 seconds, and nothing
ever just sits there.** A shot is an entrance, a second act and an exit —
never an entrance followed by a hold. `motion_audit` measures this.

## The reference

A 37.5s product explainer measured with ffmpeg (scene detection, per-second
frame difference): one hard cut, ~34 distinct on-screen events (one every
~1.1s), no stretch longer than ~1.5s with nothing new, no shot that is an
entrance followed by a hold, a stage layer always drifting, text arriving
word by word with the accent word last and biggest, 3–6 overlapping
elements per beat. A browser window slides in, code types, five error
toasts land in ~2s, the headline assembles word by word on top, the pile
blows away, three lines replace each other every ~1s, the real UI enters
tilted, panels slide in, captions swap over UI that keeps changing,
confetti, a word-by-word payoff, the logo — and the stage keeps drifting
under the end card. Nothing is cut: elements *exit* while the next ones
*enter*. Individual moves are 0.3–0.6s with expo eases; there are simply
many of them. Energy is **density and layering**, not speed.

The failure mode is the opposite film: narration setting the durations
(six lines, six 5-second shots, dead air after each clip), every shot an
entrance then a hold, one element centred in an empty frame. The fix is
one read cut to words (`cue` + `motion_sync`), a second act in every shot,
and a stage.

## What the gate enforces

The limits follow the film's `design` (`designs/chain.md`,
`designs/chapters.md`); a film that names none gets the strict column.

| Rule | chain | chapters | none |
|---|---|---|---|
| Shots | 6–16 | 8–40 | 8–16 |
| Average shot length | ≤ 3.6s | ≤ 3.4s | ≤ 3.4s |
| Plain type beat | ≤ 3.2s | ≤ 4.0s | ≤ 3.2s |
| A `line` with ≥ 3 steps, or a shot posing actors | ≤ 6s | ≤ 6s | ≤ 6s |
| `ui-frame` / demo shot | ≤ 6s | ≤ 6s | ≤ 6s |
| Hook | first shot ≤ 3s | ≤ 3.5s | ≤ 3s |
| Narration | one read, every shot cued, drift −0.35…+0.15s | same | same |
| Longest quiet stretch (drift and ambient off) | ≤ 1.5s | ≤ 1.5s | ≤ 1.5s |
| Events per second | ≥ 0.7 (the references run 2–3) | same | same |
| The design's tells (warnings) | no actors; a third of the boundaries plain cuts; no blur exits | fewer than two chapters; no typed prompt; no flood or scale cut | no design named |
| Both | no `breath` beats; a bare stage outside a chain | | |

Both reference films measured: 33s / 87s, 0 / 22 cuts, 2.3 / 2.5 events per
second, longest still 0.83s, and between the first object and the last never
a frame with nothing moving. The fix for a failing shot is one of: a `line`
step, an actor pose, a beat, a cursor — or cut the shot. Never lengthen.

## Density is required; uniformity is not

Dense films that all cut every 2.5s are one film. Rhythm is decided with the
arc (creative-direction.md Axis 7): a run of three 0.8s words, then a 5s
`ui-frame` where the cursor does three things; a 1.2s stat against a 3s
manifesto line. `motion_audit` warns when every `dur` sits within ±0.45s of
the average — the metronome — and the answer is never to lengthen a shot but
to split one and merge two.
