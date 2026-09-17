# Pacing — choose the rhythm, then measure it

Pacing follows attention, reading time, action and sound. Decide it in
`direction.md` before building. A rapid type sequence, a sustained product
demonstration and a quiet object reveal need different timing. There is no
required shot count, average duration, three-act shot pattern or cut cadence.
Equal lengths can support a musical pattern; unequal lengths can support an
arc. Neither is automatically good.

## What the audit actually measures

`pitch motion audit` samples every 0.25s, with optional ambient and drift
disabled. An "event" is a pair of samples with at least 0.6% of sampled pixels
changed. That is not a semantic event: a continuous move can count several
times, while a small but important UI change may not register at all.

The default notes flag a gap over 1.5s or a film below 0.7 events/s. They came
from fast motion-graphics references in `docs/studies/`; they are not quality
targets for every kind of film. Set `--max_quiet` and `--min_eps` to suit the
planned rhythm when useful. A pacing note never fails the audit.

For a flagged stretch, look at the picture and listen to the sound:
- Does the viewer need this time to read, anticipate, inspect or feel a payoff?
  Keep it. The treatment can explain the hold; no re-run is needed.
- Has the intended action finished and attention gone nowhere? Tighten the
  shot, change its composition or develop the idea. Add only meaningful action.
- Does a small event fall below the pixel threshold? Judge its visibility at
  delivery size. Do not enlarge it or add decoration just to satisfy the metric.

Lengthen a shot when the material needs more time. Shorten or remove it when
it has finished its job. Never use a pulse, shake, flash, extra word or cut
solely to increase the event count.

## Verification

| Check | What to do |
|---|---|
| Compilable timeline | At least one shot with finite, positive durations; fix page errors and substantial factory overruns. |
| Narration | One continuous read when narrated; cue meaningful picture changes and check alignment. |
| Seek determinism and scene visibility | Fix actual rendering errors. These fail the audit. |
| Quiet stretches and event rate | Review against the treatment, not a universal density target. |
| UI readability | An overview may stay wide. Enlarge the relevant detail when it needs to be read. |
| Continuity | Review meaning, composition, movement and sound; cuts need no persistent actor. |
| Clipping and palette | Fix unintended clipping and undeclared palette differences. An intentional image crop is a composition choice. |

Built-in and bespoke types are equally valid. Lab attribution records a
source; it earns no quality points. Punch cuts, sound dips and word-by-word
arrivals are optional techniques.
