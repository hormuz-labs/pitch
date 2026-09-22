# Camera: geometry, cues and continuity

The scenario chooses why and when to emphasize something. These shared mechanics
make that decision reproducible; they do not choose a subject from the transcript.

## Ground the composition

Open source frames at the relevant cue and through the proposed hold. A target
box is normalized to the full auto-rotated, square-pixel source, top-left origin:
`x=left/width`, `y=top/height`, with similarly normalized width/height. Exclude
contact-sheet labels, tile offsets and image borders. A transcript has no visual
coordinates.

Run `pitch video focus` for each distinct composition at final output aspect;
open both its outlined context and actual crop. Copy the returned `viewport`,
not the target box. Check readable text, label/context, and target centering.
For a target center `(tx,ty)`, its position in viewport `v` is
`((tx-v.x)/v.width,(ty-v.y)/v.height)`. Centering near `(0.5,0.5)` is useful for an
isolated control; source edges or a needed relationship can justify another
position. Record the reason instead of forcing a clipped crop.

Do not crop code/diagrams so tightly that their argument disappears. Check the
actual source crop size and upscale factor. A returned valid box proves geometry,
not readable detail or a semantically correct target.

## Choose and encode time

Use the scenario's semantic/action anchor. For narrated emphasis, `camera.cue`
accepts `speech`, optional `action`, and `hold_until` in the clip's source time.
After preprocessing these are prepared-source times. `speech` is the onset of
the identifying phrase, not automatically the start of its whole sentence.
`action` is supplied only when it is measured and belongs to the same emphasis.
Omit it for discussion of a result that is already visible.

The current backend settles at the earlier supplied speech/action time, rounded
down to an output frame. `enter` is the duration of the delayed approach. It does
not align words, understand intention, or make a delayed gesture simultaneous.
The validator reports `camera_timing` and rejects insufficient lead-in and early
departure. It cannot detect a missing camera decision.

Cued speech clips run at 1×. Split silent acceleration first. Retain a longer
lead-in, shorten the approach or use an already-established static crop when
the move cannot fit. Do not postpone the intended emphasis until after the cue
just to accommodate a standard move duration.

For action-only/silent footage, use `camera.delay` in clip-output seconds to
schedule the entrance, or split contiguous move/hold clips when needed. A delayed
return from `start_viewport` to full view can retain the control until navigation
without carrying the old crop into a blank destination. Do not fabricate speech
for `camera.cue`; `delay` and `cue` cannot be combined.

## Holds, pans and layout changes

- `viewport` alone is a static crop. `enter` moves from full composition unless
  `start_viewport` is supplied. `exit` returns to full before the clip ends.
- Continue a crop over clip/speed boundaries by repeating the viewport with
  zero enter/exit. A boundary alone is not a reason to zoom out and back in.
- On a stable layout, pan from the preceding viewport to the next; equal endpoint
  width/height gives constant scale. If the next target is already dominant in
  the crop, hold rather than manufacturing movement.
- Departure follows the required spoken/action/reading hold. A full composition
  can be necessary for orientation or comparison; choose it from the scenario.
- Navigation timing depends on whether the layout invalidates the crop. Inspect
  the trigger and first destination; widen at the appropriate change instead of
  imposing an unconditional pre-click reset that hides the named control.
- Scroll, reflow, transitions and moving subjects can invalidate a fixed crop.
  Use a wider view or inspected separate compositions, not a claimed tracker.

For an uncued move, settled start is `clip_start+delay+enter` (delay defaults to 0). A nonzero exit starts
around `clip_end-exit`, with the last-frame detail supplied by the backend.
For cued moves use returned `camera_timing`, not the uncued formula.

## Verify the attention, not just the effect

Take the scenario's full reference/action map and inspect the rendered output
at each required cue. Check the approach, target prominence/readability, stable
hold, next target and departure. Include required subjects with no effect.
Evaluate early as well as late emphasis: a crop settled many seconds before an
unrelated phrase can be just as misleading as a late zoom.

Geometry/timing tests, waveform alignment and full decoding are separate from
this semantic review. Report which were actually checked. Use supported playback
or dense local samples where isolated stills cannot establish the motion.
