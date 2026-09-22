---
name: demo-video
description: Prepare and record one continuous real product walkthrough, demonstrating actions while narrating. Use this for a live-site walkthrough even when uploaded PDFs or images are reference or supporting material. If the requested video presents those files or is built primarily from their content, read asset-demo instead. Also supports narrated PDF/image slideshows. Hands stopped footage to video-editing for post-processing.
---

# Demo recording

Choose from the requested video's subject, not merely from which files are attached.
Use this skill when a live product is the main subject. An uploaded PDF or image may
still supply facts, a script, brand guidance, requirements, or supporting visuals.
If the video should present those files themselves or be built chiefly from their
content, stop and read `asset-demo` instead.

The studio context supplies the URL, instructions, voice, uploads and sometimes
a voiceover script. A script is the narration's source of truth: split at
complete thoughts, preserve content, order and tone, and arrange demonstrated
actions around its explanation. Write connective words only where needed.

Make this feel like a person demonstrating a product while explaining it.
**One continuous take: record-start at the beginning, record-stop at the end.**
Capture runs in real time, including while you think. Narration and the matching
interaction should overlap, not alternate between a stationary spoken paragraph
and a silent click. Never end a turn with capture running.
Capture owns navigation, visible actions and synchronized narration. Camera
framing, zooms and other post-production effects belong to `video-editing`.

## Choose the recording scope

On the first actionable request, ask which workflow/depth only if the brief
leaves consequential choices open: quick tour, one complete workflow, setup
and first run. Use `ask_user`, offer the product's own workflows when known,
then end the turn and wait. Skip choices already settled or delegated. Do not
ask about voice, pacing, zooms or look, or ask once recording starts.

Choose the audience takeaway and the smallest real workflow proving it:
starting context → meaningful action → visible result. Draft connected spoken
thoughts before recording. Explain intent and consequence rather than every
click. Runtime is approximate unless explicitly exact/capped. Preserve required
coverage and approved storyboard content; let results register.

## Record, then hand off

1. **Prepare assets** when PDFs/images are attached: `pitch demo prepare-assets`.
   For mixed projects, lead with the app when files support its workflow; lead
   with slides when they are the main content.
2. **Storyboard** only if the user asked to review one before recording:
   `pitch demo storyboard-plan`, present it and end the turn. Later revisions
   use `pitch demo storyboard-save` with complete JSON. Every `emphasis.phrase`
   must appear in its narration; rects are within 0–100%, at least
   one scene enabled, all scenes narrated. Preserve `id`, `pageIndex` and
   `previewUrl`. Record only after the requested review is complete.
3. **Prepare the actual workflow without recording.** For a site, use
   `pitch demo browser-open --url <url>`, then `pitch demo bash` to snapshot and
   inspect the controls and starting state. Establish the real navigation route
   and the visible result that proves each requested step. Return to the starting
   view in this same browser. Do not trigger paid/destructive actions just to
   rehearse them. If ending a preparation-only turn, use `pitch demo browser-close`.
4. **Start once** with `pitch demo record-start` in the prepared browser (or
   `--url <url>` if already familiar with the workflow). For assets, start without
   a URL and follow **Prepared PDF/image recordings** below.
5. **Demonstrate while explaining.** Use `narrate --action` for the matching
   click or typing as speech begins (examples below). Snapshot after transitions,
   inspect the actual result, and continue the same take. Narrating “now export”
   is not a substitute for showing the export action and its result. Complete
   the requested workflow; do not replace missing interactions with generic
   narration. Keep useful reading holds for the editor.
6. **Stop once**, after the final visible result and closing explanation, with
   `pitch demo record-stop`. It waits for the final speech to finish. Check it
   actually stopped: a first missing-page warning can leave capture live.
   Complete missing pages when possible; if genuinely impossible, call stop again
   and report the gap.
7. **Post-process** by reading [video-editing](../video-editing/SKILL.md).
   `pitch demo source` prepares a new uncut MP4 with synchronized narration/SFX
   and source-time narration beats. Carry forward the brief, approved storyboard
   and recording notes. The shared skill owns editing, rendering and publication.
   The raw `recording/demo.webm` alone may have no narration. If the user asked
   only for raw capture, deliver the synchronized source without adding an edit.

## Recover within the take

A missing/stale ref is a reason to snapshot again, not restart recording. Read
the current snapshot, select the correct control by its actual label and retry
the step once. Verify its visible outcome before continuing. If still blocked,
inspect the specific error and report the gap rather than repeating the same
attempt or pretending the action succeeded. For a hard browser failure, stop
the damaged take and report what could not be recorded.

Do not create exploratory Python/shell scripts that wrap snapshots or single
clicks in record-start/record-stop or `finally: record-stop`. Use the individual
host commands and inspect their results. Commands return structured results:
an error, missing target, or unchanged page is not success. Never swallow errors,
guess the first button, reuse refs across sessions, or replay a batch of refs
through navigation. Keep the preparation browser or take open while debugging.
Use browser-open for inspection after capture, never a throwaway new recording.

## Driving the page

Use `pitch demo bash --command '<playwright-cli command>'`. It runs on the host,
already attached to the preparation/recording browser over CDP. The VM has no browser.
Never call `playwright-cli open`.

Useful commands inside that host tool:
`goto <url>` · `snapshot` · `click e53` · `press ArrowRight` · `hover e4` ·
`select e9 "v"` · `eval "el => el.currentSrc || el.src" e53` ·
`screenshot '<selector>' --filename recording/detail.png` ·
`tab-new <url>` / `tab-select 0`.

Refs come from snapshots and are per page state. Snapshot after navigation
or slide advance; never reuse stale refs. There is no Playwright wait command;
use a short host `sleep` after navigation if needed. Browser size is 1920×1080.

- **Forms:** `pitch demo fill-field --target <ref> --text <text> [--submit]`
  visibly types the value; do not use `playwright-cli fill`.
  Keep fields visible and allow completed values to read.
- **Popups:** dismiss with a plain click.
- **Narration:** `pitch demo narrate --text "<complete thought>"`. This generates
  the clip, schedules it at the current capture time, and returns **without
  waiting for the speech to end**. Continue interacting during that interval.
  Audio is muxed by `demo source`; the live browser itself does not play it.
  The next narration waits for the preceding line, so voices do not overlap.
  For an offscreen subject, `--focus <ref>` scrolls it to center before the line.
  Explain what the viewer can actually see; broad context need not have a label.

Use one grounded action with the narration to avoid a model round-trip between
the start of speech and the gesture. These refs are examples: replace them with
refs from the current snapshot.

```sh
pitch demo narrate --text "Choose the report to see its breakdown." --action '{"command":"click e53"}'
pitch demo bash --command snapshot
pitch demo narrate --text "Enter a name so the report is easy to find later." --action '{"target":"e72","text":"Weekly usage"}'
```

Continue related clicks, typing or scrolling while the line is active. Use
`pitch demo narration-wait` only when the current subject needs to stay visible
until the explanation ends; do not insert it before every action. Verify the
result before describing it as successful. If a page loads slowly, retain the
trigger and first useful response and shorten the wait during editing. Align
the narration and demonstrated action in the final cut; never cut away required
steps just to match a target duration.

Think on a stable, complete view rather than an open menu or half-filled form.
Brief actions/transitions can be silent. The shared editor can shorten idle
holds; recording itself does not automatically remove them. Do not narrate
production choices or fill every movement with speech.

## Prepared PDF/image recordings

`pitch demo list-assets` → `pitch demo build-slideshow --transition fade|slide`
→ navigate to its returned HTTP URL with `pitch demo bash`. Never use `file://`
or create a server yourself. Show every prepared page in manifest order,
including cover, dividers and closing, unless an approved storyboard specifies
enabled scenes. Let runtime follow required coverage rather than rushing speech.
PDF text may be empty or wrong. OCR region IDs such as `p0r1` are manifest IDs,
not DOM refs.

**Gemini-first, from rendered pixels.** On every page, before narrating, call
`pitch demo analyze-slide`, even when text/OCR is empty. With an approved
storyboard, validate the page and follow its narration/boxes; otherwise use the
analysis summary and confidence-gated points. For a live callout,
use `pitch demo narrate --text "<line>" --emphasis '<JSON>'`, with its rectangle,
`coordinateSpace: "viewport"` and style. Put the highlighted statistic near the **start**
of the line so its callout and speech coincide. `pitch demo ground-region`
can retry a box/find a target: use only `found=true`; successful grounding is
automatically consumed by the next narration. OCR with `coordinateSpace: "page"`
is the fallback. If neither is reliable, narrate the cautious summary without
a guessed box.

Styles: `highlighter`/`underline` for text, `circle` for compact items, `box`
for blocks, `bracket` for groups, `pulse` for payoff/warning, `arrow` for direction,
`spotlight` sparingly. One callout per beat. These live annotations can be baked
into the capture; do not duplicate them during post-processing.

Between points on the same page, wait for the current line before clearing its
callout. After **all narration for the page** finishes, advance to the next page with
`pitch demo bash --command 'press ArrowRight'`. The tool waits for speech and
clears transient annotations automatically. Snapshot and analyze
the new page after the transition. Never batch advances. On the final page,
hold through the closing narration and stop instead of advancing.
Divider pages still need a brief explanation; no filler narration is required.

An `APPROVED STORYBOARD REVISION` from record-start overrides narration planning.
Follow enabled scenes in page order and speak narration verbatim, splitting only
at emphasis boundaries so each chunk carries its approved emphasis. Use approved
rectangles, styles and coordinate spaces. `build-slideshow` reads the approved
fade/slide transition automatically; its manual flag is `--transition`. A legacy
zoom transition is captured as a fade and passed as an editing intention instead.
Still analyze each page to check the source; do not silently replace reviewed
narration/boxes. Carry any approved camera intentions to the editor.

## Later turns

If context says capture is LIVE, inspect its current state and continue the same
take when the request is to finish the walkthrough. Stop only when it is complete,
the user asks to stop, or the browser has irrecoverably failed. For an existing-video edit,
read `video-editing` and reuse the selected source or saved plan. Length, pacing,
camera, audio and look changes are editing work. Record a new take only when
required actions/content are missing from the footage, with
`record-start --retake-reason "<specific missing step or failed capture>"`.
Prepare the corrected route before starting that take; do not repeat an unchanged
failing approach. Storyboard targets such as `[1] scene 3 "Pricing" · emphasis 2
"annual plan"` are 1-based.
