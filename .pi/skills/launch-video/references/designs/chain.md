# Design: the continuous chain

Measured frame by frame from a 33-second SaaS launch ad. Zero cuts. One
object is born from the words, dropped into the product, becomes the next
object, and ends as the mark. The viewer never re-orients, so every feature
reads as the consequence of the last action.

## When it fits

The product has **one object** the viewer already understands — a file, a
message, a photo, a card, a document — and one job story: put it in, it is
processed, here is the result, here is what you do with it. Few screens, one
mark worth landing on. 25–40 seconds, usually music-only. A suite with twelve
features is a chapters film.

## The chain

Before a shot is written, name the objects in order, as one line in
`direction.md`. The reference ran: words → folder → laptop → phones → blob →
bar → pill → disc → check → card → strip → grid → cards → list → row →
button → star → logo. Sixteen objects, **each born from the previous one**. A
chain with a gap in it is two films.

Each object is whatever shows it best — a shape you draw, a harvested file, a
generated plate, a frame from their demo. What matters is that it persists
and transforms, not where its pixels came from.

## The fields that make it continuous

| decision | field |
|---|---|
| bare stage | `ambient: { kind: "none" }` — off-white tinted toward the accent; whitespace does the work |
| one exit | `motion: { exit: "blur", cutDur: 0.5 }` — rise and blur to nothing; the next thing is already there |
| motion blur | `render: { shutter: 0.5, samples: 4 }` — fast moves blur in proportion to speed |
| type | `line`, 2–4 words, the noun in `accent`, holds of 0.3–0.8s |
| the object across shots | an `actor`: declare it once, pose it in every shot it passes (`motion_schema({ section: "actors" })`) |
| the boundary | an actor pose, a `carry`, a `flood`, or the blur exit — never a plain cut |

Easing: `expo.out` in, `power3.in` out, geometric shrinks. Nothing bounces.

## Rhythm

Bursts of 0.2–0.5s against holds of 0.3–0.8s, and never a still frame: an
orbit, a drift, a marquee or a scatter under every hold. The chain meets the
density rule with motion, not with extra beats.

## Checklist before the shot list

- The chain is one line in `direction.md`, with no gap.
- `design: "chain"`, `ambient none`, `motion.exit: "blur"`, `render.shutter`.
- Every object that lives through a boundary is an `actor`; the audit warns
  when a third of the boundaries are plain cuts.
- Two `breath` beats: before the payoff, before the mark.
- The mark is the last thing on screen, and an actor lands `into` it.
