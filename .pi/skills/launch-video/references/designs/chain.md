# Design: the continuous chain

Measured frame by frame from a 33-second SaaS launch ad (a book/audio/video
translation product). Zero cuts. One object is born from the words, dropped
into the product, becomes the next object, and ends as the mark. The viewer
never re-orients, so every feature reads as the consequence of the last
action. This file is the grammar in engine fields; `direction.md` decides
what this product's chain is.

## When it fits

- The product has **one object** the viewer already understands — a file, a
  message, a photo, a card, a cursor, a document — and one job story (drop
  it in → it is processed → here is the result → here is what you can do
  with it).
- Few screens, one mark worth landing on. 25–40 seconds, music-only.
- The site is light and flat, or can be shown that way. A dark product with
  glow is not a chain film; a suite with twelve features is a chapters film.

## The chain

Before a shot is written, name the objects in order. The reference:
words → folder → laptop → phones → blob → bar → pill → disc → check → card →
strip → grid → card → cards → list → row → button → star → logo. Sixteen
objects, each one **born from the previous one**. Write yours in
`direction.md` as one line. A chain with a gap in it is two films.

## Stage and finish

| decision | field | the reference |
|---|---|---|
| bare stage | `ambient: { kind: "none" }` | off-white tinted toward the accent (`#F8F7FD`); no grain, no vignette, nothing drifting — whitespace does the work |
| one exit | `motion: { exit: "blur", cutDur: 0.5 }` | rise 70px and blur to nothing in 9 frames; the next thing is already there |
| three tints of one hue | `brand.accent` + the `muted` and `gradient` tones of `line` | deep accent for the noun, a mid tint for the object, pale for the de-emphasised word; the product's own second colour only where the product uses it |
| shutter | `render: { shutter: 0.5, samples: 4 }` | fast moves blur in proportion to speed — the phones, the card flip, the fly-past |
| type | `line`, `size` 84–110, tone not weight | 2–4 words, the noun in `accent`, holds 0.3–0.8s |
| the product | mined frames and screenshots on `device-3d`, in a `ui-frame` with `aura`, as `cascade` cards | real content in every screen, never a mock |

## The moves, in fields

| the reference does | frames | write |
|---|---|---|
| a word **adds** to the line, sharp, and the line settles | 1 + 12 | `line.steps: [{ at, add: [{ text, tone }] }]` |
| the line is **replaced** (old shrinks + blurs, new lands from 1.5×) | 5 + 8 | `{ at, replace: [...] }` |
| the object sits **between the words** | 12 | a `slot` part + an actor pose `{ anchor: ".slot-<name>", enter: "scale-blur" }` |
| the words blur out, the object stays and grows | 9 | `{ at, out: "blur" }` on the line; the actor's next pose in the next shot |
| the object **drops into the product** | 12 | actor poses `[{ x, y, scale: 1.4 }, { scale: 0.25, blur: 8, opacity: 0, ease: "power3.in", out: "fade" }]` over a `device-3d` |
| the product **exits up and blurs** into the next line | 9 | `exit: "blur"` (the default) |
| five screens in a **ring**, orbiting, the centre words swapping | 20 in | `device-3d` with `ring: { srcs: [five mined frames] }`, `line` steps over it as a caption, `exit3d: "through"` |
| a **blob** trails the fly-past and becomes the bar | 13 + 13 | an actor `shape` posed wide and blurred (`blur: 20`), then `{ h: 80, r: 40, blur: 0 }` |
| the **count** 63 → 100 | 40 | `line` at `x`/`y` with `replace` steps, or `stat-counter` |
| bar → pill → disc → **check** → card | 5 + 3 + 1 + 5 + 2 | the same `shape` actor: `{ w: 120 }`, `{ w: 110, h: 110, r: 55 }`, `{ w: 220, h: 220, fill: pale }` with `beats: [{ kind: "ripple" }]`; the check is a `DrawSVG` stroke in a project type or a Lottie the site has; then `{ w: 200, h: 140, r: 24 }` |
| **confetti**, near pieces blurred | 39 | a project type on `Physics2DPlugin` with blur by size (`effects-catalog.md` §22) |
| one card **duplicates into a strip** | 4 each | `cascade` with `dir: "left"`, `every: 0.13`, `scroll` |
| the strip becomes the **grid**, the app drawn around it | 2 | a `ui-frame` whose `src` shows that grid, `cut: "zoom-out"` or a `cascade` → `ui-frame` boundary with the strip's last frame matching the grid row |
| **click, zoom**: the card grows, the rest blurs to white | 7 | `ui-frame` `cursor: { x, y, hand: true, zoom: { scale: 2.8 } }` |
| the card **flips and multiplies** | 4 + 11 | an `element` actor born from the card with `rotation` poses, or a project type; then `cascade` / a project scatter |
| list → **row** fills the width | 6 | `cut: "zoom"` into a `ui-frame` of the row (or `beats: [{ kind: "zoom", sel }]`) |
| row → **button** → blue → **star** | 3 + 1 + 3 + 9 | an `element` actor `{ from: "#row .button" }` posed `{ out: "shrink" }` as a `shape` actor with a star `path` enters `{ enter: "scale-blur", scale: 6, blur: 20, opacity: 0.4 }` → `{ scale: 1, blur: 0 }` |
| the star is the **full stop** of the last line | | a `slot` at the end of the `line`; the star's pose anchors to it |
| the line **exits left** accelerating, the star stays | 15 | `{ at, out: "left" }` on the line; the star's next pose |
| the mark **draws in beside the star**, the wordmark closes up | 6 + 14 | `logo-cta` with the star `{ anchor: ".logo-img", into: ".logo-img" }` |
| a **breath** before the check and before the logo | | `beats: [{ kind: "breath" }]` on those shots |

Easing: `expo.out` in, `power3.in` out, geometric shrinks. Nothing bounces.

## Rhythm

Bursts of 0.2–0.5s, holds of 0.3–0.8s, and from the ring to the scatter
never a still frame: an orbit, a drift, a marquee or confetti under every
hold. The audit's quiet rule is the same; the chain meets it with motion,
not with beats.

## Checklist before the shot list

- The chain is written as one line in direction.md and has no gap.
- `design: "chain"`, `ambient none`, `motion.exit: "blur"`, `render.shutter`.
- Every object that lives through a boundary is an `actor`; every boundary
  is an actor, a `carry`, a `flood` or a blur exit — the audit warns when a
  third of them are plain cuts.
- The product appears as its own frames: a `device-3d` (single or `ring`),
  a `ui-frame` with `aura`, `cascade` cards from mined frames.
- Two `breath` beats: before the payoff, before the mark.
- The mark is a harvested file and the last thing an actor lands `into`.
