---
name: recording-edit
description: Edit an uploaded, narrated screen recording into a cinematic demo — reconstruct recording/demo-state.json (the zoom and click events that drive the camera) from the narration and the footage with pitch recording probe-video, pitch recording transcribe-video, pitch recording detect-key-moments and pitch recording inspect-frames, emit events with the record_* tools, render with pitch recording edit-render, and iterate by chat. Read this before editing a recording.
---

# Recording edits

You never modify the video. You **emit events** — the same
`recording/demo-state.json` the live demo agent produces — and the render
engine does the cutting, zooming and mixing. Every event traces back to a
real observation: a phantom zoom is a hard failure, a missed one is soft
(the moment plays at 1×). `demo-state.json` is written only through the
`record_*` tools; `pitch recording probe-video` resets it.

## Workflow

1. `pitch recording probe-video` — duration, resolution, audio; resets the session.
2. `pitch recording transcribe-video` — the narration is the prior for WHERE actions are in
   time. If the service is unreachable, continue visual-only and say so.
3. `pitch recording detect-key-moments` — scene cuts, independent of speech.
4. Build candidate windows by correlating transcript and cuts:
   - narration leads or lags the action by 1–3s: pad ~2s before the phrase,
     ~3s after; merge overlapping windows.
   - people act without narrating: an unmatched cut is still a candidate.
   - people narrate without acting ("you could also click…"): if nothing is
     visible, emit nothing.
   - self-corrections: the LAST stated intention is what happened.
5. `pitch recording inspect-frames` each window (independent — several in parallel); pass
   `question` when the narration is vague. `actionFound=false`: skip, or
   widen once and retry, never twice. `confidence < 0.5`: skip.
6. Emit events from `actionTimeSec` and `bbox`:
   - `click` / `fill` → `pitch recording record-zoom-in` with the bbox, then `pitch recording record-click`
     at its centre, same time.
   - `navigate` → `pitch recording record-zoom-out` at that time, so the new page shows in
     full before any later zoom.
   - `result` (a chart updating, a modal, a list) → `pitch recording record-zoom-in` on the
     result's bbox; no click.
7. `pitch recording edit-render` when the event list is ready, then reply with
   the URL and actual runtime. Use `pitch media review` on an existing recording
   only for a specific unresolved concern, not as a routine paid gate. Keep
   intentional pauses; runtime is approximate unless explicitly exact or capped.

## Camera discipline

Zoom is a spotlight. Skip login forms, cookie banners, nav chrome and loading
screens even when clicked; routine steps (scrolling, an expected menu) can
play at 1×. Re-zooming while zoomed **pans** — for adjacent fields
`pitch recording record-zoom-in` on each next field, no zoom-out between. Always
`pitch recording record-zoom-out` at a page change and when a section is done, keep events
in time order, and finish zoomed out a couple of seconds before the end.

All times are seconds into the uploaded video; `pitch recording inspect-frames`'
`actionTimeSec` is authoritative — never hand-estimate. For this camera-polish
workflow, dead-air trimming is the render's job; your events say what to protect.
An explicit request to trim a source range uses `pitch media ffmpeg` instead.

## In the studio

The upload is at `recording/upload.<ext>` (the turn context has the exact
path). Do not interview the user. The studio previews the newest render in
`renders/`; later turns apply the requested change and `pitch recording edit-render` again:
- add or move a zoom: re-inspect the window, emit the event.
- remove or correct an event: `pitch recording probe-video` again (it resets the list;
  transcript, key moments and vision log survive), then re-emit the full
  corrected list in time order.
- product name / URL only touch the title cards, and "60fps" is
  `fps: 60`: pass them to `pitch recording edit-render`, nothing else changes.

Finish briefly with what changed, the URL and any unresolved limitation.
Artifacts: `recording/demo-state.json`, `recording/transcript.json`,
`recording/key-moments.json`, `recording/vision-log.jsonl`,
`renders/edit-<timestamp>.mp4`.
