# Visually grounded zooms

## Roles

- **The vision-capable model chooses what matters** from actual frames, the brief
  and narration, then proposes a target box.
- **`pitch video focus` computes framing**: margin, aspect ratio, source bounds
  and preview images. It does not understand the target.
- **`pitch video render` executes** smoothstep motion from full composition or
  `start_viewport` to the destination, holds, and optionally returns to full.
  Equal-size endpoint viewports produce a constant-scale pan.
- **The model reviews** whether the right button, face, object or code is framed.
  Geometry validation alone cannot establish that.

## Coordinate contract

Top-left origin, normalized to the full displayed source:

```text
x      = left / displayed_frame_width
y      = top / displayed_frame_height
width  = target_width / displayed_frame_width
height = target_height / displayed_frame_height
```

The displayed frame is rotation/square-pixel corrected. Downscaling preserves
normalized coordinates. A 10×10 grid spans 0.1 per cell. Exclude chat padding,
screenshot borders, sheet labels and tile offsets.

For `(left=640, top=180, width=320, height=180)` in a 1280×720 full-source frame:

```json
{"x": 0.5, "y": 0.25, "width": 0.25, "height": 0.25}
```

These also apply to a 2560×1440 source, but not to a cropped inspection image.

## Tool sequence

Choose times and regions from actual footage; these are illustrative:

```sh
pitch video frames --source uploads/demo.mp4 --times '[12,12.8,14]' --grid --contact-sheet
```

Open `images[].path` with pi's `read`. For precise detail open the corresponding
individual `frames[].path`. After viewing:

```sh
pitch video focus --source uploads/demo.mp4 --time 12.8 --target '{"x":0.5,"y":0.25,"width":0.25,"height":0.25}' --width 1920 --height 1080 --margin 0.15
```

Open both outlined context and actual crop for each new composition. Reuse
approved framing over its established stable-layout interval. Margin adds 15%
of target size per side before aspect fitting and may reduce near bounds, but
the target must still fit. Use the returned **viewport**, not the target box.
Incompatible target/aspect combinations fail instead of clipping.

Record concise rationale: “At 12.8s the narrator names Save; the blue control
and confirmation panel are in the right pane. Crop includes both; checked at
12, 12.8 and 14s.” Report uncertainty rather than uncalibrated confidence scores.

## Targets by footage type

| Footage | Useful target | Context to retain |
| --- | --- | --- |
| UI demo | Active control and label | Parent panel, cursor approach, result |
| Code | Relevant lines or error | Line context, command/output relationship |
| Interview | Face/expression | Headroom, gaze, gestures |
| Physical demo | Hands/manipulated object | Tool, workspace, motion direction |
| Gameplay | Interaction or HUD | Spatial context and outcome |
| Lecture | Diagram/equation | Labels, axes, related elements |

Use the union of regions needed for comparison. Do not frame the cursor tightly
when the meaningful result appears elsewhere.

### Center the intended field, not the page

For isolated entry, target the visible field and normally center it. The whole
homepage, suggestion panel or pointer is not the field. Include suggestions
only when relevant and inspect the resulting composition.

For target center `(tx,ty)` and viewport `v`, its output-relative center is
`((tx-v.x)/v.width, (ty-v.y)/v.height)`. Approximately `(0.5,0.5)`, ±0.05, is
a review guide, not an automatic constraint. Check both axes in the crop.
Source edges (especially address bars), aspect and context can prevent exact
centering; widen/reframe or record the deliberate exception. Do not invent
padding fields.

## Temporal behavior

- Establish action bounds and layout stability using [inspection.md](inspection.md).
  URL/search/command/form/editor entry matters when viewers need its text;
  it does not require a separate screenshot pass.
- Finish the approach before **first input**, not merely before input ends.
  Include useful cursor approach. If lead-in is short, shorten the move, keep
  more preceding footage or use a static crop, subject to navigation rules.
- A viewport is a fixed destination; entrance interpolates from full or
  `start_viewport`, exit returns to full. This is not object tracking.
- Treat moves and holds as phases. Split clips to place phases when needed,
  neither dropping nor duplicating source time. Holds repeat the destination
  with `enter: 0, exit: 0`; only moves from a crop need `start_viewport`.
- Default to `exit: 0` for same-page actions. Hold through submission/click and
  response reading. Reframe an off-crop response after its trigger and give it
  a hold. For cross-page navigation, depart after focused work/reading, but
  finish before the trigger. Show trigger and first destination at full
  composition, then an orientation/read hold before refocusing. Omit a zoom
  if there is insufficient lead time; never carry a tight crop across navigation.
- Without an agreed preference, allow roughly 0.8–1.2 output seconds for completed
  text/confirmation and 1–2 for settled results, longer for dense content. Do
  not invent missing footage. If immediate submission removes a field, preserve
  input/submission continuously and give its response a hold.
- Choose intervals where a crop works, widen or create separate shots. Continuous
  tracking requires an actual tracking/keyframe tool, not unreviewed jump cuts.
- Avoid zooms during transition overlaps unless deliberate. Establish context
  before detail and leave reading time.
- The limit is 10× relative to the padded canvas; pixel quality limits earlier.
  Check `upscale_factor` and final-resolution detail.
- Changed aspect ratios make full composition letterboxed and focused composition
  fill the output. Review whether that movement is appropriate.

## Camera continuity on a stationary page or scene

Review during planning and after trims/speed changes. Clip boundaries alone do
not justify zooming out and back in.

1. **Find close moves in output time.** From the validated timeline review resets
   with 0–1 seconds of full-frame time, including bridge clips, and focus changes
   with at most one second of settled hold (`duration-enter-exit`). Longer
   same-page chains may also benefit. These are heuristics, not plan fields.
2. **Confirm coordinate stability.** No scrolling/inertia, navigation, tab switch,
   reflow, resize or camera movement that invalidates framing. Same filename/URL
   or similar endpoints do not prove stability. Sample unresolved changes only.
3. **Prefer hold, then pan.** If the next target/context is already readable in
   the crop, keep it exactly. Otherwise retain width/height and change x/y.
   Frame the action/result, not small cursor movements.
4. **Choose common scale.** If the next target cannot fit, check a wider shared
   viewport. For unapproved compositions use `focus` with a viewport-sized
   target and margin 0, at final aspect; inspect both images. Equal returned
   widths/heights are necessary for a fixed-scale pan. If readability fails,
   choose deliberate reframing.
5. **Encode continuity.** Preceding `exit: 0`; copy its final viewport exactly
   to the next `start_viewport`. Keep destination width/height equal, entrance
   generally 0.4–0.8 seconds adjusted for timing/travel, intermediate exits 0.
   Holds and idle-removal bridge cuts repeat `viewport` with zero enter/exit.
   Start early enough to settle before interaction. Do not link mismatched
   source geometries or accidentally blend camera motions.
6. **Handle layout changes.** Scrolls, anchors and expanded menus may retain
   framing when checked; cross-page navigation follows the rule above. Revealed
   links/submenus are new interactions, not idle time. Establish stability again.
7. **Validate/review.** Update the log with stable intervals, targets, common
   scale and decisions. Add unresolved handoffs to consolidated rendered review,
   not a separate pass. Correct endpoints do not prove mid-pan readability.

## Interaction coverage audit

For polished screen recordings audit meaningful in-scope interactions, even
when no individual zoom targets were named. This is a plan/log audit:

1. Use logged first input, last input/click, distinct navigation trigger, first
   useful response and reading interval. Include URL entry, search/submission,
   results, menus/sections, nested links and final actions. Nearby actions need
   their own bounds but can share evidence.
2. Give every unreadable/requested target a checked viewport, or record why
   existing framing works. Check field centering, not just inclusion.
3. Map through validated time: with clip start `S`, end `E`, speed `r`, in `I`,
   event time = `S+(source_time-I)/r`; settled start = `S+enter`; exit start =
   **`E-exit`**. With no exit, the next changing cut/pan is departure; identical
   viewport cuts continue the hold. Account for quantization and overlaps.
4. Require `move_end <= first_input`. Same-page departure must be after required
   hold; an off-crop response may be reframed after trigger with its own hold.
   Cross-page departure must follow focused-work hold and finish before trigger,
   with trigger/destination fully framed. Distinguish typing/link reading from
   navigation trigger. A positive settled duration alone proves nothing.
5. Calculate from conservative observed bounds. Combine unresolved visual checks
   with the single rendered list. Arbitrary midpoints cannot prove boundaries.
6. Fix early exits, late entrances, missing/off-center targets and missing result
   orientation time. The validator does not perform this semantic audit.

Timing trap: a clip at output 4–7s with enter/exit 0.4 is settled only from
4.4 through 6.6 seconds. Input beginning after that happens during departure
despite a nominal 2.2-second hold. Settle before input and keep exit 0 until a
justified departure.

Examples: pan between nearby stationary controls; hold if the next is already
readable; carry the crop across an idle-removal cut; zoom out before a link
changes pages; inspect intervening scroll/navigation before linking crops.
