# Attention Camera — directing the `ui-frame` shot

The `ui-frame` type puts the real product on screen and moves a camera toward
one hotspot. This reference decides *when* that move earns its place and how
to set the fields. Timings and scales are diagnostic starting points; the
product's information hierarchy decides.

## 1. The governing idea

The camera is a semantic pointer. At every moment it answers: *what exact
thing should the viewer look at now?* A full product screen orients; it rarely
focuses. The grammar is **context → focus → hold/action → release or cut**,
and the `ui-frame` fields map onto it directly:

| Grammar | Field |
|---|---|
| Context | the frame's entrance (`enter`), the caption |
| Focus | `focus: { x, y, w, h }` — one hotspot, scale derived from its width |
| Hold/action | `focus.hold`, `cursor` (click + optional `then` state swap) |
| Release | `focus.release` (pull back to 1.06×) or a hard cut to the next shot |

## 2. When the camera moves — and when it doesn't

A camera move is a claim: "look here, now." Spend it rarely. A film that zooms
in every product shot feels nervous.

| Beat | Decision |
|---|---|
| A control being clicked, a value changing, a small field | `focus` on it, `cursor` acts after the camera settles |
| A result whose meaning depends on context | no `focus`, or `focus` with `release: true` so the pull-back is the point |
| The whole screen *is* the claim (a clean dashboard) | no `focus`; `enter: "rise"` and a `caption` carry it |
| Two nearby targets | two `ui-frame` shots (cut between them), never a zoom-out-and-in inside one |
| Type, brand, stat, CTA beats | not a `ui-frame` at all — no camera |

Budget: **2–5 deliberate focus moves per film**, at most one per shot, with a
type beat between clusters so attention can reset.

## 3. No-shock motion

- Scale and pan travel together in one eased tween (the type does this).
  Keep `ease` an S-curve (`power4.inOut` default, `power3.inOut` for Fluid).
- `duration` 0.6–0.9s for acquisition; the built-in release is 0.9s.
- **Settle before the action.** Default `cursor.at` lands ~0.3s after the
  focus completes. Never let the click happen mid-move.
- No overshoot on the camera; bounce belongs to objects, not the frame.
- Hold long enough to read: `hold` 1.0–2.0s for a control, longer if the
  `then` swap reveals a new screen.

## 4. Choosing the hotspot and scale

Coordinates are fractions of the visible screen area. Measure them from the
harvested screenshot (`x = px / width`, `y = px / height`); do not guess.

| Shot purpose | Hotspot width `w` | Resulting scale |
|---|---:|---:|
| Feature region | 0.35–0.5 | ≈ 1.3–1.7× |
| Control / row / card | 0.18–0.3 | ≈ 2–3× |
| Tiny icon / field | 0.1–0.18 | ≈ 3.2× (cap) |

Override `scale` only when the derived value hides the consequence the click
produces. Preview at delivery size: the control's label should render ≥ 28 px
tall. Use `landX`/`landY` to land off-center when the caption needs room.

## 5. Verified assets first

Order of preference for what goes inside the frame:

1. User-provided product assets.
2. Screens harvested from the product's site (`assets/harvested/`).
3. A native `html` rebuild — only when internal parts must animate and the
   screenshot cannot show the state change. Rebuild faithfully (real nav
   items, real labels); never invent metrics or feature names.
4. A hybrid: screenshot base plate plus a `cursor.then` swap to the resulting
   screenshot for the consequence.

Never hold an unchanged screenshot for a whole shot: give it a `focus`, a
`cursor`, a `then` swap, or cut sooner.

## 6. Audit before final

- [ ] Every `ui-frame` names one target or is an intentional context shot
- [ ] ≤ 5 focus moves in the film; none on type/brand/stat/CTA beats
- [ ] Cursor acts only after the camera has settled
- [ ] Hotspots measured from the screenshot, labels legible at delivery size
- [ ] Recognizable UI comes from harvested screens, not approximations
- [ ] A type beat follows every run of dense product shots
