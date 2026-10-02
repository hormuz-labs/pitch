# Pacing — choose the rhythm, then measure it

Pacing follows attention, reading time, action and sound. Decide it in
`direction.md` before building. A rapid type sequence, a sustained product
demonstration and a quiet object reveal need different timing. There is no
required shot count, average duration, three-act shot pattern or cut cadence.
Equal lengths can support a musical pattern; unequal lengths can support an
arc. Neither is automatically good.

The requested runtime sets scope, not an exact total, unless the user explicitly
requires exact delivery or a maximum. Estimate time from the actual content,
then edit: remove redundant ideas, simplify each state, and allow the remaining
actions to finish. A longer cut is justified by comprehension or dramatic rhythm,
not by keeping every feature. A shorter complete film needs no padding.

## Attention and reading time come first

Plan each beat as **reveal → readable hold → clear or transform**. Write the
lead and those times in `direction.md`. A feature grid that
builds quickly and remains on screen is not sequential storytelling: it leaves
the viewer deciding what to read. Show the first point, let it land, then
replace it with the next. Keep only the context needed to understand the focus.

Count the essential words in the visible state, not just the new words. A useful
starting estimate for a short phrase is `max(1.5, 0.5 + words / 3)` seconds
**fully readable**, plus its entrance and exit. Six words therefore start with
about 2.5s of settled reading time. Numbers, unfamiliar names and UI interactions
may need longer; isolated familiar words can form a faster rhythmic sequence.
Test at delivery size and normal playback speed. If a viewer needs to pause,
shorten the copy, give it more time or separate the ideas.

Count each internal state separately. A 6s shot cycling four OS panels gives
each panel about 1.5s before transitions, not 6s to read. A heading plus a
description, command, status and badges remains crowded inside one hero card.
Remove the secondary reading tasks or demonstrate the point visually. Do not
use a large heading to justify unreadable supporting claims.

Do not count animated scrambling, an offscreen start, a morphing word or a
clipped exit as readable time. During the hold, keep the words stable and avoid
competing entrances, multiple counters or moving background details that pull
attention away. A held composition can be engaging without constantly changing.
When narration is present, show the matching idea as it is spoken; do not ask
the viewer to read a different paragraph at the same time.

Morphs and other transitions belong between reading windows. Transform the
current focal shape into the next, let it settle, then reveal the next copy.
Preserve enough visual continuity for the viewer to follow the change; piling
both compositions on screen during a long overlap defeats the handoff.

## What the audit actually measures

`pitch motion audit` samples every 0.25s, with optional ambient and drift
disabled. An "event" is a pair of samples with at least 0.6% of sampled pixels
changed. That is not a semantic event: a continuous move can count several
times, while a small but important UI change may not register at all.

The default notes flag a gap over 1.5s or a film below 0.7 events/s. They came
from fast motion-graphics references; they are not quality
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
| Attention | One lead movement and one new idea at a time, including during transitions; secondary motion stays under it. A composition may hold several elements. |
| Reading windows | Essential text is fully visible and stable long enough to read at normal speed; entrances and exits are additional time. |
| Continuity | Review meaning, composition, movement and sound; cuts need no persistent actor. |
| Clipping and palette | Fix unintended clipping and undeclared palette differences. An intentional image crop is a composition choice. |

Built-in and bespoke types are equally valid. Lab attribution records a
source; it earns no quality points. Punch cuts, sound dips and word-by-word
arrivals are optional techniques.
