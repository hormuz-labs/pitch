---
name: template-ppt
description: >
  Template-aware PDF/presentation generator. Triggers when the user selects a
  template from the /templates gallery and enters a topic. Unlike the generic
  ppt-generator skill, this skill enforces a strict spec_lock contract per
  template — every slide is generated inside the visual identity of the chosen
  template. Use this skill when the job parameters contain a "template" field
  (e.g. "BRUTALIST_NEWSPAPER"). If no template field is present, fall back to
  the base ppt-generator skill.
---

# Template PPT Skill

Template-aware pipeline: topic → research → spec_lock read → content outline →
image fetch → HTML slide build → PDF → QA loop.

---

## 🚨 Global Execution Rules (MANDATORY)

1. **ALWAYS start by reading the template's `spec_lock.md`** — see Step 0.
2. **Re-read `spec_lock.md` before writing each slide's HTML** — this prevents
   color/font drift on long decks ("context-compression drift").
3. **Never invent colors or fonts** — every value must come from `spec_lock.md`.
4. **Use the template's layout pool** — do not use layouts not listed in the
   template's `spec_lock.md → layouts` section.
5. **Never repeat the same layout on two consecutive slides.**
6. Serial execution — follow Steps 0–9 in order.

---

## Quick Reference

| Step | What happens |
|------|-------------|
| 0 | Identify template, read its `spec_lock.md` and `skill.md` |
| 1 | Parse topic, detect type/tone/verbosity |
| 2 | Mandatory web search grounding |
| 3 | Select slide points from master list |
| 4 | Write content outline (all slides, purpose per slide) |
| 5 | Generate image keywords & fetch images (Pinterest → Gemini fallback; Unsplash optional via --engine-order) |
| 6 | Map images to slides |
| 7 | Build HTML slides using ONLY tokens from spec_lock |
| 8 | Run PDF builder |
| 9 | Visual QA loop |

Read [pdf-builder-template.js](../ppt-generator/pdf-builder-template.js) — the
base builder. Template-specific layouts are injected BEFORE the default layout
fallback block. Read [qa-loop.md](../ppt-generator/qa-loop.md) AFTER building.
Read [image-scraping.md](../ppt-generator/image-scraping.md) for image fetch.

---

## Step 0 — Load Template Spec Lock (MANDATORY FIRST STEP)

**Before anything else**, identify the template from the job parameters:

```
job.parameters.template  →  e.g. "BRUTALIST_NEWSPAPER"
```

Map the template ID to its directory:

| Template ID | Directory |
|-------------|-----------|
| `BRUTALIST_NEWSPAPER` | `.pi/skills/template-ppt/templates/brutalist-newspaper/` |
| `MINIMAL_CORPORATE` | `.pi/skills/template-ppt/templates/minimal-corporate/` |
| `DARK_TECH` | `.pi/skills/template-ppt/templates/dark-tech/` |
| `COMIC_POP` | `.pi/skills/template-ppt/templates/comic-pop/` |
| `TECH_DUEL` | `.pi/skills/template-ppt/templates/tech-duel/` |
| `STARTUP_AMPLIFY` | `.pi/skills/template-ppt/templates/startup-amplify/` |

**MUST READ both files using the `read` tool:**
1. `<template-dir>/spec_lock.md` — machine-readable execution contract
2. `<template-dir>/skill.md` — template-specific rules, layout codes, copy style

Store all values from `spec_lock.md` in working memory. Every CSS value, color,
font, and layout code used in Step 7 MUST come from this file.

---

## Step 1 — Detect Topic Type, Tone & Verbosity

Before generating the outline, classify the presentation parameters:

### A. Topic Type
| Code | Topic Type | Example prompts |
|------|-----------|-----------------|
| `ENV` | Environment / Nature / Climate | pollution, oceans, deforestation |
| `TECH` | Technology / Product / AI | AI, SaaS product, app launch |
| `BIZ` | Business / Startup / Strategy | pitch deck, market analysis, GTM |
| `SOC` | Society / Culture / History | caste system, feminism, migration |
| `HLTH` | Health / Medicine / Wellness | mental health, cancer, yoga |
| `EDU` | Education / Learning / Academia | online learning, STEM, literacy |
| `POL` | Politics / Policy / Law | election reform, data privacy |
| `ECO` | Economics / Finance / Trade | inflation, crypto, supply chain |
| `ART` | Art / Design / Creative | architecture, typography, cinema |
| `GEN` | Generic / Mixed | any topic not covered above |

### B. Delivery Mode
Check `spec_lock.md → delivery_mode`:
- `text` — read-close, dense, body 13–14px
- `balanced` — default, body 15–16px
- `presentation` — large audience, body 18–20px

### C. Verbosity (adapt to delivery mode)
- `text` mode → Text-Heavy: ~60 words per slide
- `balanced` mode → Standard: ~40 words per slide
- `presentation` mode → Concise: ~20 words per slide

### D. Mandatory Web Search Grounding
Run Google web searches for the topic before drafting slides:
1. `"[topic] latest statistics 2025 2026"`
2. `"[topic] key findings research"`
3. `"[topic] trends market data"`

All facts, statistics, and figures must come from this research.

---

## Step 2 — Build Content Outline

Build a slide-by-slide outline BEFORE writing any HTML. Format:

```
Slide 1: [LAYOUT-CODE] — Cover / Hook headline
Slide 2: [LAYOUT-CODE] — Agenda
Slide 3: [LAYOUT-CODE] — Purpose: ...
...
Slide N: [LAYOUT-CODE] — Closing / CTA
```

**Layout sequence rules (from spec_lock → layout_rules):**
- Slide 1: always the template's COVER layout
- Slide 2: always the template's AGENDA/TOC layout (skip if < 5 slides)
- Last slide: always the template's CLOSING layout
- Middle slides: rotate from the template's layout pool
- Hard rule: never same layout on consecutive slides
- Check `spec_lock.md → rhythm` per slide: `anchor` / `dense` / `breathing`

**CRITICAL WARNING:** ONLY use the layout codes explicitly defined in the template's `spec_lock.md` and `skill.md` files. Do NOT invent layout names or use generic names like `AGENDA` or `STAT` unless they are explicitly listed in the template files.

**Layout options available based on template type:**
- Chart layouts (`CHART-EDITORIAL` / `TECH-CHART` / `CHART-CLEAN`) for full-slide Chart.js data visualization.
- Split-chart layouts (`SPLIT-CHART` / `TECH-SPLIT-CHART` / `SPLIT-CHART-CLEAN`) for context + chart side-by-side.
- Icon-grid layouts (`ICON-GRID` / `TECH-ICON-GRID` / `ICON-GRID-CLEAN`) for 2×3 feature/step grids.
- Comparison layouts (`COMPARE-PANEL` / `TECH-COMPARE` / `COMPARE-CLEAN`) for pros/cons or before/after.
- Impact layouts (`IMPACT-STATEMENT` / `TECH-IMPACT` / `IMPACT-CLEAN`) for full-bleed image statements.

Include at least one chart slide (`CHART-*` or `SPLIT-CHART-*`) in every deck when the topic has real-world data.

### Chart type selection guide

The `renderChart` helper in every template supports **17 Chart.js types**. Choose the smartest type for the data — never default to `column` blindly:

| `chartType` | Best for |
|---|---|
| `column` | Comparing ≤3 groups side by side |
| `column-stacked` | Stacked absolute totals across categories |
| `column-100` | Proportional share of a whole per category (%) |
| `bar` | Ranked list or long category names |
| `bar-stacked` | Stacked breakdown of a ranked list |
| `line` | Time-series trend, single or multi-series |
| `area` | Single-series trend where fill emphasizes volume |
| `area-stacked` | Cumulative multi-series trend (e.g., market share over time) |
| `pie` | Simple share of a whole — **only if ≤5 slices** |
| `donut` | Same as pie, cleaner center void |
| `scatter` | Correlation between two numeric variables |
| `bubble` | 3-variable correlation (X, Y, size = magnitude) |
| `radar` | Comparing multiple attributes across subjects |
| `polar` | Polar area — magnitude comparison in radial layout |
| `funnel` | Pipeline / conversion drop-off (auto-sorted descending) |
| `waterfall` | Running total, P&L breakdown, budget change |
| `combo` | Bar + line on same axis (volume + trend overlay) |

**Quick rules:**
- Time on X-axis → `line`, `area`, or `area-stacked`
- Conversion funnel → `funnel`
- Budget / P&L → `waterfall`
- %-of-whole → `donut` (preferred over `pie`)
- Multiple qualities rated → `radar`
- Long category labels → `bar` over `column`

**Chart slide JSON:**
```json
{
  "layout": "CHART-EDITORIAL",
  "title": "Renewable Energy Growth",
  "chartType": "line",
  "chartData": {
    "labels": ["2020", "2021", "2022", "2023", "2024", "2025"],
    "datasets": [
      { "label": "Solar GW", "data": [42, 58, 78, 105, 142, 189] },
      { "label": "Wind GW", "data": [35, 44, 56, 71, 88, 107] }
    ]
  },
  "source": "Source: IRENA 2026"
}
```

For `scatter` / `bubble`, data points must be objects: `{"x": 10, "y": 20, "r": 8}`.
For `waterfall`, `data` is a list of positive/negative changes that auto-compute running totals.
For `funnel`, `data` is absolute values per stage that auto-sort descending.

---

## Step 3 — Master Slide Point Library

Pick **slideCount** points from this list. Adapt to topic type.

### 🔵 UNIVERSAL SLIDES (always consider)

| # | Slide Point | What goes on it |
|---|------------|-----------------| 
| U1 | **Cover / Title** | Topic name, subtitle, presenter, date |
| U2 | **Agenda / Table of Contents** | 4–6 bullets listing sections |
| U3 | **Executive Summary** | 3-sentence overview |
| U4 | **The Core Problem** | What challenge does this topic address? |
| U5 | **Why This Matters Now** | Urgency, timeliness, recent trigger |
| U6 | **Key Statistics & Numbers** | 3–4 big stat callouts with sources |
| U7 | **Historical Background** | How did we get here? Timeline |
| U8 | **Current State / Landscape** | The situation today |
| U9 | **Key Players / Stakeholders** | Who's involved? |
| U10 | **The Data Speaks** | Chart or graph slide |
| U11 | **Case Study / Example** | Real-world application |
| U12 | **Pros & Cons / Compare** | Two-column analysis |
| U13 | **Challenges & Barriers** | What's in the way? |
| U14 | **Opportunities** | What's possible? |
| U15 | **Key Takeaways** | 3–5 bullet summary |
| U16 | **Future Outlook / Predictions** | Where is this heading? |
| U17 | **Recommendations / Next Steps** | What should we do? |
| U18 | **Q&A / Discussion** | Open floor |
| U19 | **References / Sources** | Citations (optional) |
| U20 | **Closing / Thank You** | CTA, contact info |

---

## Step 4 — Fetch Images

Read [image-scraping.md](../ppt-generator/image-scraping.md) for full commands.

**Template-specific image strategy**: check `spec_lock.md → image_strategy` and `image_source` for:
- `editorial` — clean, moody, photojournalistic
- `stock-clean` — bright, clean stock photography  
- `halftone` — apply CSS `filter: grayscale(100%) contrast(1.4)` to all images
- `minimal` — use images sparingly, mostly white/negative space
- `none` — no images, text/data only
- `gemini-only` (e.g., COMIC_POP) — MUST prioritize Gemini image generation over scraping.

Generate 2–3 concrete search keywords per image slot. Run the scraper:

```
pdf_scrape_images({
  keywords: ["<keyword1>", "<keyword2>"],
  richPrompts: { "<keyword1>": "<rich image prompt>", "<keyword2>": "<rich image prompt>" }
})
```

**CRITICAL: if `image_source` or `image_strategy` is `gemini-only`**, pass
`engineOrder: "gemini,pinterest"` so the look is generated rather than
scraped, falling back to Pinterest only if Gemini fails.
```
pdf_scrape_images({
  keywords: ["<keyword1>", "<keyword2>"],
  richPrompts: { "<keyword1>": "<rich image prompt>" },
  engineOrder: "gemini,pinterest"
})
```

Images land in `build/images/<keyword-slug>/`. By default, the pipeline is:
1. **Pinterest** — tries to download 2 images per keyword.
2. **Gemini API** — generates any remaining missing images using `GEMINI_API_KEY` from `.env`.
3. **Unsplash** — optional; only used if `--engine-order` includes `unsplash`.
*(Override order with `--engine-order`, e.g. `gemini,pinterest` for `gemini-only` templates)*

Expected files per keyword:
- `pinterest_01.jpg`, `pinterest_02.jpg` (primary)
- `gemini_01.png`, `gemini_02.png` (fallback generation, only if Pinterest < 2)
- `gemini_prompt.txt` (the prompt used for any Gemini generation)
- `unsplash_01.jpg` (only if `--engine-order` includes unsplash)

**MANDATORY VERIFICATION**: After downloading, use `Glob`/`ls` to confirm files exist
before assigning them to slides. Never hardcode filenames. If a keyword directory
contains `gemini_prompt.txt` but no corresponding `gemini_*.png`, record the prompt
text in the slide JSON under `imagePrompt` instead of assigning a missing file path.

---

## Step 5 — Map Images to Slides

For each slide that needs an image:
1. List actual downloaded files in the keyword directory
2. Score each image: subject match (1–10) + color harmony (1–10) + composition (1–10)
3. Only use images with total score ≥ 22/30
4. Assign the best existing image path to the slide's `image` field
5. If no image exists but `gemini_prompt.txt` is present, assign the prompt text to the slide's `imagePrompt` field

---

## Step 6 — Spec Lock Re-Read Checkpoint

**MANDATORY before writing any HTML**: re-read `spec_lock.md` and confirm:
- ✅ All color values loaded from spec_lock (not from memory or invented)
- ✅ Font families loaded from spec_lock
- ✅ Font size anchor (bodyPx) loaded
- ✅ Layout pool loaded — only these layouts will be used
- ✅ Template-specific CSS vars noted

---

## Step 7 — Build HTML Slides

Copy [../ppt-generator/pdf-builder-template.js](../ppt-generator/pdf-builder-template.js)
into `build/pdf-builder.js`.

Also copy [../ppt-generator/reference/qa-dom.js](../ppt-generator/reference/qa-dom.js)
into `build/reference/qa-dom.js`. DOM QA is required and runs automatically
when `pdf-builder.js` executes.

**CRITICAL**: Fill CONFIG from spec_lock values — never invent:

```js
const SPEC_LOCK = {
  // Machine-readable contract — re-read this before each slide
  bg:          '<spec_lock bg>',
  primary:     '<spec_lock primary>',
  accent:      '<spec_lock accent>',
  secondary:   '<spec_lock secondary>',
  border:      '<spec_lock border>',
  secondaryBg: '<spec_lock secondary_bg>',
  fontDisplay: '<spec_lock title_family>',
  fontBody:    '<spec_lock body_family>',
  bodyPx:      <spec_lock body>,         // font size anchor
  titleRatio:  <spec_lock title_ratio>,  // title = titleRatio × bodyPx
};

const CONFIG = {
  jobId:     '<JOB_ID>',
  title:     '<presentation title>',
  subtitle:  '<subtitle>',
  presenter: '<presenter or topic>',
  date:      '<Month Year>',
  template:  '<TEMPLATE_ID>',           // e.g. 'BRUTALIST_NEWSPAPER'
  theme: {
    primary:     SPEC_LOCK.primary,
    secondary:   SPEC_LOCK.secondary,
    bg:          SPEC_LOCK.bg,
    accent:      SPEC_LOCK.accent,
    fontDisplay: SPEC_LOCK.fontDisplay,
    fontBody:    SPEC_LOCK.fontBody,
  },
  slides: [
    // ... filled from outline
  ]
};
```

**Template-specific layouts**: The template's `skill.md` provides complete HTML
renderer functions for each template-specific layout code, as well as template-specific CSS.
**MANDATORY**: DO NOT manually copy-paste the layout and CSS blocks. Instead, use the provided injection script:

```
pdf_scaffold({ template: "<TEMPLATE_ID>" })
```

That runs the injector on the host and leaves `build/pdf-builder.js` in your
workspace with the template's layout pool and stylesheet already in it, and
`CONFIG.jobId` pre-filled. Do not run the injector yourself.

This will automatically parse the `skill.md` file, extract the `renderChart` override, all layout renderers, and all custom CSS, and inject them into `pdf-builder.js` cleanly.

**Re-read spec_lock before writing each slide object.** Verify all colors,
fonts, and layout codes match exactly.

---

## Step 8 — Build PDF

```
pdf_build()
```

It runs the builder on the host, in a real browser with network access, so the
template's CDN `<script>` tags load normally.

`pdf-builder.js` automatically runs **DOM QA** first. It inspects every slide in the rendered HTML and writes `qa-report.json`.

- If critical issues are found, the build aborts and no PDF is generated.
- Fix the reported issues in `pdf-builder.js` and rerun.

Once DOM QA passes, verify:
- `qa-report.json` shows `"passed": true`
- `output.pdf` exists
- `qa-renders/slide_*.png` exist

---

## Step 9 — Visual QA Loop

Read [qa-loop.md](../ppt-generator/qa-loop.md) for full commands and defect
taxonomy.

DOM QA is now an automatic gate inside `pdf-builder.js`. Always read `qa-report.json` after each build to confirm `"passed": true` before proceeding to visual inspection.

**CRITICAL WARNING: NEVER assume the slides are correct just because the script output says "SUCCESS". Automated checks cannot catch every visual layout break or overlapping text!**

You MUST use your `read` tool to open and analyze the `.png` files generated in the `qa-renders/` folder. Because you are a multimodal agent, passing the image path to your `read` tool will allow you to physically see the slide. If you skip using the `read` tool on the images, you have FAILED the QA step.

**Template-specific QA rules** — also check from template's `skill.md`:
- All colors match spec_lock exactly (spot-check 3 slides)
- Template-specific hard rules (e.g., brutalist: max 1 red element per slide)
- Font families match spec_lock
- No layout is repeated consecutively

```
LOOP:
  1. Read qa-report.json and confirm "passed": true. If not, fix and rerun.
  2. View EVERY .png in qa-renders/ — do not skip any
  3. Check: TEXT_OVERFLOW · IMAGE_MISSING · CONTRAST_ERROR · LAYOUT_BREAK
     Plus template-specific checks from spec_lock → qa_rules
  4. PASS → exit loop
  5. FAIL → patch pdf-builder.js → re-run → go to 1
```

---

## Exit — Build Complete

Once QA passes, `build/output.pdf` and `build/output.html` exist and `deck.html` is the deck the studio previews.
The worker detects these files and handles upload automatically.

---

## Files in This Skill

```
template-ppt/
├── SKILL.md                       ← this file (main pipeline)
├── templates/
│   ├── index.json                 ← template registry (ID, name, tags, preview)
│   ├── brutalist-newspaper/
│   │   ├── spec_lock.md           ← machine-readable execution contract
│   │   └── skill.md               ← layout renderers + copy rules
│   ├── minimal-corporate/
│   │   ├── spec_lock.md
│   │   └── skill.md
│   ├── dark-tech/
│   │   ├── spec_lock.md
│   │   └── skill.md
│   ├── comic-pop/
│   │   ├── spec_lock.md           ← neo-brutalist comic spec (Dancing Script, Bebas Neue, #FBCC00)
│   │   └── skill.md               ← 13 layouts incl. COMIC-FLOWCHART SVG renderer
│   ├── tech-duel/
│   │   ├── spec_lock.md           ← two-sided comparison spec (Outfit, Quattrocento Sans, #76B900 / #ED1C24)
│   │   └── skill.md               ← 15 layouts incl. DUEL-COVER, DUEL-PRODUCT-A/B, DUEL-CHART
│   └── startup-amplify/
│       ├── spec_lock.md           ← startup growth playbook spec (Liter, Inter, #F4F4F4, #D91E18, #00A3A1)
│       └── skill.md               ← 18 layouts incl. AMP-COVER, AMP-CHART, AMP-GTM-FLOW, AMP-CLOSING
```

Base pipeline files (shared with ppt-generator):
- `../ppt-generator/pdf-builder-template.js` — base HTML→PDF builder
- `../ppt-generator/image-scraping.md` — Pinterest → Gemini image fetch script (Unsplash optional)
- `../ppt-generator/qa-loop.md` — Visual QA loop
- `../ppt-generator/design-library.md` — brand color palettes
