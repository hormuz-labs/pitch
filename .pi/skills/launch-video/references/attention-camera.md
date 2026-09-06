# Attention camera — directing the `ui-frame` shot

The camera is a semantic pointer: at every moment it answers *what exact
thing should the viewer look at now?* A full screen orients; it rarely
focuses. The grammar is **context → focus → hold/action → release or cut**:

| Grammar | Field |
|---|---|
| Context | `enter`, the `caption` |
| Focus | `focus: { x, y, w, h }` — one hotspot; scale derives from `w` |
| Hold / action | `focus.hold`, `cursor` (+ `then` state swap) |
| Release | `focus.release` (pull back to 1.06×) or a hard cut |

## When the camera moves

A move is a claim — "look here, now" — so spend it rarely. **2–5 focus moves
per film**, at most one per shot, a type beat between clusters.

| Beat | Decision |
|---|---|
| A control clicked, a value changing, a small field | `focus` on it; `cursor` acts after the camera settles |
| A result whose meaning needs context | no `focus`, or `focus` with `release: true` |
| The whole screen is the claim | no `focus`; `enter: "rise"` and a `caption` |
| Two nearby targets | two `ui-frame` shots, never zoom-out-and-in inside one |
| Type, brand, stat, CTA beats | not a `ui-frame` — no camera |

## No-shock motion

Scale and pan travel together in one S-curve tween (`power4.inOut`;
`power3.inOut` for a Fluid language), `duration` 0.6–0.9s. The cursor acts
~0.3s after the focus completes — never mid-move. No overshoot on the camera.
`hold` 1.0–2.0s for a control, longer when `then` reveals a new screen.

## Hotspot and scale

Coordinates are fractions of the visible screen, **measured from the
rebuilt screen's layout** (`x = px / width`, from the `html` you wrote),
never guessed.

| Purpose | `w` | Scale |
|---|---:|---:|
| Feature region | 0.35–0.5 | ≈ 1.3–1.7× |
| Control / row / card | 0.18–0.3 | ≈ 2–3× |
| Tiny icon / field | 0.1–0.18 | ≈ 3.2× (cap) |

The control's label should render ≥ 28px tall at delivery size. `landX` /
`landY` land off-centre when the caption needs room.

## What goes inside the frame

A native `html` rebuild of the screen, always — faithful nav items,
labels and content from the harvested screenshot or mined frame it is
rebuilt from, in the film's own type and palette, never invented metrics —
with one part that moves (the field, the rows, the button, the result) and
a `cursor.then` swap for the consequence. The user's own photos and the
harvested logo go inside it as real assets. Never a captured screen as the
`src`; never a rebuilt screen that stays still for a whole shot.
