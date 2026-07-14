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

- `list_assets` — returns the manifest at `recordings/assets/<session>/assets.json`. Lists every uploaded file, local paths, PDF page images, extracted text, and the count of targetable regions per page.
- `build_slideshow` — takes an ordered list of page/image paths (+ optional `title`) and writes a premium `recordings/slideshow.html`. Each page **region becomes a transparent, labelled hotspot** (an ARIA `button` whose label is the text on the page), so `zoom_in`, the cursor, and `annotate` can target specific fields. Returns a `file://` URL.
- `annotate` — draws a premium, animated call-out over a hotspot ref (or an explicit `rect` in %): `style` = `circle | box | underline | highlighter | arrow | spotlight`. Captured in the recording; pans/zooms with the page. Works on live web pages too.
- `clear_annotations` — removes all current annotations (also cleared automatically on slide change).

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
1. playwright-cli snapshot            # see labelled hotspot refs (e.g. button "Full Name")
2. narrate({ text: "First, your full name goes here.", focus: "e42" })
3. zoom_in({ target: "e42" })         # camera pans to the field
4. annotate({ target: "e42", style: "circle" })   # draw the ring as you talk
5. demo_bash({ command: "sleep 1.2" })            # let it land
6. clear_annotations()                # before the next point
```

Pick the style that fits: `circle`/`box` to call out a field, `highlighter`/`underline` for a line of text, `spotlight` to isolate one area on a busy page, `arrow` to point from elsewhere. Keep it sparse — one clear call-out per beat, never annotate in silence.

### Refs are per-slide — re-snapshot after every advance

The snapshot only returns hotspots for the slide **currently on screen**. The moment you `press ArrowRight`, the previous slide's refs are stale. Always `playwright-cli snapshot` again on the new slide before you `zoom_in`/`annotate` on it. Never reuse a ref from an earlier slide — annotating a stale ref is refused, and would otherwise draw the highlight on the wrong slide. The loop is: **land on slide → snapshot → call out its fields → advance → snapshot again**.

## Slideshow workflow

```
1. list_assets
2. Choose the page image paths in order (PDF pages from `pages`, or image `localPath`s).
3. build_slideshow({ slides: ["/abs/path/page-1.png", ...], title: "Demo Title" })
4. demo_bash({ command: "playwright-cli goto file:///path/to/recordings/slideshow.html" })
5. playwright-cli snapshot -> see the labelled region hotspots on the first page.
6. Walk the page with the call-out workflow above (narrate -> zoom_in -> annotate -> hold -> clear).
7. demo_bash({ command: "playwright-cli press ArrowRight" }) to advance; repeat per page.
8. When done, zoom_out if zoomed, then continue to a URL or end the demo.
```

## Advancing the slideshow

The generated slideshow responds to:
- `playwright-cli press ArrowRight`
- `playwright-cli click "#next"`
- `playwright-cli press Space`

Use `ArrowRight` as the default.

## Extracted PDF text

Each PDF asset includes a `text` field with the first ~8 KB of extracted text. Use it to plan narration and decide which pages to emphasise. Do not read the text aloud verbatim unless the user asked for a word-for-word reading — summarise and explain.

## Paths

Always use the absolute local paths from the manifest. The slideshow HTML uses `file://` URLs, so the images load directly from disk.

## Combining with URLs

If a URL is provided alongside assets, treat them as one continuous demo:

```
- Open slideshow, narrate key frames.
- zoom_out()
- demo_bash({ command: "playwright-cli goto <url>" })
- Continue the interactive demo on the live site.
```

## Logo capture

If the demo ends on a URL, still capture the product logo for the intro/outro cards per the base guidelines.

## Pacing reminders

- Narrate **before** advancing a slide, and narrate **while** you annotate — never draw a call-out in silence.
- Use `zoom_in` + `annotate` on specific region hotspots to make points land; `clear_annotations` before the next beat.
- Keep call-outs sparse: one clear annotation per point, not several at once.
- Do not let silence fall over a transition — keep talking through ArrowRight presses.
