---
name: ppt-enhancer
description: >
  Presentation enhancement skill. Triggers when the user uploads an existing PDF
  or PPTX file and wants it improved. Supports two modes: 'recreate' (full visual
  redesign with fresh Pinterest images and premium brand palette) and 'preserve'
  (keep the existing slide structure and embedded images, polish text and layout
  only). Always load this skill when job parameters contain enhanceMode = 'recreate'
  or enhanceMode = 'preserve'. The input file has already been parsed — a structured
  JSON outline exists at the path provided in parsedSlidesPath.
---

# PPT Enhancer Skill

End-to-end pipeline: uploaded PDF/PPTX → parse JSON → enhance content →
(recreate: fresh Pinterest images + Gemini fallback | preserve: extracted images) →
build high-fidelity PDF via HTML-to-PDF → QA loop.

---

## Global Execution Rules (MANDATORY)

1. **Always start by reading the parsed slides JSON** from `parsedSlidesPath` (provided in job parameters).
2. **Never invent facts** — if `enhanceMode = 'recreate'`, run mandatory web search grounding before writing any slide content.
3. **NEVER leave dummy text** — Replace or completely remove any default placeholders from the `pdf-builder.js` template (like "PRESENTATION TITLE", "Subtitle goes here", "Presenter Name", "Month Year", or "Untitled"). Every field in `CONFIG.slides` must have meaningful, context-aware content or be completely removed if unused by the layout.
4. **Never skip the Visual QA loop** — run it after every `node pdf-builder.js` call.
5. **Never mix modes** — apply strictly either the Recreate pipeline or the Preserve pipeline based on `enhanceMode`.
6. **All file paths must be verified** before use — use `ls` or `glob` to confirm images exist.
7. Follow Steps 0–9 in order.

---

## Quick Reference

| Step | What happens |
|------|-------------|
| 0 | Read `parsedSlidesPath` JSON — understand the original slide structure |
| 1 | Read `enhanceMode` and `enhancePrompt` from job parameters |
| 2 | **Recreate**: classify topic, run web search grounding, pick brand palette |
| 2 | **Preserve**: read `extractedImagesDir`, inventory available images |
| 3 | Write enhanced slide content for all slides |
| 4 | **Recreate**: generate Pinterest keywords per slide, fetch images |
| 4 | **Preserve**: map extracted images to slides; Pinterest-supplement if image is unusable |
| 5 | Map images to slides (mandatory file-existence verification) |
| 6 | Pick layout per slide from the standard layout pool |
| 7 | Build `pdf-builder.js` — copy from template, populate CONFIG |
| 8 | Run `node pdf-builder.js` — verify output.pdf + qa-renders/ |
| 9 | Visual QA loop — patch and re-run until PASS |

Shared files (inherited from ppt-generator):
- `../ppt-generator/pdf-builder-template.js` — base HTML→PDF builder
- `../ppt-generator/image-scraping.md` — Pinterest → Gemini image fetch script (Unsplash optional)
- `../ppt-generator/qa-loop.md` — Visual QA loop taxonomy
- `../ppt-generator/design-library.md` — brand palettes (used in RECREATE only)

---

## Step 0 — Load Parsed Slides

Read the parsed slides JSON file at the path stored in `parsedSlidesPath`:

```json
// Expected structure:
[
  {
    "slideNumber": 1,
    "title": "Introduction to AI",
    "bullets": ["AI is transforming industries", "Market size growing rapidly"],
    "extractedImages": ["../input-images/image1.png"]  // present only in preserve mode
  }
]
```

Store the parsed slides as your working outline. The total number of objects is the
slide count. Do not add or remove slides unless the `enhancePrompt` explicitly instructs you to.

---

## Step 1 — Read Job Parameters

Extract these from the job context:

| Parameter | Type | Description |
|-----------|------|-------------|
| `enhanceMode` | `'recreate' \| 'preserve'` | Which enhancement pipeline to follow |
| `enhancePrompt` | string | User's specific instructions (e.g. "make it a dark-tech pitch") |
| `parsedSlidesPath` | string | Absolute path to the parsed slides JSON |
| `extractedImagesDir` | string | Dir with extracted PPTX images (only in preserve mode) |
| `buildDir` | string | Output directory (e.g. `/tmp/ppt-{JOB_ID}`) |
| `jobId` | string | Unique job identifier |

---

## Step 2A — RECREATE Mode: Research & Theme

Only when `enhanceMode = 'recreate'`:

### 1. Topic Classification
Identify the topic type from the existing slide titles and the `enhancePrompt`:
`ENV | TECH | BIZ | SOC | HLTH | EDU | POL | ECO | ART | GEN`

### 2. Mandatory Web Search Grounding
Run Google searches for the presentation topic:
- `"[topic] latest statistics 2025 2026"`
- `"[topic] key trends research data"`
Compile facts. All stats on slides must come from this research.

### 3. Design Theme Selection
**MUST READ** `.opencode/skills/ppt-generator/design-library.md` first.
Pick the brand palette that best matches the topic type AND the `enhancePrompt` tone.
Copy `bg`, `primary`, `secondary`, `accent`, `font-display`, `font-body` into `CONFIG.theme`.

---

## Step 2B — PRESERVE Mode: Inventory Images

Only when `enhanceMode = 'preserve'`:

1. Run: `ls {extractedImagesDir}` to list available extracted images.
2. Build a mapping of filename → slide number by matching the original parsed JSON's
   `extractedImages` field. If a slide has no extracted image, mark it as needing Pinterest/Gemini fallback.
3. Use a **neutral design theme** that complements the original: pick a palette from
   `design-library.md` that is harmonious (not jarring) with the original content.
   Prefer `minimal-corporate` or `saas-clean` palettes to avoid clashing with varied image colors.

---

## Step 3 — Analyze and Plan

Before writing any content, you must explicitly analyze the parsed PDF JSON to understand the original narrative flow, identify gaps, and formulate a plan for enhancing the presentation. Write down this plan in your internal scratchpad or directly in the console. Do not skip this step!

## Step 4 — Write Enhanced Slide Content

For every slide in the parsed JSON:

1. **Keep title** — rewrite for punch (4–7 words, no padding words).
2. **Rewrite bullets** — apply `enhancePrompt` tone; replace any weak phrasing. Ensure `STAT` and `SPLIT-INFO` layouts are provided with the correct data structures (`stats` and `cards` arrays, not just `bullets`).
3. **Add missing data** — if `enhancePrompt` asks for stats/charts, add a `CHART-FULL` slide.
4. **Flag layout** — annotate each slide with a layout code (see layout pool below).

### Enhancement Rules
- Keep slide count the same as the input (unless `enhancePrompt` says otherwise).
- **NO dummy text**: Ensure all slide fields (`title`, `subtitle`, `body`, `bullets`, `cards`) contain actual content. If a layout requires a field but you have no content, pick a different layout. Never fall back to "Untitled" or empty placeholders.
- Banned phrases: "In conclusion…", "As we can see…", "It is important to note…"
- Every slide needs a visual element (image, chart, icon grid).
- At least one chart slide (`CHART-FULL` or `SPLIT-CHART`) if topic has real-world data.

### Tone Mapping from `enhancePrompt`
| Phrase in prompt | Apply tone |
|---|---|
| "professional", "corporate", "formal" | Professional |
| "startup", "pitch", "investors" | Sales Pitch |
| "casual", "friendly", "simple" | Casual / Conversational |
| "educational", "training", "academic" | Educational |
| Default (no keyword) | Match original slide tone |

---

## Step 5A — RECREATE Mode: Fetch Fresh Images

Read `.opencode/skills/ppt-generator/image-scraping.md` for the full Playwright script.

Generate a **15–30 word rich descriptive prompt** and a **3–5 word concrete Pinterest search query**
for each slide that needs an image. Run:

```bash
node .opencode/skills/ppt-generator/reference/scrape_images.js \
  --topic "<topic>" \
  --keywords "<keyword1>" "<keyword2>" \
  --rich-prompt "<keyword1>::<rich image prompt>" \
  --rich-prompt "<keyword2>::<rich image prompt>"
```

Images save to `{buildDir}/images/{keyword}/`.

**MANDATORY**: After scraping, verify all downloaded files with `ls {buildDir}/images/{keyword}/`
before assigning paths to slides.

---

## Step 5B — PRESERVE Mode: Assign + Supplement Images

For each slide:
1. If `extractedImages` has a valid file → copy it to `{buildDir}/images/slide_{N}/image.jpg`
   and use that path.
2. Before copy, verify the extracted image is usable:
   - Skip if file is < 5 KB (likely a corrupt/placeholder).
   - Skip if extension is `.emf` or `.wmf` (Windows metafiles — not renderable in HTML).
3. If no usable extracted image exists for this slide → fall back to Pinterest scraping
   using a keyword derived from the slide title. The shared scraper will use Gemini image
   generation as final fallback (Unsplash is optional via `--engine-order`).

---

## Step 6 — Map Images to Slides

For each slide:
1. Verify image path exists on disk with `ls`.
2. Use `getBase64Image('path/to/image.jpg')` to embed permanently into the PDF.
3. Score criteria: subject match, color harmony, composition (same as ppt-generator).

Never hardcode a filename without verifying it first.

---

## Step 7 — Layout Pool

Use one layout per slide. Never repeat the same layout on consecutive slides.

| Layout Code | Best for |
|-------------|---------|
| `COVER` | Slide 1 — full-bleed image, transparent overlay |
| `SPLIT-L` | Text left 55%, image right 45% |
| `SPLIT-R` | Image left 45%, text right 55% |
| `STAT` | 2–4 key statistics with big numbers (must use `stats` array: `[{value, label, description}]`) |
| `SPLIT-INFO` | Badge + title + body + image + 3 info cards (uses `cards` array: `[{heading, text}]`) |
| `CHART-FULL` | Full-slide Chart.js chart |
| `SPLIT-CHART` | Text left + chart right |

**CRITICAL WARNING:** ONLY the layouts explicitly listed above are supported by the engine. Do NOT use `AGENDA`, `TIMELINE`, `QUOTE`, `FULLBLEED`, `COMPARE`, `ICON-GRID`, `METRICS-CARD`, or `CLOSING`. Using unsupported layouts will result in empty slides.

**Sequence rules:**
- Slide 1: always `COVER`
- Slide 2: always `SPLIT-L` or `SPLIT-INFO`
- Last slide: always `COVER` (reused as a closing slide with contact/summary info)
- No two consecutive slides with same layout

---

## Step 8 — Build PDF

```bash
# 1. Copy base template
cp .opencode/skills/ppt-generator/pdf-builder-template.js {buildDir}/pdf-builder.js

# 2. Copy DOM QA helper (required)
mkdir -p {buildDir}/reference
cp .opencode/skills/ppt-generator/reference/qa-dom.js {buildDir}/reference/qa-dom.js

# 3. Fill CONFIG in pdf-builder.js with:
#    - jobId: "{JOB_ID}"
#    - theme: (from design-library or neutral palette)
#    - slides: (from enhanced outline with image paths and layout codes)
#    - All images embedded via getBase64Image()

# 4. Install playwright if missing
cd {buildDir} && npm install playwright

# 5. Build (DOM QA runs automatically)
cd {buildDir} && node pdf-builder.js

# 6. Verify DOM QA passed
cat {buildDir}/qa-report.json

# 7. Verify outputs
ls {buildDir}/output.pdf
ls {buildDir}/qa-renders/
```

`pdf-builder.js` automatically runs **DOM QA** before generating the PDF. If critical issues (TEXT_OVERFLOW, IMAGE_MISSING, LAYOUT_BREAK) are detected, the build aborts and `output.pdf` is not created. Fix the reported issues and rerun.

---

## Step 9 — Visual QA Loop

Read `.opencode/skills/ppt-generator/qa-loop.md` for full commands.

```
LOOP:
  1. Read {buildDir}/qa-report.json and confirm "passed": true.
     If DOM QA failed, fix pdf-builder.js and rerun from Step 8.
  2. You MUST use the `read` tool on EVERY .png in {buildDir}/qa-renders/ to visually inspect them!
  3. Check: TEXT_OVERFLOW · IMAGE_MISSING · CONTRAST_ERROR · LAYOUT_BREAK · TYPO_CRITICAL
  4. PASS → exit loop
  5. FAIL → patch pdf-builder.js → cd {buildDir} && node pdf-builder.js → go to 1
```

---

## Step 10 — Exit

Once QA passes, confirm both files exist:
- `{buildDir}/output.pdf`
- `{buildDir}/output.html`

The worker detects these files and handles upload + job completion automatically.

---

## Files in This Skill

```
ppt-enhancer/
├── SKILL.md                          ← this file (pipeline for both modes)
└── scripts/
    └── parse_presentation.js         ← parses PDF/PPTX → structured JSON + image extraction
```

Shared files (from ppt-generator):
- `../ppt-generator/pdf-builder-template.js`
- `../ppt-generator/image-scraping.md`
- `../ppt-generator/qa-loop.md`
- `../ppt-generator/design-library.md`
