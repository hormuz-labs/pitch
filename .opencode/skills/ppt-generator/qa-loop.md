# Visual QA Loop for PDF Presentations

The Visual QA Loop is now integrated directly into the `pdf-builder.js`. It uses Playwright to capture high-resolution PNGs of every slide before the PDF is finalized.

---

## Step QA-1: Automated Rendering

When you run `node pdf-builder.js`, it performs the following:
1.  Renders the HTML content in a headless browser (1280x720).
2.  Captures a screenshot of each `.slide` element.
3.  Saves them to `./qa-renders/slide_n.png`.
4.  Generates the final `output.pdf`.

---

## Step QA-2: Manual Inspection

Open the `qa-renders/` folder and inspect each image for these defects:

1.  **TEXT_OVERFLOW**: Text hitting the bottom margin (Check slide 2/Agenda specifically).
2.  **IMAGE_MISSING**: Unsplash images that failed to load (leaving a colored box).
3.  **CONTRAST**: White text on light image backgrounds (Needs a darker overlay).

---

## Step QA-3: Rapid Patching

If a defect is found, edit `pdf-builder.js`:
-   **Overflow**: Reduce `font-size` in the CSS section (Line 124) or prune text.
-   **Contrast**: Increase the opacity of `rgba(0,0,0,0.4)` to `0.6` or higher in the template.
-   **Images**: Verify the Unsplash URL or use a different keyword.

---

## Final Check
Re-run the builder. Once all PNGs in `qa-renders/` pass your visual check, the PDF is ready for delivery.
