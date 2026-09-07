# Design: prompt chapters

Measured frame by frame from an 87-second product tour. No narration. Eight
chapters, each the same three beats, and twenty-two hard cuts, none of them
felt: each lands on a full-bleed colour or on the beat.

## When it fits

The product is a **suite or an editor**: many screens, many jobs, features
that are each a sentence a user would say ("choose a style", "add a voice",
"record yourself"). The product can carry half the runtime. 45–90 seconds. A
voice is optional; the sentences are the script either way.

## The chapter

```
sentence   a `line` at hero scale (size 150–170) landed as a move, aurora behind it,
           the noun in `accent`, then travelled by the word camera —
           `zoom` beats one per word, the noun last                        2–3s
product    the sentence shrinks to UI scale (an `element` actor, or `cut: "zoom-out"`);
           the product doing the thing, tilted, with a cursor acting;
           `ambient: false` under it                                       3–6s
payoff     a `flood`, an actor morph, a `cursor.zoom`, a card flip —
           the noun becoming the object                                    1–3s
```

Six to nine chapters, every shot marked with `chapter`. The structure repeats
so the viewer learns it in chapter one; **the variety lives in the payoffs**,
which are all different. Write the table in `direction.md`: chapter ·
sentence · what the product does · the payoff.

## The fields

| decision | field |
|---|---|
| white stage, aurora under type | `ambient: { kind: "aurora" }`, `ambient: false` on product shots |
| the noun in the accent | `tone: "accent"` on the word the chapter is about |
| the product on a tilted card | `ui-frame` with `tilt: { y: 6, x: 2 }` and `aura: true`, never flat |
| the cursor scales with the world | `cursor.hand: true` at hero scale, the small pointer inside the product |
| motion blur | `render: { shutter: 0.5 }` |
| the bed | a clear intro; bass enters when the product first appears |

Typing belongs to a prompt field inside the product, at product scale,
mid-chapter — never a caret at hero scale, which is the tell of the template.

## Rhythm and sound

Chapters of 6–12 seconds. Hero type holds ≤ 0.7s per state; product shots
3–6s with a dolly and a cursor that moves within 0.3s of arriving. Cuts land
on the bed's beats. A `breath` before the payoff that matters, and one quiet
chapter so the loud ones read as loud.

## Checklist before the shot list

- The chapter table is in `direction.md`: 6–9 rows, payoffs all different.
- `design: "chapters"`, every shot carries `chapter`, `ambient aurora` with
  `ambient: false` on product shots, `render.shutter`.
- Every chapter opens on a hero sentence landed as a move and travelled by
  the word camera; the noun is what the payoff turns into.
- At least one `flood` and one `zoom` / `zoom-out`; the audit warns without
  them. No `ripple`.
- Three `breath` beats.
