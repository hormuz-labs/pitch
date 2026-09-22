# Efficient visual inspection

## Contact sheets first

```sh
pitch video frames --source uploads/recording.mp4 --times '[0,4,8,12,16,20,24,28]' --contact-sheet
```

Choose times inside the probed duration; these are examples. Open
`images[].path` with pi's `read`: each PNG has 4×2 tiles ordered left-to-right,
then top-to-bottom. More than eight samples make a second page; maximum 12 per
call. Labels are requested source seconds. On an edited MP4 they refer to that
edited file's timeline.

Individual PNGs remain in `frames[].path`; `images[].tiles` maps times, paths
and pixel `content_box`. Default tile width 480 gives a 1920-wide sheet. Increase
tile width or open individuals for small text. `max_width` controls originals,
not sheets. `grid` draws inside each frame.

Measure normalized coordinates **inside the tile's video content**, excluding
labels and sheet offsets. Open an individual full-source image for precise
framing and verify with `focus`. A sheet does not prove final text readability.

## One inspection log

Use clip notes or one companion edit-notes file, not parallel maps/audit tables.
Record source identity (path and size/mtime or hash), inspected times/image
paths/settings, action bounds, reading intervals, approved targets/viewports,
stable-layout intervals and unresolved questions. Add validated output times
and review results as the plan develops. Do not invent plan JSON fields.

Reuse already-opened evidence for the same source/time/scale/grid. Reopen only
for unresolved detail or unavailable observations. Source replacement invalidates
its evidence; layout changes invalidate framing. Trims/speed changes invalidate
output mappings/render checks, not unchanged source observations. Output geometry
changes require framing/readability review. Tag render evidence with plan/output
version and remap unchanged conclusions after upstream edits.

## Sampling workflow and stop rules

1. **Overview:** one sheet of up to eight broadly spaced frames maps relevant
   scenes/actions. Reuse on revisions. It does not establish exact event times.
2. **Batch uncertainties:** collect unresolved action starts, completion/submission,
   useful responses, layout changes and cut sides into one list per source.
   Deduplicate; extract up to 12 per call. One sheet may cover several actions.
3. **Narrow locally:** inspect only brackets straddling an event, roughly
   0.1–0.25s spacing for quick UI actions when necessary. Record conservative
   bounds: settle before earliest input and retain through latest completion.
   Inspect navigation trigger and destination; choose the reset from the actual
   layout change and the scenario's attention requirements.
4. **Approve compositions:** `focus` once per distinct target/composition, then
   open context/crop. Reuse only over established stable layouts. Recheck changed
   targets, layouts/output geometry or failed crop reviews; a still does not
   prove stability through unseen motion.
5. **Review the render:** build the consolidated list below from timeline/log.
   After a fix revisit affected sequences and dependent checks, including shifted
   captions/overlays.
6. **Stop:** every extra screenshot resolves a named uncertainty. Once timing,
   framing, holds and continuity are established, proceed. Reopen inspection
   only when a change invalidates evidence or review reveals a defect.

For a short straightforward recording, start with one overview sheet, one or
two targeted sheets, checks for distinct crops and one or two rendered sheets.
This is a soft budget, not a quota or coverage limit; exceed for named concerns.

## Consolidated rendered review

Use one deduplicated output-time list across these checks. One frame can answer
several questions. Calculate timing from [zoom.md](zoom.md#verify-the-attention-not-just-the-effect)
and logged event bounds. Validation checks geometry/timing fields; verification
checks media integrity. Neither establishes semantic or visual quality.

- **Focused actions:** settled framing at input, visibility through focused
  work and readable results. Use boundary evidence plus known fixed holds;
  add samples for uncertain motion/text/state rather than every action phase.
- **Navigation/handoffs:** visible named control through activation, appropriate
  orientation at the first destination, and affected cut/pan boundaries. Choose
  framing from actual layout continuity, not an unconditional pre-click reset.
- **Other edits:** cuts, transitions, overlays and captions in the same list.
  Redactions need coverage throughout; sparse endpoints cannot prove completeness.
- **Delivery detail:** representative final-resolution frames for distinct
  text/detail compositions. A 960×540 draft cannot prove final readability.
  Reuse passed draft conclusions, then check resolution-sensitive/unresolved items.

Source frames do not prove rendered behavior. Sparse stills cannot rule out
transient glitches: use supported playback or denser local sampling for
suspected flicker, motion or redaction gaps. Sheets do not prove unseen frames
are static.
