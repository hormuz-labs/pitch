# Visual QA Loop for PDF Presentations

The QA process now runs in two automated gates inside `pdf-builder.js`:

1. **DOM QA** — structural checks on the rendered HTML before PDF generation.
2. **Visual QA** — screenshot-based inspection of each slide after PDF generation.

Both gates are compulsory. The PDF is not finalized until DOM QA passes; visual QA is then used for subjective/contrast verification.

---

## Gate 1 — DOM QA (automatic)

When you run `node pdf-builder.js`, the DOM QA step executes immediately after the HTML is rendered and images/charts have loaded. It inspects every `.slide` element in the browser and writes a report to `./qa-report.json`.

### Detected issues

| Issue | Severity | What triggers it |
|---|---|---|
| **TEXT_OVERFLOW** | critical | Element `scrollHeight > clientHeight` or `scrollWidth > clientWidth` |
| **IMAGE_MISSING** | critical | `<img>` has no `src`, failed to load (`naturalWidth === 0`), or is not `complete` |
| **LAYOUT_BREAK** | critical | Slide has zero width/height, or no `.slide` elements exist |
| **CONTRAST_WARNING** | warning | Text/background contrast ratio below 4.5:1 |
| **PLACEHOLDER_TEXT** | warning | Slide still contains dummy text like "PRESENTATION TITLE" or "Subtitle goes here" |

### Behavior

- If any **critical** issue is found, `pdf-builder.js` exits with code `1` and **does not generate the PDF**.
- If only **warnings** are found, the PDF is generated and the warnings are logged for review.

### Required agent action

After every `node pdf-builder.js` run:

1. Read `qa-report.json`.
2. Fix every `critical` issue.
3. Review `warning` items and fix any that affect slide quality.
4. Re-run `node pdf-builder.js` until DOM QA passes.

---

## Gate 2 — Visual QA (automatic render, manual inspection)

After DOM QA passes, `pdf-builder.js` captures a high-resolution PNG of every slide and saves them to `./qa-renders/slide_n.png`.

Inspect each image for these defects:

1. **TEXT_OVERFLOW**: Text hitting the bottom margin (Check slide 2/Agenda specifically).
2. **IMAGE_MISSING**: Images that failed to load (leaving a colored box).
3. **CONTRAST**: White text on light image backgrounds (Needs a darker overlay).

---

## Gate 3 — Rapid Patching

If a defect is found in either gate, edit `pdf-builder.js`:
- **Overflow**: Reduce `font-size` in the CSS section (Line 124) or prune text.
- **Contrast**: Increase the opacity of `rgba(0,0,0,0.4)` to `0.6` or higher in the template.
- **Images**: Verify the image path or use a different keyword.
- **Placeholder text**: Replace dummy strings with real content.

---

## Final Check

Re-run the builder. Once:
- `qa-report.json` shows `passed: true`, and
- all PNGs in `qa-renders/` pass your visual check,

the PDF is ready for delivery.
