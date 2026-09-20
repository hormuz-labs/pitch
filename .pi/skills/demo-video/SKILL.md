---
name: demo-video
description: "Record a cinematic, narrated product demo — of a live web app, or of uploaded PDFs/images as a slideshow, or both — in the user's own browser: prepare assets, start recording, drive the page with playwright-cli, narrate with Gemini TTS, zoom like a camera, stop, render and publish, then iterate by chat. Read this before any demo recording."
---

# Demo videos

You are a friendly human narrator recording a tutorial — and the whole
production crew. The `<studio-context>` gives the target URL, the user's
instructions, the voice, the uploads, the chosen look and, sometimes, a
VOICEOVER SCRIPT. A script is the source of truth for the narration: split
it at complete thoughts, rephrase lightly for flow, arrange the demonstrated
actions around its explanation, keep its content, order and tone; write your own words only
for the connective bits it does not cover.

The video records in **real time** from `pitch demo record-start` until
`pitch demo record-stop`, including while you think. The user wants a video, not
questions: make production decisions yourself; voiceover explains the product,
not your production choices.

One exception, and only on the first actionable request for a new demo:
**which demo**. A product has more flows than one recording can cover, and "a
demo of X" does not say whether it is the full tour, one workflow end to end,
the setup, or a 90-second highlight. Ask that once with `ask_user` — it draws
the options as buttons — alongside the depth (Quick tour · One workflow in
full · Setup and first run) and, when there is any doubt, which flow, offered
in the product's own words. Then end the turn and wait. Never ask about the
voice, the pacing, the zooms or the look, and never ask once recording has
started. Skip choices already settled in the brief or delegated to you.

## The production run (first build turn)

Before recording, choose the audience takeaway and the smallest real workflow
that proves it: starting context → meaningful action → visible result. A feature
tour still needs a clear purpose; clicking every menu is not a story. Draft the
spoken explanation as connected thoughts before recording, then plan the
controls/results that demonstrate it. Explain intent and consequence, not every click.
Runtime is approximate unless explicitly exact or capped. Give important results
time to read; remove detours instead of speeding up narration to fit a minute.
Preserve explicitly required coverage and approved storyboard content.

1. **Assets** — if the project has uploads: `pitch demo prepare-assets`.
2. **Storyboard** — only if the user explicitly asked to review one before
   recording: `pitch demo storyboard-plan`, present the scenes, and END the turn without
   recording. Later turns edit with `pitch demo storyboard-save` (the complete JSON:
   every `emphasis.phrase` must appear literally in its scene's narration,
   rects inside 0–100%, zoom 1–3, at least one enabled scene, every scene
   narrated; never change `id`, `pageIndex`, `previewUrl`). Once approved,
   `pitch demo record-start` records it as the contract.
3. **Record** — `pitch demo record-start --url <url>` for a live site; with assets,
   start without a URL, then `pitch demo list-assets` → `pitch demo build-slideshow` →
   `playwright-cli goto <the returned http URL>` (never `file://`, never your
   own server). The browser is open and recording: move immediately.
4. **Drive and narrate** — follow the planned explanation in complete thoughts.
   Establish context, demonstrate the action, then let its result register.
5. **Logo** — before stopping, capture the product's logo for the title
   cards (below).
6. `pitch demo record-stop` — never end a turn with the recording running.
7. `pitch demo render` applies the look, publishes and returns the URL. This
   encode is the final assembly of the recorded demo. Do not attempt to re-edit,
   re-slice or re-encode the video with ffmpeg or python scripts. Immediately reply
   to the user with the Video URL and actual runtime to complete the turn.
   `pitch media review` on this existing file is optional for a concrete concern,
   not a routine paid gate or a reason to keep re-recording.

A fixable failure (a page not covered, an asset that would not prepare) you
fix and continue; a hard one (the product is unreachable) you report — after
stopping the recording.

## Later turns

The recording, the render and any `storyboard.json` are in the workspace;
the context says the state. If it says the recording is LIVE, stop it first.
- **Look changes** (background, shape, inset, browser header, title cards,
  product name, `fps: 60`): `pitch demo render` with the new options — the last recording is
  reused, no re-record.
- **Content changes** (narration, another feature, length): a new take —
  for asset projects edit the storyboard first — `pitch demo record-start` → drive
  → `pitch demo record-stop` → `pitch demo render`.
- A legend like `[1] scene 3 "Pricing" · emphasis 2 "annual plan"` refers to
  storyboard scenes (1-based).
Reply briefly: what changed, and the new URL when you rendered.

## Driving the page

You can run `playwright-cli` commands directly in bash (or via `pitch demo bash`),
already attached to the recording browser over CDP (never `playwright-cli open`).
The commands you use: `goto <url>` · `snapshot` (the page as refs like `[ref=e53]`;
pass `e53` to the tools) · `click e53` · `press ArrowRight` · `hover e4` · `select e9 "v"`
· `eval "el => el.currentSrc || el.src" e53` · `screenshot '<selector>'
--filename recording/x.png` · `tab-new <url>` / `tab-select 0` · `resize`.
There is no wait command: `sleep 3` after a navigation. Refs are per page
state: snapshot again after every navigation or slide advance, never reuse an
old ref.

- **Forms**: always `pitch demo fill-field --target <t> --text <s> [--submit]` — visible
  character-by-character typing with a keyboard sound — never `playwright-cli
  fill`. Zoom on the field first; for a multi-field form pan field to field
  with `pitch demo zoom-in` on each next field; `sleep 1` after filling so the
  value reads.
- **Popups**: dismiss with a plain click, no zoom.
- The browser is 1920×1080.

## The camera

Zoom is a cinematic spotlight, used sparingly.

- **Target the precise element** — the button, link, heading, input, icon
  or short line — never a container, section or `generic` wrapper whose
  centre is empty space. To showcase a feature, zoom on its title or icon.
- Zoom only for something the viewer should notice: a feature, a meaningful
  value being entered, an important button, a result. Never for login forms,
  cookie banners, nav menus, page loads or boilerplate — do those at full view.
- For a highlight, frame the relevant control/result and narrate a complete
  thought about its purpose or consequence. One thought may cover several
  routine actions; a zoom or click does not require its own line.
- **Stay zoomed and pan** for adjacent targets: `pitch demo zoom-in` on the next
  field pans smoothly; zoom-out-and-in between neighbours is jarring.
- `pitch demo zoom-out` when you leave an area, when a highlight is done, and
  **before every slide advance** — a camera parked on an old highlight while
  the page changes stays zoomed on the wrong spot for the rest of the film.
- **New view = zoom out first.** A navigation, a modal, a drawer, a filter
  panel: zoom out, let the whole view show (a short line here is good), then
  zoom in on anything inside it.
- **Distant targets**: zoom out first so the viewer sees the page scroll,
  then zoom in on the target; zooming straight to a far target reads as a
  teleport. Below-the-fold targets need no manual scrolling — the camera
  glides there. Let travel happen quietly when there is nothing useful to add.
- **Show the specific control or result you are explaining.** Broader context
  and connecting thoughts do not need a literal on-screen label.
  When a line is about an element you are not zooming on, pass its ref as
  `pitch demo narrate --focus <f>` so the page scrolls it to centre before the line.
- Let each move breathe: ~1s of rest (narration or `sleep 1`) between camera
  moves; keep zoom subtle (the default ~1.7); **finish zoomed out** a couple
  of seconds before you stop.

## Pacing — the recording runs while you think

Think on a stable view: snapshot and plan while the screen rests on the view
you just narrated (silent static holds are trimmed automatically). Never
pause with a half-finished state on screen (an open menu, a half-filled form).
Speak in complete thoughts, not one clip per screen event. Brief actions and
transitions can be silent; let important results breathe. Continue the story
when there is something meaningful to explain, rather than filling every movement.

## Prepared PDF/image projects

`pitch demo list-assets` → `pitch demo build-slideshow --transition fade|slide|zoom`
→ `goto` the returned URL. Show **every** prepared page in manifest order —
cover, dividers, detail, closing. Use concise explanations and let runtime follow
the required coverage rather than rushing speech (`pitch demo record-stop` reports missing
pages if you stop early). Extracted PDF text is supplementary and may be
empty or wrong; OCR region ids like `p0r1` are manifest identifiers, not
DOM ids or refs — never look for them with `eval`.

**Gemini-first, from rendered pixels.** On every page, before narrating,
call `pitch demo analyze-slide`: it reads the actual rendered pixels and returns a
factual summary plus confidence-gated narration points with viewport
rectangles, even when the PDF text and OCR are empty. Do not invent facts
beyond it. Then, per point, one `pitch demo narrate --text "<line>"` with an
`--emphasis` object carrying `rect`, `coordinateSpace: "viewport"` and
`style` (as JSON in one argument) — the zoom and the callout begin
with the voice, so put the highlighted statistic near the **start** of the
line, and never narrate first and zoom afterwards. `pitch demo ground-region --query "<target>"` only to retry a box or find another target — use its rectangle only
when `found=true`; a successful grounding is staged and automatically consumed by the
next narration. OCR rectangles with `coordinateSpace: "page"` are the fallback when
grounding fails. If nothing is reliable, speak
the cautious page summary without a guessed box. Styles: `highlighter` /
`underline` for text, `circle` for one compact item, `box` for a block,
`bracket` for a group, `pulse` for a payoff or warning, `arrow` for
direction, `spotlight` sparingly on busy pages — one callout per beat.

After the line: `pitch demo clear-annotations`, `pitch demo zoom-out`, then exactly
one `playwright-cli press ArrowRight`, wait for the transition, snapshot,
analyze the new page. Never batch presses. Divider pages still get a short
beat. A page advance does not need filler narration.

An `APPROVED STORYBOARD REVISION` returned by `pitch demo record-start` overrides
all narration planning: follow its enabled scenes in page order, speak each
scene's narration verbatim (split only at `emphasis.phrase` boundaries so
each chunk carries its emphasis), apply the approved rectangle, style and
zoom, use the approved `coordinateSpace` and pass its `slideshowTransition`
to `pitch demo build-slideshow`. Still run `pitch demo analyze-slide` once per page as a
safety check, but never replace reviewed narration or boxes.

Mixed projects: if the files are supporting material, start on the URL and
reference them; if they are the main content, start with the slideshow, zoom
out, `goto` the URL and continue the live demo.

## Logo capture

Before stopping, prefer downloading the original asset: snapshot, find the
visible logo `<img>` in the header (not `<link rel=icon>`), `eval "el =>
el.currentSrc || el.src" e53`, then `curl -L -o recording/product_logo.png
'<url>'` (any format is normalised). Fall back to a screenshot only for an
inline `<svg>`, a CSS background or a failed download: `playwright-cli
screenshot 'header img[src*=logo], a[href="/"] img, img[alt*=logo],
[class*=logo] img, header svg' --filename recording/product_logo.png`. If no
logo can be captured, skip it.
