# Design: prompt chapters

Measured frame by frame from an 87-second product tour (a video-creation
app inside an office suite). No narration. Eight chapters, each the same
three beats: a sentence **at hero scale** that the viewer reads as their
own thought (the reference typed it; we land it as a move and travel it
with the word camera — a caret at hero scale is the tell of the template
now), the **product rebuilt** and tilted with a cursor acting, and a
**payoff** that floods, morphs or extracts. Twenty-two hard cuts, none of
them felt: each lands on a full-bleed colour or on the beat. This file is
the grammar in engine fields; `direction.md` decides this product's
chapters.

## When it fits

- The product is a **suite or an editor**: many screens, many jobs, features
  that are each a sentence ("choose a style", "give it a voice", "add stock
  media", "record yourself").
- The real UI is rich enough to carry 60% of the runtime. 45–90 seconds.
- A voice is optional; the prompts are the script. If narrated, the prompts
  are what the narrator says.

## The chapter

```
prompt   a `line` landed as a move (a snap, an inflate, a motion-blur arrival — `effects-vocabulary.md` §1), size 150–170, aurora behind it, the noun in `accent`, read by the **word camera** (`zoom` beats word by word, the noun last)   2–3s
product  the line shrinks to UI scale (an `element` actor, or `cut: "zoom-out"`); a `ui-frame` with `html` — the screen **rebuilt** from its reference frame, one part of it moving (the field expands, the rows land, the button splits) — with `tilt`, `aura`, `cursor: { hand: true }` acting; `ambient: false`   3–6s
payoff   a `flood` cut, a `cascade`, an actor morph, a `ring`, a `cursor.zoom`, a card flip, a stretch cut — the noun becoming the object   1–3s
```

Write the chapters in direction.md as a table: chapter · prompt · the UI
and what the cursor does · the payoff. Six to nine chapters. Mark every
shot with `chapter`. Variety lives in the payoffs; the structure repeats so
the viewer learns it in chapter one.

## Stage and finish

| decision | field | the reference |
|---|---|---|
| white stage, aurora under type | `ambient: { kind: "aurora" }` + `ambient: false` on product shots | blurred blue / pink / lavender discs in the brand's hues fade in behind every hero sentence; the product sits on a pale haze |
| the noun in the accent | `tone: "accent"` on the part being demonstrated | "style", "script", "voice", "work" — one word per sentence |
| tilted UI cards | `ui-frame` with `html`, `tilt: { y: 6, x: 2 }` and `aura: true` | every product shot is a rebuilt screen on a card in 2.5D with an ambient dolly, never flat, never a capture |
| the cursor scales with the world | `cursor.hand: true` at hero scale; the small pointer inside the UI | two cursors, one world |
| shutter | `render: { shutter: 0.5 }` | the countdown glyphs and the fly-ins blur with speed |
| bed | a bed with a clear intro; `breath` beats | bass enters when the product first appears, leaves for the quiet chapter |

## The moves, in fields

| the reference does | frames | write |
|---|---|---|
| the **hero sentence** arrives (the reference typed it; the pill grew, the noun turned blue) | 1 char / 1–2 | a `line` at `size: 160` landed as a move — a snap (`word-build`, `each: 0.08`), a motion-blur arrival (`replace` step), an inflate (project type) — the noun in `tone: "accent"`; then the **word camera**: `beats: [{ kind: "zoom", sel: ".lw:nth-child(1)", fill: 0.55, dur: 0.25, release: 0.45 }, …]` one per word. Not `typing` — the caret at hero scale is banned |
| the sentence **shrinks to reading size** | 14 | a `replace` step at a smaller `size`, or the `element` actor pose that carries it into the UI |
| a **prompt box** inside the product, typed | 1 char / 1–2 | `typing` is allowed here only: the rebuilt prompt field in a `ui-frame` `html`, at UI scale, mid-chapter |
| a **word rotator**: instant swaps, holds shrinking | 1 each | a part with `rotate: ["writer", "producer", "editor"]`, `every: [0.67, 0.3, 0.33, 0.3]` |
| the other words **blur out**, the noun stays and becomes a button | 9 | `{ at, keep: "style" }` then the word's own state change (a `pill` container grows around it) and a `flood` |
| the **prompt pill shrinks to UI scale** and the UI arrives | 2 | an `element` actor `{ from: "#prompt .line-box" }` posed `{ scale: 0.3, x, y }` over the `ui-frame`; or `cut: "zoom-out"` |
| **file chips fly in**, near one blurred, one is dragged into the prompt | 20 + 5 | `image` actors with `enter: "fly"`, the dragged one posed `into` the prompt's slot |
| **"Creating…"** floods the frame, then tilts away as the UI slides in | 1 + 28 | `cut: "flood"` with `flood: { color: "accent" }` into a `ui-frame`; or a `shape` actor `material: "pill"` posed full-bleed then `{ rotation, scale: 0.3, out: "shrink" }` |
| rows / comments **cascade** in, earlier ones defocus | 1 / 3–15 | `cascade` `dir: "up"`, `every`, `dof` |
| **push-in** from the UI to one row / the search field; the cursor scales too | 4–6 | `cut: "zoom"` into a `ui-frame` of the part, or `cursor.zoom` |
| "voice" **becomes gradient shapes** that squash into the list's rows, then the real list | 4 + 27 + 1 | `shape` actors with `blur` poses over a `line`, then `{ w, h, r }` poses matching the rows, then `cut: "hard"` to the `ui-frame` of the list (the actors `out: "fade"` at the cut) |
| the **Play** pill, press, the frame fills, the label becomes the claim | 3 + 7 | `line` with `container: "glass"` and a `cursor` shot; on the press the pill **grows** (a `pulse` beat, or a `shape` actor `{ w: 260 } → { w: 2200, h: 1400 }` behind it) or a `flood`; `replace` step to the claim. Never `ripple` rings |
| the claim **zooms past the camera** | 6 | `{ at, out: "shrink" }` inverted — `cut: "zoom"` into the next line |
| a **phrase rotator** into a **blue flood** with white glowing phrases on the beat | 1 / 10 | `line` with `rotate` parts, `beats: [{ kind: "flood", color: "accent", stay: true }]`, then a `line` on `bg: "accent"` with `rotate` at `every: 0.34` |
| the **countdown**: extruded glyphs swing through, land in a glass disc with a radial wipe | 4 + 26 | a project type (three.js `ExtrudeGeometry` of the glyph, or a large `text` actor with `enter: "fly"` and `material: "glass"` disc behind) |
| the recorded presenter **composited on the slide**, then the slide shrinks into the editor | 10 | the harvested video still as an image *inside* a rebuilt slide (`ui-frame` `html`, `frame: "none"`), `cut: "zoom-out"` into the rebuilt editor |
| the app icons **appear in one frame** from the grid dots | 1 | `icon-marquee` or a `cascade` with `every: 0` |

## Rhythm and sound

Chapters of 6–12 seconds. Hero type holds ≤ 0.7s per state, product shots
3–6s with an ambient dolly and a cursor that moves within 0.3s of arriving.
Cuts land on the bed's beats; the blue rotator swaps every beat. A `breath`
before "Creating…", before the click that matters, before the mark. One
quiet chapter (the bed thinner) so the loud ones read as loud.

## Checklist before the shot list

- The chapter table is in direction.md: 6–9 rows, each with a prompt, a
  screen, a cursor action and a payoff that differs from its neighbours.
- `design: "chapters"`, every shot carries `chapter`, `ambient aurora` with
  `ambient: false` on product shots, `render.shutter`.
- Every chapter opens on a `line` at hero scale landed as a move and read
  by the word camera, the noun in `accent`; the same noun is what the payoff
  turns into. No `typing` outside a rebuilt prompt box.
- At least one `flood` cut and one `zoom` / `zoom-out`; the audit warns
  without them.
- The product is the real product **rebuilt**: `ui-frame` `html` from the
  harvested screens and mined frames, tilted, with `aura`, one part moving
  in every product shot; a `cursor` (hand at hero scale) on every product
  shot; named `cursors` where the product is collaborative. No `src` on a
  `ui-frame`, no `ripple`.
- Three `breath` beats.
