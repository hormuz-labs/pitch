# Pacing — where the numbers come from

**Something new happens on screen at least every ~1.2 seconds, and nothing
ever just sits there.** A shot is an entrance, a second act and an exit —
never an entrance followed by a hold. `motion_audit` measures this.

## The reference: a 37.5s product explainer (Replit)

Measured with ffmpeg (scene detection, per-second frame difference):

| | Reference | Our first launch film |
|---|---|---|
| Hard cuts | **1** | 5 |
| Distinct on-screen events | ~34 (one every ~1.1s) | 6 (one every ~5.7s) |
| Longest stretch with nothing new | ~1.5s | 4.75s |
| Shots that are entrance-then-hold | 0 | 6 of 6 |
| Persistent stage layer | warm blur blobs, always drifting | none |
| Text arrival | word by word, accent word last and biggest | whole line, once |
| Layering | 3–6 overlapping elements per beat | 1 element per shot |

What it does: a browser window slides in, code types, five error toasts land
in ~2s, rotated and overlapping, and the headline assembles word by word on
top. The pile blows away; "From now it **WON'T!**" lands with a scale kick.
Three lines replace each other every ~1s. The real UI enters tilted, a prompt
is typed live, panels slide in, captions swap over UI that keeps changing.
Confetti, a word-by-word payoff, then the logo — and the stage keeps drifting
even under the end card. Nothing is cut: elements *exit* while the next ones
*enter*. Individual moves are 0.3–0.6s with expo/back eases; there are simply
many of them. Energy is **density and layering**, not speed.

## Why our film was lazy

- **Narration set the durations, one clip per shot** — six VO lines, six 5–6s
  shots, each TTS clip restarting its intonation with ~1s of dead air after.
  Re-cut as one 31s read with `cue` + `motion_sync`: 15 shots averaging 2.1s,
  every shot landing 0.1–0.2s before its word, no silence over a breath.
- **Every factory was entrance-then-hold**: motion done in 0.5s, then drift.
- **No stage**: one element centred in 1920×1080 of empty space.

## The engine's answer

| Trope | Field |
|---|---|
| Warm drifting stage | `ambient: { kind: "blobs", color: "accent" }` |
| Word-by-word type, accent word last | `word-build`, or `reveal: "words"` + `accent: true` |
| Lines replacing each other | `word-build.lines`, `overlay-type.lines` |
| Pile of toasts blown away | `pile` |
| Notifications stacking | `device-notif.more` |
| Elements leaving as the next arrive | `motion.exit` / `shot.exit` |
| Kick, flash, shake, caption swap | `beats: [{ kind }]` |
| Live UI with a target and a click | `ui-frame` + `focus` + `cursor` |
| Scramble, physics scatter, path fly-in | a custom factory with the registered plugins |

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
