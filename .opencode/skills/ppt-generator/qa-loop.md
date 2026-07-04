# Visual QA Loop for PDF Presentations

The Visual QA Loop is integrated directly into the `pdf-builder.js`. It uses Playwright to capture high-resolution PNGs of every slide before the PDF is finalized.

---

## Step QA-1: Automated Rendering

When you run `node pdf-builder.js`, it performs the following:
1.  Renders the HTML content in a headless browser (1280x720).
2.  Captures a screenshot of each `.slide` element.
3.  Saves them to `./qa-renders/slide_n.png`.
4.  Generates the final `output.pdf`.

---

## Step QA-2: CRITICAL MANUAL INSPECTION

**WARNING: NEVER assume the slides are correct just because the script output says "SUCCESS". The script cannot detect visual layout breaks, overlapping text, or overflowing images!**

You MUST use your `read` tool to open and analyze the images generated in the `qa-renders/` folder (e.g., `read` tool with `filePath: /tmp/ppt-1234/qa-renders/slide_2.png`). Because you are a multimodal agent, passing the image path to your `read` tool will allow you to physically see the slide.

Inspect each image for these defects:
1.  **TEXT_OVERFLOW**: Text hitting the bottom margin or overlapping with headings/images (Check SPLIT and AGENDA layouts specifically).
2.  **IMAGE_MISSING**: Unsplash images that failed to load (leaving a colored box).
3.  **CONTRAST**: White text on light image backgrounds (Needs a darker overlay).

If you skip using the `read` tool on the `.png` files, you have FAILED the QA step.

---

## Step QA-3: Rapid Patching

If a defect is found, edit `pdf-builder.js` or the injected config:
-   **Overflow/Overlap**: Fix CSS bounds (e.g., `height: 100%`, `overflow: hidden`) or reduce text length.
-   **Contrast**: Increase the opacity of `rgba(0,0,0,0.4)` to `0.6` or higher in the template.
-   **Images**: Verify the image path or use a different keyword.

---

## Final Check
Re-run the builder. Re-read the new PNGs. Once all PNGs in `qa-renders/` pass your visual check via the `read` tool, the PDF is ready for delivery.
