---
name: asset-demo
description: Create polished demos from uploaded PDFs, images, and URLs. Use when the job includes assets or the user asks to make a demo from a PDF, images, or a mix of sources.
---

# Asset Demo Skill

Use this skill when the demo should be built from uploaded files (PDFs or images) or from a mix of files and URLs.

## When to load

- The user uploaded a PDF and asked for a demo.
- The user uploaded images and asked for a slideshow or storyboard.
- The user provided both a URL and files.

## Tooling

- `demo_list_assets` — returns the prepared manifest selected by `demo-config.json`. Lists every uploaded file, local paths, PDF page images, extracted text, and fallback OCR regions.
- `demo_build_slideshow` — writes `recordings/slideshow.html`, includes every prepared page in manifest order, and serves it at the returned localhost HTTP URL. `transition` is `fade | slide | zoom`. Each OCR region becomes a transparent labelled hotspot for fallback targeting.
- `demo_clear_annotations` — removes all current annotations (also cleared on page change).
- `demo_analyze_slide` — Gemini page understanding over the current rendered pixels. Returns a cautious summary plus confidence-gated narration points with viewport rectangles, even when extracted text and OCR are empty. Call once on every page before narration; results are cached by slide index.
- `demo_ground_region` — Gemini-first Agentic Vision grounding. It screenshots the current 1920×1080 rendered slide pixels and returns a confidence-gated viewport rectangle, including for scanned pages, charts, stylized type, or content without machine-readable text. A successful rectangle is staged and automatically consumed by the next narration on that slide.
- `demo_narrate.emphasis` — atomically zooms and draws a callout immediately before speech. It consumes staged Gemini grounding automatically; pass a current hotspot ref or OCR page rectangle only as a fallback.

Asset jobs use `.opencode/agents/demo-generator.md`, `.opencode/tools/demo-generator.ts`, and the normal demo renderer because the event/timeline contract is identical.

## What makes an asset demo premium

Narration over static pages is the floor, not the goal. A great PDF/image demo is **interactive and explanatory**: the camera moves to the exact field being discussed and a clean annotation calls it out while you narrate. Treat each page like a walkthrough of a real screen.

## Decision tree

1. **Only a PDF** → build a slideshow of the pages; walk through the key fields with zoom + annotate.
2. **Only images** → build a slideshow; call out the important parts of each frame.
3. **URL + PDF/images** → decide based on the instructions:
   - If the files are supporting material, start with the URL and reference the files.
   - If the files are the main content, start with a slideshow and then navigate to the URL.
4. **A form/document walkthrough (like an application form)** → this is the sweet spot: snapshot the slideshow, then for each field circle/highlight it and explain what goes there.

## Interactive call-out workflow (per point)

```
1. demo_analyze_slide                  # understand the rendered page, even without text/OCR
2. demo_narrate({
     text: point.narration,             # statistic starts the spoken beat
     emphasis: { rect: point.rect, coordinateSpace: "viewport", style: "circle" }
   })                                  # zoom + annotation start with the voice
3. demo_clear_annotations()           # after the narrated point
4. demo_zoom_out()                     # when leaving this area
```

Pick the style that fits: `circle`/`box` for one field, `highlighter`/`underline` for text, `bracket` for a group, `pulse` for a payoff/KPI, `spotlight` for one area on a busy page, and `arrow` for diagram direction. Keep it sparse — one clear call-out per beat, never annotate in silence.

### Gemini-first visual grounding

Call `demo_analyze_slide` on every page before narrating it, even when extracted text appears usable. Gemini inspects the rendered pixels and returns narration-ready visible facts, so scanned pages and charts do not depend on a machine-readable text layer. Use a returned high-confidence point and its viewport rect directly with `demo_narrate.emphasis`. Call `demo_ground_region({ query, style })` only to retry a box or locate another target; require `found=true`, then immediately narrate so the staged rectangle is consumed before speech. PDF text is supplementary context and OCR rectangles are geometry fallback only. If neither Gemini path yields a reliable point, explain only the cautious page summary without inventing geometry.

Manifest region IDs such as `p0r1` are data identifiers, not DOM IDs or Playwright refs. Do not search for or rewrite them with raw `playwright-cli eval`. Use the region's `leftPct`/`topPct`/`widthPct`/`heightPct` with `coordinateSpace: "page"`, or use the current snapshot's visible `e...` ref.

### Refs are per-slide — re-snapshot after every advance

The snapshot only returns hotspots for the slide **currently on screen**. The moment you `press ArrowRight`, the previous slide's refs are stale. Always `playwright-cli snapshot` again on the new slide before using a hotspot ref in `demo_narrate.emphasis`. Never reuse a ref from an earlier slide. The loop is: **land on slide → snapshot → call out its fields → advance → snapshot again**.

## Slideshow workflow

```
1. demo_list_assets
2. For a normal PDF video, keep every page in manifest order. A short duration means shorter narration per page, not fewer pages.
3. demo_build_slideshow({ transition: "fade" }) # includes all prepared pages
4. demo_bash({ command: "playwright-cli goto http://127.0.0.1:<returned-port>/slideshow.html" })
5. demo_analyze_slide -> understand the first page from its actual pixels before narration.
6. Walk the page with the atomic emphasis workflow above (analyze -> emphasized narration -> clear). The highlighted statistic must be near the start of the spoken line.
7. demo_bash({ command: "playwright-cli press ArrowRight" }) exactly once to advance; analyze and repeat for every page before narrating it, including pages with empty text/OCR and section dividers. Never batch presses or jump over pages.
8. When done, call `demo_zoom_out` if zoomed, then continue to a URL or end the demo.
```

## Advancing the slideshow

Advance only with one `playwright-cli press ArrowRight` command after narrating
the current page. This keeps the worker's page-coverage state synchronized with
what the browser displayed.

## Extracted PDF text

Each PDF asset may include a `text` field with the first ~8 KB of extracted text. Treat it as supplementary context only; it can be empty or disagree with the rendered layout. `demo_analyze_slide` is the narration source of truth. Do not read extracted text aloud verbatim unless the user requested a word-for-word reading.

## Paths

The slideshow tool maps prepared assets onto its localhost HTTP server. Use the returned slideshow URL exactly and never start an ad-hoc server.

## Combining with URLs

If a URL is provided alongside assets, treat them as one continuous demo:

```
- Open slideshow, narrate key frames.
- demo_zoom_out()
- demo_bash({ command: "playwright-cli goto <url>" })
- Continue the interactive demo on the live site.
```

## Logo capture

If the demo ends on a URL, still capture the product logo for the intro/outro cards per the base guidelines.

## Pacing reminders

- Narrate **before** advancing a slide, and use `demo_narrate.emphasis` so the zoom and annotation begin with the matching words — never after the sentence finishes.
- Use OCR rectangles with `coordinateSpace: "page"`; use Gemini-grounded rectangles with `coordinateSpace: "viewport"`; clear annotations before the next beat.
- Keep call-outs sparse: one clear annotation per point, not several at once.
- Do not let silence fall over a transition — keep talking through ArrowRight presses.
