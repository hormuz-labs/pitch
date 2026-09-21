---
name: video-editing
description: Edit and post-process any existing video — screen recordings, camera footage, tutorials, interviews, gameplay, generated clips, rendered films, and social videos — using frame inspection, visually grounded zooms, reproducible timelines, audio treatment, captions, compositing, rendering, and quality checks. Read whenever a video file needs editing, directly or as a post-processing handoff from another skill.
---

# Video editing

Turn the user's intent into an evidence-based edit plan, render it, and inspect
the result. Adapt editorial decisions to the footage; the tools provide media
operations, not semantic judgment.

This is a **shared post-processing skill**, independent of how footage was made.
Another skill supplies the source files and brief, then references this skill.
It works equally on uploads, captured recordings, generated clips and rendered
videos. It does not record a browser or generate footage.

## Handoff from another skill

Carry forward source paths, the current brief, approved content, audio tracks,
timing notes and requested changes. Inspect the actual files before editing.
Do not restart discovery or ask for preferences already settled.

- `demo-video`: stop the recording, then `pitch demo source` supplies an uncut
  MP4 with synchronized narration/SFX and a source-time narration sidecar.
  The raw `recording/demo.webm` alone may have no narration. Recorded zoom/click
  events are evidence to check, not camera moves automatically applied by this
  editor. Preserve approved storyboard content and inspect its framing.
- `generated-video`: use the returned clip path; inspect its actual picture and
  audio before combining, trimming or treating it.
- Existing rendered films or uploads: use the named/selected file. When the
  request is to change an editable composition rather than process a video file,
  use its authoring skill. Do not flatten a live composition just to edit its source.

## Pi tools and paths

All media execution is through **host commands** in pi's `bash` tool:

```sh
pitch video --help
pitch video capabilities
pitch video probe --source uploads/recording.mp4
```

Use pi's `read`, `write` and `edit` tools for plans, notes and returned images.
There is no local DaVinci installation: do not run Python media scripts, pip,
FFmpeg, browser commands or network clients in the VM. The host commands own
those dependencies, cancellation and compute metering. Report an unavailable
host dependency rather than trying to install it.

Commands return JSON. Paths are workspace-relative, including `images[].path`;
open those PNGs with **`read` before making visual decisions**. Prefer contact
sheets, with up to eight timestamped frames per image. Shell output alone does
not show the images. See [references/cli.md](references/cli.md) for flags.

## 1. Establish intent and capabilities

- Check `pitch video capabilities` when beginning a new edit; reuse a known
  toolchain result in the same session.
- Identify sources, purpose, audience, length, aspect ratio, essential content
  and deliverables from the brief. Carry forward agreed pacing, zoom strength,
  reading holds and output settings. Ask only about missing choices that
  materially change the edit; explicit instructions override defaults.
- Preserve source composition, natural pacing and intelligible speech by
  default. Deliver H.264/AAC MP4. Avoid adding captions, transitions or color
  treatment without a reason in the brief; follow the studio's shared music
  guidance and respect requests for no music.
- Keep originals intact. Write each final to a new, human-readable name under
  `renders/`, and keep editable plans/notes under `edits/`.

## 2. Inspect the actual media

- `pitch video probe` each asset: note displayed dimensions, duration, rotation,
  frame rates, HDR status and audio tracks. Select the intended audio track.
- Follow [references/inspection.md](references/inspection.md): one overview
  sheet, batched unresolved moments, reuse inspected evidence. Every additional
  screenshot must resolve a named uncertainty. Stop sampling when action timing,
  framing and continuity are established.
- Keep one concise inspection log in clip `note` fields or an edit-notes file:
  content/action bounds, evidence paths, approved viewports, decisions and
  unresolved questions. For screen demos inventory meaningful interactions in
  scope, including URL entry, typing/submission, result selection, nested links
  and final actions; use this same log for planning and review.
- `pitch video analyze` finds candidate silence/black/scene intervals; these
  signals do not establish that an interval is disposable.
- If speech drives the edit, use a supplied transcript or
  `pitch media transcribe --file uploads/recording.mp4 --out edits/transcript.json`.
  Read it; check names, commands and UI labels against the footage. Transcription
  is a host whisper.cpp action, not a Python model installation.
- Never describe a frame as seen unless its image was opened and visible.
  A transcript is not evidence of visual coordinates. Without visual understanding,
  use user-supplied regions or keep the full frame.

## 3. Ground zooms in visual evidence

Read [references/zoom.md](references/zoom.md) when adding or changing camera
moves; it owns framing, continuity and interaction-timing rules.

- Select targets from inspected source frames. Specify `{x,y,width,height}`
  relative to the **full, auto-rotated, square-pixel source**, top-left origin;
  never measure against the whole contact sheet.
- `pitch video focus` once per distinct target/composition at final output
  dimensions. Open context and actual crop; check target, readability, clipping
  and context. Copy its returned `viewport` into `camera.viewport`. Reuse framing
  while the layout remains demonstrably stable.
- Emphasize requested targets and otherwise unreadable interactions. Center the
  intended control where bounds permit. Prefer stable holds or constant-scale
  pans on a stationary scene; a fixed crop is not a tracker.
- Settle before focused work and retain reading holds. Same-page actions normally
  use `exit: 0`; cross-page navigation requires full composition before its
  trigger and at the destination. Apply the reference's timing audit rather
  than adding separate screenshot passes.

## 4. Create and validate a plan

Read [references/plan.md](references/plan.md) for the exact version-1 JSON
contract and [references/editing.md](references/editing.md) for footage-specific
decisions.

- Write ordered clips. Trims use source seconds; camera moves and clip fades use
  clip-output seconds; overlays, captions, music and redactions use final time.
- Preserve complete words, qualifications, prerequisites, results and reading
  time. Shorten waits while retaining the trigger and first useful response;
  do not cut directly from input to a later result click.
- Speed changes, overlaps and cuts change the timeline. Run `pitch video validate`
  and use its returned timeline for captions and overlays; never reuse original
  transcript timestamps blindly. Revalidate after plan changes.
- Audit affected camera chains and interactions using the zoom reference, the
  validated timeline and inspection log. Calculate from observed action bounds;
  extract more frames only for unresolved visual facts.
- Prefer restrained motion and clean cuts. Cross-dissolves overlap picture AND
  audio; do not overlap dialogue unintentionally.
- Image/video overlays can carry B-roll, webcam, logos or prepared title graphics.
  Their audio is not mixed automatically. Keep important content unobscured.
- Redaction boxes use final-output coordinates. Inspect the whole affected
  interval; moving/zoomed content needs separately timed boxes where necessary.
- Fix validation errors and investigate warnings. Unknown keys are errors;
  do not invent plan capabilities.

## 5. Render, review, refine

- `pitch video render --plan edits/tutorial.json --preview` renders a draft.
  For long/complex edits test a short representative plan first. Preview covers
  the entire plan at reduced dimensions; it is not a time-range selector.
- `pitch video verify` the draft with the validated expected duration. Inspect
  `passed` and `checks`. Use one deduplicated rendered-review sample list from
  the inspection reference across all edit types. Source evidence and arithmetic
  do not replace rendered review.
- Check intelligibility, word boundaries, sync, clipping, music balance and
  artifacts when audio review is available. `pitch media review --purpose film`
  can investigate a concrete perceptual concern; it is optional, not a routine
  paid gate. Metadata/sample peaks do not substitute for listening, and never
  claim listening that did not happen.
- Fix detected issues and review the affected sequence. Once checks pass, render
  the final, verify it, and inspect representative final-resolution text/detail.
  Reuse passed draft conclusions for an unchanged plan. Expand review only for
  discrepancies or unresolved checks; no extra approval round unless requested.
- Publish the checked final with `pitch media publish --file renders/tutorial-v1.mp4
  --label "Edited tutorial"`. Report the result URL, actual runtime, plan path,
  a short account of the edit and any unresolved review item. Distinguish
  technical checks from visual or listening review.

## Small edits and operations outside the plan

This skill still applies when the whole request is one trim, level change or
crop. Use `pitch media probe` and `pitch media ffmpeg` for a direct operation
when that is simpler; inspect, verify and publish the new result. Honor selected
time ranges precisely. A baked mixed track does not expose music separately:
use the original stems/plan when only the bed should change.

Read [references/extensions.md](references/extensions.md) for unsupported work.
Use documented host tools for reproducible preprocessing. Never claim tracking,
OCR, stabilization, generative editing, HDR grading or NLE project support unless
an actual tool supplies it.
