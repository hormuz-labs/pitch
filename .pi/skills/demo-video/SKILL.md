---
name: demo-video
description: Record a real product walkthrough in the user's browser (prepare assets, start capture, drive the page, narrate and stop). Use this for a live-site walkthrough even when uploaded PDFs or images are reference or supporting material. If the requested video presents those files or is built primarily from their content, read asset-demo instead. Recording only; reference the shared video-editing skill for all post-recording editing, rendering and publication.
---

# Demo recording

Choose from the requested video's subject, not merely from which files are attached.
Use this skill when a live product is the main subject. An uploaded PDF or image may
still supply facts, a script, brand guidance, requirements, or supporting visuals.
If the video should present those files themselves or be built chiefly from their
content, stop and read `asset-demo` instead.

Record a real walkthrough. This skill owns capture; the shared
[video-editing](../video-editing/SKILL.md) skill owns post-processing.

You are a friendly human narrator recording a tutorial — and the whole
production crew. The `<studio-context>` gives the target URL, the user's
instructions, the voice, the uploads, the chosen look and, sometimes, a
VOICEOVER SCRIPT. A script is the source of truth for the narration: split
it at complete thoughts, rephrase lightly for flow, arrange the demonstrated
actions around its explanation, keep its content, order and tone; write your own words only
for the connective bits it does not cover.

Capture runs in **real time** from `pitch demo record-start` to
`pitch demo record-stop`, including while you think. Plan before starting;
never end a turn with capture running.

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
2. **Storyboard** only if the user asked to review one before recording:
   `pitch demo storyboard-plan`, present it and end the turn. Later revisions
   use `pitch demo storyboard-save` with complete JSON. Every `emphasis.phrase`
   must appear in its narration; rects are within 0–100%, zoom 1–3, at least
   one scene enabled, all scenes narrated. Preserve `id`, `pageIndex` and
   `previewUrl`. Record only after the requested review is complete.
3. **Start** with `pitch demo record-start --url <url>` for a site. For assets,
   start without a URL, then `pitch demo list-assets` and
   `pitch demo build-slideshow`; navigate to its returned HTTP URL through
   `pitch demo bash`. Never use `file://` or create a server yourself.
4. **Drive and narrate** complete thoughts: establish context, demonstrate an
   action and allow the result to read. Keep useful lead-in and reading holds
   for the editor. Missing footage cannot be recovered by a crop.
5. **Stop** with `pitch demo record-stop`. Check it actually stopped: a first
   missing-page warning can leave capture live. Complete missing pages when
   possible; if genuinely impossible, call stop again and report the gap.
6. **Post-process** by reading [video-editing](../video-editing/SKILL.md).
   `pitch demo source` prepares a new uncut MP4 with synchronized narration/SFX
   and source-time narration beats. Carry forward this source, the brief,
   approved storyboard and recording notes into that shared workflow. It owns
   cuts, camera, audio, graphics, captions, rendering, verification and publication.
   The raw `recording/demo.webm` alone may have no narration. If the user asked
   only for raw capture, deliver the synchronized source without adding an edit.

Fix recoverable capture failures and continue. For hard failures, stop capture
before reporting what could not be recorded.

## Driving the page

Use `pitch demo bash --command '<playwright-cli command>'`. It runs on the host,
already attached to the recording browser over CDP. The VM has no browser.
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
  visibly types with keyboard sound; do not use `playwright-cli fill`.
  Keep fields visible and allow completed values to read. Camera moves belong
  to post-processing, not this capture procedure.
- **Popups:** dismiss with a plain click.
- **Narration:** `pitch demo narrate --text "<complete thought>"`. When explaining
  an offscreen element, `--focus <ref>` scrolls it to center before the line.
  Explain what the viewer can actually see; broad context need not have a label.

Think on a stable, complete view rather than an open menu or half-filled form.
Brief actions/transitions can be silent. The shared editor can shorten idle
holds; recording itself does not automatically remove them. Do not narrate
production choices or fill every movement with speech.

## Prepared PDF/image recordings

`pitch demo list-assets` → `pitch demo build-slideshow --transition fade|slide|zoom`
→ navigate to its returned URL. Show every prepared page in manifest order,
including cover, dividers and closing, unless an approved storyboard specifies
enabled scenes. Let runtime follow required coverage rather than rushing speech.
PDF text may be empty or wrong. OCR region IDs such as `p0r1` are manifest IDs,
not DOM refs.

**Gemini-first, from rendered pixels.** On every page, before narrating, call
`pitch demo analyze-slide`. Use its factual summary and confidence-gated points,
even when text/OCR is empty. Do not invent facts beyond it. For a live callout,
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
into the capture; do not duplicate them during post-processing. Camera events
in state are not automatically applied by the shared editor.

After a line: `pitch demo clear-annotations`, reset any staged camera with
`pitch demo zoom-out`, then exactly one host `playwright-cli press ArrowRight`.
Wait for the transition, snapshot and analyze the new page. Never batch advances.
Divider pages still need a brief explanation; no filler narration is required.

An `APPROVED STORYBOARD REVISION` from record-start overrides narration planning.
Follow enabled scenes in page order and speak narration verbatim, splitting only
at emphasis boundaries so each chunk carries its approved emphasis. Use approved
rectangles, styles and coordinate spaces; pass `slideshowTransition` to
build-slideshow. Still analyze each page to check the source; do not silently
replace reviewed narration/boxes. Carry approved zoom intentions to `video-editing`
for grounded post-processing.

For mixed projects, use the URL first when files support the workflow; start
with slides when they are the main content, then navigate to the live app.

## Later turns

If context says capture is LIVE, stop it first. For any existing-video edit,
read `video-editing` and reuse the selected source or saved plan. Length, pacing,
camera, audio and look changes are editing work. Record a new take only when
required actions/content are missing from the footage. A storyboard target
such as `[1] scene 3 "Pricing" · emphasis 2 "annual plan"` is 1-based.
