---
name: asset-demo
description: "Create or revise a narrated demo video that presents uploaded PDFs or images, or is built primarily from their content, using a reviewable visual storyboard and page-grounded camera moves. An attached reference document alone does not select this skill. Do not use for slide-deck creation, document-only analysis, ordinary image edits, or a walkthrough whose primary subject is a live website."
---

# Asset demos

Turn uploaded PDFs or images into a camera-led explanation. The result may show
the pages directly or build its visual story from their content. Treat the rendered
pages as the factual and visual source; do not invent claims or use a live site
as a substitute for missing evidence.

This remains the current Pitch project and conversation. The visual editor and
chat both update `storyboard.json`; do not create another project or pipeline.

## Choose the next action from workspace state

- **No storyboard:** prepare the uploads and create a draft for review.
- **Storyboard exists:** revise the latest revision. Do not regenerate it or
  prepare the assets again unless the source uploads changed or the user asks
  for a fresh plan.
- **User asks to record, finish, or publish:** validate any pending storyboard
  changes, then record that revision as the production contract.

Route from what the user asked to make, not from the presence of an upload. A PDF
or image supplied only for facts, a script, brand guidance, requirements, or other
reference does not make the project an asset demo. Follow the skill for the requested
outcome; if a live product is the main subject, use `demo-video` instead.

## Draft and review

1. Run `pitch demo prepare-assets` when there is no prepared manifest or the
   uploads changed.
2. Run `pitch demo storyboard-plan`. It inspects the rendered pixels for every
   page and writes `storyboard.json` with narration, page previews, and emphasis
   rectangles.
3. Default to ending the turn after presenting the draft so the user can review
   it in Studio. Continue directly to recording only when the user already asked
   for an uninterrupted finished result or explicitly approved the current draft.

When a voiceover script exists, preserve its words and divide it at complete
thoughts; do not add claims to make it fit the pages.

## Revise from the editor or chat

A selected storyboard scene arrives as a numbered target. Change that scene
only unless the request is broader. Read the latest `storyboard.json` before a
chat revision, preserve untouched fields and scenes, then pass the complete
document to `pitch demo storyboard-save` with a short summary.

Preserve each scene's `id`, `pageIndex`, and `previewUrl`. The save gate also
requires:

- at least one enabled scene, with narration on every enabled scene;
- every `emphasis.phrase` to occur in that scene's narration;
- rectangles contained within 0–100%, and zoom between 1 and 3.

If the save reports a problem, fix that problem and validate again. Do not start
recording from an invalid or stale revision.

## Record the approved revision

1. Run `pitch demo record-start` without a URL. When a storyboard exists, this
   approves its current revision and returns the exact recording contract.
2. Run `pitch demo list-assets`, then
   `pitch demo build-slideshow --transition <approved transition>`, and open its
   returned HTTP URL with `playwright-cli goto`. Never use `file://` or start an
   ad-hoc server.
3. Visit enabled scenes in saved order. On every rendered page, call
   `pitch demo analyze-slide` before narrating. This verifies what the pixels
   show; it must not rewrite reviewed narration or geometry.
4. Speak approved narration verbatim. Split it only at `emphasis.phrase`
   boundaries so the matching spoken chunk carries that one saved emphasis.
   Clear annotations before the next beat, and advance exactly once per scene.
5. End zoomed out, then run `pitch demo record-stop` and `pitch demo render`.
   Return the published URL and actual runtime.

Never finish a turn while recording is live. If recording cannot continue,
attempt `pitch demo record-stop` before reporting the failure. Do not rebuild
this pipeline with ffmpeg.

## Visual grounding

`pitch demo analyze-slide` is the Gemini-first source for page understanding,
including scans and pages with empty or no machine-readable text. Its confident
rectangles use `coordinateSpace: "viewport"`; OCR or document rectangles use
`coordinateSpace: "page"` as fallback.

For an unreviewed scene, place the highlighted statistic near the start of its
spoken line and pass one atomic emphasis object with that chunk. Use
`pitch demo ground-region` only to repair or find a box after page analysis. A
result is usable only when `found=true`; its viewport box is staged and
automatically consumed by the next narration.

Prefer one focal callout per beat. Highlighter or underline suits text, circle a
compact item, box a region, bracket a group, pulse a payoff, arrow a direction,
and spotlight a busy page sparingly. When grounding is uncertain, narrate only
the cautious page summary without geometry.

## Editorial constraints

- Cover every enabled, required page. Meet a shorter runtime by tightening the
  narration, not by silently dropping required material.
- Explain meaning and consequence instead of reading the page verbatim.
- Preserve user-supplied scripts and reviewed storyboard content exactly.
- Keep page transitions quiet and deliberate rather than filling every change
  with speech.
