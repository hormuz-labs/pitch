---
name: ppt-generator
description: >
  End-to-end skill for generating professional PowerPoint presentations from
  a plain-text prompt. Triggers when the user gives any topic, essay, brief, or
  paste of text and wants a polished PPT or slide deck out of it. Use this skill
  whenever someone says "make a PPT about X", "create slides on Y", "generate a
  presentation for Z", or pastes a body of text and asks for slides. The skill
  handles: (1) expanding the prompt into a structured outline of 100+ possible
  slide points categorised by topic type, (2) selecting the right subset for the
  given topic, (3) extracting keywords and fetching high-res images from Unsplash via Playwright, 
  (4) writing all slide text, and (5) building a final high-fidelity .pdf using Playwright (HTML-to-PDF).
  Always use this skill even if the user gives a very short prompt — your job is to expand it.
---

# PPT Generator Skill

End-to-end pipeline: text prompt → context/tone detection → Unsplash image fetching →
slide writing → high-fidelity .pdf file.

---

## Quick Reference

| Step | What happens |
|------|--------------|
| 1 | Parse user prompt, detect topic type, tone, and verbosity |
| 2 | Use Web Search / tools for factual grounding if needed |
| 3 | Select slide points from the master list below |
| 4 | Write all slide text (title, body) |
| 5 | Generate rich image prompts & concise Unsplash keywords |
| 6 | Fetch high-res images from Unsplash (Primary) |
| 7 | Map images to slides by semantic relevance |
| 8 | Build high-fidelity .pdf via Playwright (HTML-to-PDF) |
| 9 | QA and export |

Read [image-scraping.md](image-scraping.md) before running the Playwright pipeline.
Copy [pdf-builder-template.js](pdf-builder-template.js) to `/tmp/ppt-<JOB_ID>/pdf-builder.js`.
Read [qa-loop.md](qa-loop.md) AFTER building — it contains the Visual QA loop for PDFs. The worker handles upload automatically once files are ready.

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

### B. Tone
Determine the tone based on the user's prompt (or ask them if ambiguous):
- **Professional**: Formal, objective, business-ready (default for BIZ, ECO).
- **Casual / Conversational**: Relaxed, approachable.
- **Educational**: Informative, clear, structured (default for EDU, HLTH).
- **Sales Pitch**: Persuasive, action-oriented, highlighting benefits.
- **Funny**: Light-hearted, entertaining.

### C. Verbosity
- **Concise**: ~20 words per slide. Bullets are punchy and minimal.
- **Standard**: ~40 words per slide. Balanced detail (default).
- **Text-Heavy**: ~60 words per slide. Detailed paragraphs or long bullets for complex topics.

### D. Mandatory Google Search Grounding
To ensure absolute accuracy and up-to-date information, you MUST execute Google web searches for the presentation topic before drafting any slides. 
1. Search across recent news articles, reports, and industry publications.
2. Specifically run queries such as:
   - `"[topic] latest trends statistics 2026"`
   - `"[topic] market size share data metrics"`
   - `"[topic] news updates recent events"`
3. Compile a factual research summary. All timeline milestones, stats, figures, and quotes in the presentation must be grounded in this compiled research. No estimation or guess-work is allowed.

---

## Step 2 — Master Slide Point Library (100+ Points)

These are the slide points available to you. For any given presentation, pick
**12–20** of these based on the topic type and depth the user wants.

### 🔵 UNIVERSAL SLIDES (always consider these for any topic)

| # | Slide Point | What goes on it |
|---|------------|-----------------|
| U1 | **Cover / Title** | Topic name, subtitle, presenter name, date |
| U2 | **Agenda / Table of Contents** | 4–6 bullets listing sections |
| U3 | **Executive Summary** | 3-sentence overview of everything |
| U4 | **The Core Problem** | What problem or challenge does this topic address? |
| U5 | **Why This Matters Now** | Urgency, timeliness, recent trigger |
| U6 | **Key Statistics & Numbers** | 3–4 big stat callouts with sources |
| U7 | **Historical Background / Origin** | How did we get here? Timeline or brief story |
| U8 | **Defining the Scope** | What is included / excluded in this discussion |
| U9 | **Key Terminology / Glossary** | 4–6 terms the audience must know |
| U10 | **Major Stakeholders / Players** | Who is affected? Who has power? |
| U11 | **Current State of Affairs** | Where things stand today |
| U12 | **Root Causes / Why It Happens** | Underlying drivers, systemic reasons |
| U13 | **Consequences / Impact** | Short-term and long-term effects |
| U14 | **Case Study #1** | A real-world example with outcome |
| U15 | **Case Study #2** | A contrasting or comparative example |
| U16 | **What's Working** | Successes, bright spots, positive signals |
| U17 | **What's Not Working** | Failures, gaps, unresolved issues |
| U18 | **Global vs Local Perspective** | How the world sees it vs local reality |
| U19 | **Common Myths / Misconceptions** | 3–5 busted myths |
| U20 | **Data Deep Dive** | Chart, graph, or table slide |
| U21 | **Timeline / Milestones** | Key events in chronological order |
| U22 | **Comparison / Before & After** | Two-column contrast |
| U23 | **Pros & Cons** | Balanced view side by side |
| U24 | **Recommendations / What To Do** | Actionable next steps |
| U25 | **Challenges Ahead** | Obstacles to solving the problem |
| U26 | **The Human Story** | A personal anecdote or micro-story |
| U27 | **Expert Opinions / Quotes** | 2–3 quotes from credible sources |
| U28 | **What Other Countries/Cities Do** | International benchmarks |
| U29 | **The Role of Technology** | How tech is changing this topic |
| U30 | **The Role of Policy / Law** | Regulatory angle |
| U31 | **Call to Action** | What can the audience do? |
| U32 | **Summary / Key Takeaways** | 3–5 bullets of what to remember |
| U33 | **Q&A / Thank You** | Closing slide with contact info |

*(Note: Domain-specific slide points for ENV, TECH, BIZ, SOC, HLTH, EDU, ECO remain standard as per earlier internal versions).*

---

## Step 3 — Slide Writing Rules

For each selected slide point, write:

**Title**: 4–7 words, punchy, no padding words ("The", "A", "Some")
**Body**: 3–5 bullet points. Tailor length to the selected **Verbosity** (Concise, Standard, Text-Heavy). Adapt language to the chosen **Tone**.
**Speaker Notes**: 2–3 sentences of elaboration for the presenter. Not read aloud.

### Data & Chart Rules (MANDATORY)
- **You MUST include at least one data-driven chart slide** in every deck (`CHART-FULL` or `SPLIT-CHART`).
- **Ground data in reality**: The chart data MUST represent real-world statistics fetched from Google/news search results. Using placeholder numbers (like `10%`, `50%`, or generic `Value A`/`Value B` labels) is strictly forbidden.
- **Provide Source**: Every data chart and statistical callout must cite its source (e.g. "Source: Statista 2025") in the `source` field of the slide JSON.

### Chart Type Selection Guide — Pick the Smartest Type

Use this decision tree to choose `chartType`. The renderer supports **17 types**:

| `chartType` | When to use |
|---|---|
| `column` | Comparing ≤3 groups side by side (default for most comparisons) |
| `column-stacked` | Stacked absolute totals across categories |
| `column-100` | Proportional share of a whole per category (% breakdown) |
| `bar` | Ranked list or long category names (horizontal = easier to read) |
| `bar-stacked` | Stacked breakdown of a ranked list |
| `line` | Time-series trend, single or multi-series |
| `area` | Single-series trend where fill emphasizes volume |
| `area-stacked` | Cumulative multi-series trend (market share over time) |
| `pie` | Simple share of a whole — **use only if ≤5 slices** |
| `donut` | Same as pie but with a clean center void for emphasis |
| `scatter` | Correlation between two numeric variables |
| `bubble` | 3-variable correlation (X, Y, size = magnitude) |
| `radar` | Comparing multiple attributes across subjects (spider chart) |
| `polar` | Polar area — magnitude comparison in a radial layout |
| `funnel` | Pipeline / conversion drop-off (auto-sorted descending) |
| `waterfall` | Running total, P&L breakdown, budget change |
| `combo` | Bar + Line on same axis (volume + trend overlay) |

**Quick rules:**
- Long category names → `bar` over `column`
- Time on X-axis → `line`, `area`, or `area-stacked`
- Conversion funnel → `funnel`
- Budget / P&L → `waterfall`
- Showing %-of-whole → `donut` (preferred over `pie`)
- Multiple qualities being rated → `radar`

### Chart Data Field Reference

```json
// CHART-FULL or SPLIT-CHART slide object:
{
  "layout": "CHART-FULL",
  "title": "4-7 word slide title",
  "chartType": "column | bar | line | area | area-stacked | column-stacked | column-100 | bar-stacked | pie | donut | scatter | bubble | radar | polar | funnel | waterfall | combo",
  "chartData": {
    "labels": ["Category A", "Category B", "Category C"],
    "datasets": [
      { "label": "Series 1", "data": [42, 78, 55] },
      { "label": "Series 2", "data": [30, 50, 80] }
    ]
  },
  "source": "Source: Statista 2025",
  "bullets": ["context point 1", "context point 2"]
}

// scatter / bubble: data must be objects
// scatter:  "data": [{"x": 10, "y": 20}, {"x": 15, "y": 35}]
// bubble:   "data": [{"x": 10, "y": 20, "r": 8}, {"x": 15, "y": 35, "r": 14}]

// waterfall: data = list of changes (positive = gain, negative = loss)
// "data": [1000, 500, -200, 300, -100]   → auto-computes running total bars

// funnel: data = absolute values at each stage (auto-sorted descending)
// "data": [5000, 3200, 1800, 900]
```


### Banned phrases in slide text
- "In conclusion…"
- "As we can see…"
- "It is important to note…"
- "Various aspects of…"
- "Let us explore…"
- Any passive voice in bullet points

### Slide text density rule
- Title slide: title only + subtitle
- Data slides: 1 big number + 2–3 small labels
- Quote slides: 1 quote, attribution, no other body text
- **MANDATORY: No Text-Only Slides**: Every slide needs a visual element (image, chart, icon, or shape). Plain text-only slides are forgettable.

### SPLIT-INFO Required Fields
When using the `SPLIT-INFO` layout, the slide JSON object **must** contain:
```json
{
  "layout": "SPLIT-INFO",
  "category": "2–4 word badge label (e.g. MEDICAL PATH, CASE STUDY)",
  "title": "3–6 word punchy heading",
  "body": "25–40 word descriptive paragraph — write in full sentences.",
  "image": "path/to/image.jpg",
  "cards": [
    { "heading": "1–3 word card label", "text": "10–20 word supporting sentence" },
    { "heading": "1–3 word card label", "text": "10–20 word supporting sentence" },
    { "heading": "1–3 word card label", "text": "10–20 word supporting sentence" }
  ]
}
```

### STAT Required Fields
When using the `STAT` layout, each stat object in the `stats` array **must** have `value`, `label`, and optionally `description`:
```json
{
  "layout": "STAT",
  "title": "4–7 word slide title",
  "stats": [
    { "value": "12L",  "label": "JEE Applicants",  "description": "Students competing for engineering seats across India" },
    { "value": "24L",  "label": "NEET Applicants", "description": "Nearly double the pool competing for medical seats" },
    { "value": "1%",   "label": "Top Rankers",     "description": "Securing a govt MBBS seat requires being in the top 1%" }
  ]
}
```
- Use **2–4 stats** per slide. Never leave `stats` empty.
- `value`: short and punchy — `"12L"`, `"$4.2B"`, `"3×"`, `"98%"` — max 6 chars
- `label`: 1–3 words, UPPERCASE when rendered, bold
- `description`: 8–18 words, full sentence context (optional but strongly recommended)

---

## Step 4 — Rich Image Prompts & Keyword Extraction


Instead of just extracting global keywords, think like an AI Image Generator for each slide that needs an image. Write a **15–30 word rich descriptive prompt** (e.g., "Professional business meeting scene for roadmap presentation image with soft lighting") and then derive a **3–5 word concrete search query** from it.

Rules:
- Queries must be **visual and concrete** ("smog over delhi skyline", not "pollution impact")
- Each query maps to 1–2 specific slides
- Avoid abstract nouns as standalone terms ("awareness", "impact", "growth")
- Prefer: scenes, objects, places, emotions, actions

**Example — Topic: Pollution in Delhi**

| Slide | Rich Image Prompt (Mental Map) | Search Keyword |
|---|---|---|
| Cover | Wide landscape placeholder of heavy smog covering the Delhi skyline at dawn, muted colors | `delhi smog skyline foggy` |
| Stats | Close up of an air quality index meter showing dangerous levels in an urban Indian street | `air quality meter india` |
| Health | Portrait of a young child wearing an N95 mask looking out of a window | `child wearing mask pollution` |

---

## Step 5 — Image Scraping Pipeline

Read [image-scraping.md](image-scraping.md) for the full Playwright script and Gemini fallback details.

### Overview

You MUST execute the Node.js Playwright script to fetch real images before building the presentation. For each keyword:
1. Run the scraper using: `node .opencode/skills/ppt-generator/reference/scrape_images.js --topic "<topic>" --keywords <keywords> [--rich-prompt "keyword::rich prompt" ...]`
2. The script scrapes **Pinterest first** (2 images per keyword). **Unsplash** is used as a backup only if Pinterest returns fewer than 2 images (max 1 Unsplash image). **Dribbble is no longer used**.
3. If scraping still yields fewer than 2 images, the script automatically generates the missing image(s) with the **Gemini API** using `GEMINI_API_KEY` from `.env`.
4. The script automatically handles downloading via Playwright request context to avoid rate-limits or blocking.
5. Images will be saved directly to `pptx/ppt-<topic-slug>/images/<keyword>/` as:
   - `pinterest_01.jpg`, `pinterest_02.jpg` (primary)
   - `unsplash_01.jpg` (backup, only if Pinterest < 2)
   - `gemini_01.png`, `gemini_02.png` (fallback generation, only if still < 2)
   - `gemini_prompt.txt` (the prompt used for any Gemini generation)

Pass `--rich-prompt` for each keyword so the Gemini fallback prompt is based on the original 15–30 word rich image prompt instead of only the keyword.

### Image quality filters (apply before downloading)
- Skip images smaller than 400×300px
- Skip images that are SVG icons or logos
- **MANDATORY**: For Slide 1 (Cover), ONLY use images that strictly satisfy a 16:9 aspect ratio without any alteration or distortion. Do NOT use any image for the cover that doesn't fit 16:9 exactly.
- For other slides, prefer landscape orientation (16:9 ratio preferred)
- Prefer realistic photography over illustrations for ENV/HLTH/SOC topics
- Prefer design-y illustrations for TECH/BIZ/ART topics

---

## Step 6 — Image-to-Slide Mapping

Once the images are downloaded (target 2 per keyword), you must actively choose the absolute best matches and map them to your slides using this logic:

1. **MANDATORY VERIFICATION**: Use the `Glob` tool to list the actual downloaded files in `pptx/ppt-<topic-slug>/images/<keyword>/`. NEVER guess or hardcode filenames (e.g., assuming `pinterest_02.jpg` exists). Scraping or generation can occasionally fail. You must only assign file paths to slides that were successfully downloaded and confirmed to exist on disk.
2. If a keyword directory contains `gemini_prompt.txt` but no corresponding `gemini_*.png` file, record the prompt text in the slide JSON under `imagePrompt` instead of assigning a non-existent image path.
3. Each keyword has a `Maps to slides` entry.
4. From the successfully downloaded images for that keyword, pick the **best 1–2 images** per slide.
5. Scoring criteria (apply mentally, pick highest):
   - Subject match: does the image literally show what the slide is about?
   - Color harmony: does the image tone match your chosen palette?
   - Composition: is there clean space for text overlay?
   - Quality: is it sharp, well-lit, not watermarked?

Store the final mapping in JSON format for the builder script. This ensures only the highest quality visuals make it into the final presentation.

---

## Step 7 — Layout Templates

Use one of these layouts per slide (vary across the deck — never repeat same layout
3 slides in a row):

| Layout Code | Description | Best for |
|-------------|-------------|----------|
| `COVER` | Full-bleed image, title centre overlay, fully transparent | Slide 1 and Last Slide |
| `CHART-FULL`| Large full-slide data chart (bar, line, pie) | Key trends, market growth |
| `SPLIT-CHART`| Text left 50%, Chart right 50% | Breaking down statistics with context |
| `SPLIT-L` | Text left 55%, image right 45% | Content + fact slides |
| `SPLIT-R` | Image left 45%, text right 55% | Case studies, examples |
| `SPLIT-INFO` | Badge + title + body text, full image, 3 info-cards row below (must use `cards` array) | Case studies, how-it-works, process explanations |
| `STAT` | Up to 4 premium stat cards (must use `stats` array: `[{value, label, description}]`) | Key statistics, comparison numbers, KPI highlights |

**CRITICAL WARNING:** ONLY the 7 layouts explicitly listed above are supported by the engine. Do NOT use `AGENDA`, `TIMELINE`, `QUOTE`, `FULLBLEED`, `COMPARE`, `ICON-GRID`, `METRICS-CARD`, `MEDIA-GRID`, or `CLOSING`. Using unsupported layouts will result in empty slides!

---

## Step 8 — Design Tokens & Custom Theme Generation

> **CRITICAL MANDATORY FIRST STEP**: Before generating any colors or writing the pdf-builder.js file, you **MUST USE THE `read` TOOL to read `.opencode/skills/ppt-generator/design-library.md`**. It contains pre-extracted, production-quality design tokens from **50 premium real-world brands** (Ferrari, Stripe, Linear, Supabase, SpaceX, Apple, and more). Do NOT guess the contents. You MUST actually make the tool call to read it first. Match the topic to a category in that file and use those tokens directly in `CONFIG.theme`. Only invent colors from scratch if no library palette fits.

### Library Usage Flow
1. Identify the topic category (AI, Fintech, Luxury, SaaS, Enterprise, etc.)
2. Find the matching category section in `design-library.md`
3. Pick the best brand palette. Copy the colors AND fonts into `CONFIG.theme`:
   - `bg` → `CONFIG.theme.bg` (Slide background)
   - `primary` → `CONFIG.theme.primary` (Brand highlights: borders, bullets, stat numbers, chart elements)
   - `secondary` → `CONFIG.theme.secondary` (Supporting text: body text, bullet copy, stat descriptions, footers)
   - `accent` → `CONFIG.theme.accent` (Heading text: h1 headings, main titles, card headers)
   - `font-display` → `CONFIG.theme.fontDisplay` (Heading font family)
   - `font-body` → `CONFIG.theme.fontBody` (Body copy font family)
4. Do NOT use generic white/black colors for text; let the brand's `accent` and `secondary` colors set the text tone.

### Fallback Rules (only if no library palette fits)
If the topic is highly niche and no palette matches:

1. **Background**:
   - For **Dark Mode**: Use very rich, deep colors (e.g. `#080B10`, `#0C0C14`, `#0D0F0D`). Avoid pure black `#000000`.
   - For **Light Mode**: Use soft, warm, neutral colors (e.g. `#FAF9F5`, `#F8FAFC`, `#F9F9FB`). Avoid stark white `#FFFFFF`.
2. **Primary & Secondary**:
   - Choose harmonious, topic-relevant colors (e.g., warm rust/ochre for craft and art, vibrant emerald/sage for environment, electric blue/teal for AI or SaaS, deep burgundy/champagne for luxury).
3. **Accent**:
   - High-contrast color (often white `#FFFFFF` or very light theme tones for dark mode, and charcoal `#18181B` or deep theme tones for light mode).
4. **Contrast Rules**:
   - Enforce **Contrast Awareness**: Text colors must always have a contrast ratio of > 4.5:1 against the background.

---

## Step 8.5 — Dynamic Design Token Engine

For EVERY topic follow this algorithm:

### 1. Theme & Font Selection
1. **Read `design-library.md` first** — pick the brand palette that best matches the topic category.
2. Copy `bg`, `primary`, `secondary`, `accent`, `font-display`, and `font-body` directly from that palette entry into `CONFIG.theme`.
3. Apply the **Dominance over equality** rule — the primary brand color (`primary`) should dominate accent areas (slide borders, stat numbers, bullet dots, chart colors), while headings use `accent` and body uses `secondary`.

### 2. Layout Sequence Rules
- Slide 1: always `COVER` (Ensure cover image overlays are set to `transparent` so the background image is fully clean and un-tinted)
- Slide 2: always `SPLIT-L` or `SPLIT-INFO`
- Last slide: always `COVER` (reused as closing slide with contact/summary info)
- Middle slides: choose from the supported layout pool, weighted by topicType.
- **Hard rule**: never use the same layout on two consecutive slides.

### 3. 16:9 Enforcement Checklist
- PDF Viewport: 1280x720px
- All text within safe zones (80px margins)

---

## Step 9 — Build Order (High-Fidelity PDF with Base64 Assets)

```
1. npm install playwright (inside /tmp/ppt-<JOB_ID>/)
2. Copy pdf-builder-template.js to /tmp/ppt-<JOB_ID>/pdf-builder.js
3. Fill in the CONFIG object with generated slide content. Use the `getBase64Image('filename.jpg')` helper to map local images so they are permanently embedded into the PDF.
4. cd /tmp/ppt-<JOB_ID> && node pdf-builder.js
5. Verify output.pdf was written to /tmp/ppt-<JOB_ID>/output.pdf
6. Run Visual QA Loop (Step 10)
7. When QA passes, ensure output.pdf and output.html are at /tmp/ppt-<JOB_ID>/. The worker handles uploading automatically.
```
**IMPORTANT**: The worker will detect the generated files and handle upload/completion automatically.

---

## Step 10 — Visual QA Loop (MANDATORY — do NOT skip)

Read [qa-loop.md](qa-loop.md) for the full commands, defect taxonomy, and patch strategy.

**DO NOT proceed to the exit step until this loop completes.**

### The Loop

```
after node pdf-builder.js produces output.pdf and qa-renders/:

LOOP:
  1. Open EVERY .png in qa-renders/ with your file viewing tool. Do NOT skip any slide.

  2. For each slide, check these defects:
       TEXT_OVERFLOW · IMAGE_MISSING · CONTRAST_ERROR · LAYOUT_BREAK · TYPO_CRITICAL
     (Full taxonomy, severity levels, and visual detection guide → qa-loop.md)

  3. if verdict = "PASS":
       → EXIT LOOP

  4. if verdict = "FAIL":
       a. Apply targeted patches to pdf-builder.js for EACH defect
       b. node pdf-builder.js   ← regenerate output.pdf and new PNGs
       c. go to step 1
END LOOP
```

### Exit — Build Complete

Once the QA loop passes, the final `output.pdf` and `output.html` are at `/tmp/ppt-<JOB_ID>/`. The worker will detect these files and handle uploading to storage and marking the job complete automatically.

---

## Edge Cases

**User gives very short prompt ("make a PPT on water")**
→ Default to 14–16 slides. Use Web Search Grounding to find the latest context.

**Images fail to scrape**
→ Build the deck anyway using stable fallback image sources or Unsplash source URL generation. 

---

## Files in This Skill

```
ppt-generator/
├── SKILL.md                 ← this file (pipeline + design token engine)
├── image-scraping.md        ← Playwright script for fetching Unsplash images
├── pdf-builder-template.js  ← Node.js build scaffold for PDF generation with Base64 embedding
└── qa-loop.md               ← Visual QA loop: render → inspect → patch → rebuild
```