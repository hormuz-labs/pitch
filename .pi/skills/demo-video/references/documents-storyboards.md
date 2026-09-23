# Prepared PDFs, images and storyboards

Read only for document/image sequences. Use the [shared mechanics](capture-mechanics.md)
for browser transport and narration timing; an app workflow is not required.

## Prepare and optionally review

Prepare uploaded PDFs/images through the shared mechanics before requesting review.
Create a storyboard **only when the user asks to review one before recording**:
`pitch demo storyboard-plan`, present it, then end the turn. Revisions use
`pitch demo storyboard-save --json '<complete JSON>'`. Each `emphasis.phrase` must
appear in its scene's narration; rectangles must fit within 0–100%, at least one
scene must be enabled, and all scenes need narration. Preserve `id`, `pageIndex`
and `previewUrl`. Record only after the requested review is complete. Storyboard
targets such as `[1] scene 3 "Pricing" · emphasis 2 "annual plan"` are 1-based.

## Start the slideshow in the continuous take

For document-only capture, use `pitch demo record-start` without a URL. Then run
`pitch demo list-assets` → `pitch demo build-slideshow --transition fade`
and navigate to the returned HTTP URL with `pitch demo browser --command 'goto <url>'`.
The manual transition choices are `fade` and `slide`.
For a mixed take, use this slideshow sequence when reaching its document portion;
do not start another recording. Never use `file://` or create a server yourself.

Show every prepared page in manifest order, including cover, dividers and closing,
unless an approved storyboard specifies enabled scenes. Let runtime follow required
coverage rather than rushing speech. PDF text may be empty or wrong. OCR region IDs
such as `p0r1` are manifest IDs, not DOM refs.

### Approved storyboard contract

An `APPROVED STORYBOARD REVISION` returned by record-start overrides narration
planning. Follow enabled scenes in page order and **speak narration verbatim**,
splitting only at emphasis boundaries so each chunk carries its approved emphasis.
Use approved rectangles, styles and coordinate spaces. Do not rewrite approved
words to move a subject to the start of a line.

Build-slideshow reads the approved fade/slide transition automatically; its manual
flag is `--transition`. A legacy zoom transition is captured as a fade and passed
as an editing intention instead. Still analyze each page to check the source.
Do not silently replace reviewed narration/boxes if the page contradicts them:
report the discrepancy rather than inventing support. Carry approved camera
intentions and any unresolved mismatch to the editor.

## Analyze, narrate, hold, advance

**Gemini-first, from rendered pixels:** on every page, before narration, call
`pitch demo analyze-slide`, even when text/OCR is empty. With an approved storyboard,
validate the page and follow its narration/boxes; otherwise use the returned summary
and confidence-gated points. A failed analysis is not permission to guess a statistic.

For a live callout, use `pitch demo narrate --text "<line>" --emphasis '<JSON>'`.
The emphasis object contains `rect` with `leftPct`, `topPct`, `widthPct`, `heightPct`,
plus `coordinateSpace: "viewport"` for rendered-pixel grounding and a `style`.
This annotation appears at the **clip start**, not at an arbitrary later word.
For unapproved narration, put the highlighted statistic near the start of that
thought. For approved text, use only its permitted emphasis-boundary splits.
Exact phrase notes for later camera work remain separate from this live annotation.

`pitch demo ground-region --query "<precise visual target>"` can retry a box or find
a target. Use only `found=true`; successful grounding is automatically consumed by
the next narration. It must not silently override approved boxes. OCR rectangles
with `coordinateSpace: "page"` are the fallback. If neither is reliable, use a
cautious summary without a guessed box; if approved material is affected, report
the conflict rather than rewriting it.

Styles: `highlighter`/`underline` for text, `circle` for compact items, `box` for
blocks, `bracket` for groups, `pulse` for payoff/warning, `arrow` for direction,
`spotlight` sparingly. Use one callout per beat. Log baked-in annotations so the
editor does not duplicate them.

Between points on the same page, use `pitch demo narration-wait` before
`pitch demo clear-annotations`. After **all narration for the page** finishes,
advance once with `pitch demo browser --command 'press ArrowRight'`. The tool waits
for speech and clears transient annotations automatically. Snapshot and analyze
the new page after the transition; never batch advances. Divider pages still need
a brief explanation, without filler. Hold the final page through its closing
narration, then stop rather than advancing (or continue to the next app sequence
in a mixed take after speech finishes).

Log page order, exact spoken references, callouts and required reading/comparison
holds for the presentation handoff. Static, silent pages can be meaningful content;
do not prescribe screen dead-time cuts. Return to the lifecycle for source delivery
or the shared editor's presentation branch.
