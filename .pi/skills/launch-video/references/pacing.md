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

| Rule | Limit |
|---|---|
| Shots | 8–16 |
| Average shot length | ≤ 3.4s (aim 1.5–2.8) |
| Type / brand beat | ≤ 3.2s |
| `ui-frame` | ≤ 6s, with a `focus` or `cursor` |
| Narration | one read, every shot cued, drift −0.35…+0.15s |
| Longest quiet stretch (drift and ambient off) | ≤ 1.5s |
| Events per second | ≥ 0.7 (good films run 2–4) |
| Hook | first shot ≤ 3s |

The fix for a failing shot is one of: a beat, a line, `more`, a pile item, a
cursor — or cut the shot. Never lengthen.
