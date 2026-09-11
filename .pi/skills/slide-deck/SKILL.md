---
name: slide-deck
description: Make and maintain a 1280×720 slide deck — generate one from a topic (optionally inside a named template), enhance an uploaded PDF/PPTX (recreate or preserve), or edit the finished deck by chat. The deck is deck.html in the workspace, built from build/deck-config.js by pitch pdf build, previewed live and published with pitch deck publish. Read this before any deck work.
---

# Slide decks

You make ONE presentation: **`deck.html`** — a single HTML document, one
`.slide` element per **1280×720** page, styles inline, images embedded as
base64. The studio previews it live and reloads on every change;
`pitch deck publish` turns it into the downloadable PDF + HTML. The user wants
results: make every content and design decision yourself, narrate the
important ones in a line, and stop only if a hard requirement is missing.

When the first actionable request in a NEW project asks for a deck and does not
say what kind, ask once with `ask_user`, which draws the options as buttons:
the deck's job (Investor pitch · Sales / product · Internal update ·
Conference talk · Course or training), its length, and — once you know the
subject — which parts it covers. One call, at most three questions, your own
pick first; then end the turn. Everything else — the design, the template, the
images, the words — is yours, and an edit turn never asks anything. Skip
choices already settled in the brief or delegated to you.

The `<studio-context>` says which job this turn is: **generate** from a topic
(with or without a template id), **enhance** an upload (`recreate` — fresh
design, fresh images, every original point survives; `preserve` — same slide
count and headings, the original's images, polished text), or **edit** the
existing deck (the user points at slides and elements).

## Files

- `deck.html` — the deck, and the truth once it exists.
- `build/deck-config.js` — the CONFIG you author (theme + slides); the small
  file you edit. `build/pdf-builder.js` renders it: never edit the builder.
- `build/images/<keyword-slug>/` — scraped images; `build/qa-renders/slide_N.jpg`
  and `build/qa-report.json` — the last build's QA; `build/output.html` /
  `output.pdf` — the last build.
- `build/parsed-slides.json` (+ `build/input-images/`) — an enhance job's
  parsed upload, produced before your first turn; `input/` — the upload.
- `renders/slide-NN.jpg` — pages rendered by `pitch deck render`.
- In this skill directory: `design-library.md` (50 measured brand palettes)
  and `templates/<name>/spec_lock.md` + `skill.md` for each template.

Your sandbox has node and python but **no browser and no network**, so
scraping, building and rendering are host tools — and they run in a real
browser with the network, so the builder's CDN `<script>` tags (Chart.js)
load fine. Never conclude a chart cannot work because *you* cannot reach the
CDN, and never rewrite the builder to avoid it. Image paths in the CONFIG
are relative to `build/`: `getBase64Image('images/<slug>/pinterest_01.jpg')`.
Only reference files `pitch pdf scrape-images` or `ls build/images/<slug>` showed
you; never invent a filename or a remote URL.

## Generate and enhance

1. **Read what you need.** Enhance: `build/parsed-slides.json` first (re-parse
   only with `pitch pdf parse`, only if it is missing or the mode changed). Template:
   `templates/<dir>/spec_lock.md` and `skill.md` (`BRUTALIST_NEWSPAPER` →
   `brutalist-newspaper`, `MINIMAL_CORPORATE`, `DARK_TECH`, `COMIC_POP`,
   `TECH_DUEL`, `STARTUP_AMPLIFY` likewise); the spec lock overrides
   everything below. Otherwise `design-library.md` before choosing colours.
2. **Outline.** Classify the topic (environment, tech/product, business,
   society, health, education, policy, economics, art, general), the tone
   (professional · casual · educational · sales pitch · funny — default by
   topic) and verbosity (concise ~20 words/slide, standard ~40, text-heavy
   ~60; a template's `delivery_mode` sets it). Pick the slide points for the
   requested count from: cover · agenda · executive summary · the core
   problem · why now · key statistics · history · current state · players ·
   root causes · consequences · case study · what works / what doesn't ·
   myths · data deep dive · timeline · comparison · pros and cons ·
   recommendations · challenges · the human story · quotes · role of
   technology / policy · call to action · takeaways · closing. Respect
   requested headings in order. Enhance keeps the slide count (preserve:
   also the headings) unless the brief says otherwise; never mix modes.
3. **Ground the facts.** You have no search tool. Use figures you reliably
   know and cite where they come from; a chart with three true numbers beats
   a full one with invented ones. Placeholder data (`10%`, `Value A`) is
   forbidden. Every chart and stat cites a `source`.
4. `pitch pdf scaffold [--template <name>]` — once. It writes `build/deck-config.js`
   (jobId and template pre-filled) and the builder.
5. **Images.** For each slide that needs one, write a 15–30 word rich prompt
   and derive a 3–5 word concrete query (scenes, objects, places — "smog
   over delhi skyline", never "pollution impact"); `pitch pdf scrape-images
   --keywords <list> --rich-prompts <json>`. Templates whose `image_source` is `gemini-only`
   take `engineOrder: "gemini,pinterest"`. Cover images must be 16:9. Preserve
   mode: `ls build/input-images`, map files to slides via `extractedImages`
   in the parsed JSON, skip files under 5KB and `.emf`/`.wmf`, and scrape only
   where nothing usable exists. Choose per slide by subject match, colour
   harmony, room for text, sharpness.
6. **Author `build/deck-config.js`** with `edit`: theme tokens copied from
   the palette or spec lock (`bg`, `primary` for borders/bullets/stat numbers/
   charts, `secondary` for body copy, `accent` for headings, `fontDisplay`,
   `fontBody`; contrast ≥ 4.5:1; no stark `#FFFFFF`/`#000000` backgrounds
   unless the brand's own), then the slides. No placeholder text anywhere.
7. `pitch pdf build`. A DOM-QA failure (text overflow, missing image, layout
   break) aborts and lists the defects: fix the config, build again.
8. **Visual QA — never skipped.** `read` EVERY `build/qa-renders/slide_N.jpg`
   and look: overflow, collision, empty slide, missing image, white text on a
   light image (raise the overlay), template placeholder, token drift (with a
   template, re-read `spec_lock.md` before each fix round). Patch the config,
   `pitch pdf build`, re-read, until every slide is clean.
9. `pitch deck publish --summary "<what changed>"` once, then a short reply: slide count,
   template or mode, QA rounds.

`pitch pdf build` writes `deck.html` from the config, so during generation the
config is where changes go. After the deck exists, `deck.html` is the truth:
rebuilding from the config throws away hand edits — say so if you must.

## Writing the slides

- **Title** 4–7 words, no padding words. **Body** 3–5 bullets at the chosen
  verbosity, active voice. Speaker notes 2–3 sentences. Banned: "In
  conclusion", "As we can see", "It is important to note", "Let us explore".
- **Every slide has a visual** (image, chart, stat cards); at least one
  data chart per deck. Title slide: title + subtitle only. Quote slide: one
  quote and attribution.
- **Layouts and their fields** — the complete contract of the base builder;
  anything else renders an empty slide, and the builder itself is not
  documentation, so never read or grep it:
  `COVER` (`title`, `subtitle`, `image`; slide 1 and the last slide) ·
  `SPLIT-L` / `SPLIT-R` (`title`, `bullets[]`, `image`; text 55%) ·
  `SPLIT-INFO` (`category` 2–4 word badge, `title`, `body` 25–40 words,
  `image`, `cards: [{heading, text}]` ×3) · `STAT` (`title`, `stats:
  [{value ≤ 6 chars, label, description 8–18 words}]` ×2–4) · `CHART-FULL`
  (`title`, `chartType`, `chartData`, `source`, optional `bullets`) ·
  `SPLIT-CHART` (the same plus `bullets` on the left). Every slide may carry
  `notes`. Slide 2 is `SPLIT-L` or `SPLIT-INFO`; never the same layout twice
  in a row. A template (only when the context gives a template id — do not
  browse `templates/` otherwise) replaces this pool with the codes in its
  `spec_lock.md`.
- **Charts**: `chartType` ∈ column, column-stacked, column-100, bar (long
  labels / rankings), bar-stacked, line / area / area-stacked (time on X),
  pie (≤ 5 slices) / donut (preferred), scatter / bubble (`{x, y, r}` points),
  radar, polar, funnel (auto-sorted), waterfall (list of changes), combo.
  `chartData: { labels, datasets: [{ label, data }] }`, plus `source`.

## Editing the deck by chat

The context names the slide the user is looking at (1-based) and, when they
clicked elements, a legend — `[1] <h1> in slide 3 · text "…" · selector: …`.

1. **Change only what was asked.** Slide 3's request leaves every other
   slide byte-identical. Match the deck's existing classes, fonts and palette;
   restyle only when asked.
2. **Edit `deck.html` directly** for wording, layout and styling. Use the
   config + `pitch pdf build` only for a rebuild the user explicitly wants (a new
   template, many slides regenerated) — and say so, because it replaces the
   whole deck.
3. Every slide stays a self-contained 1280×720 page: no overflow, nothing
   escaping the box, no placeholder text.
4. Images keep their `src`; a new one is fetched with `pitch pdf scrape-images` and
   embedded as base64 (node can encode one in a line). Remove an image cleanly.
5. **Look before you publish**: `pitch deck render --slides 3`, `read`
   `renders/slide-03.jpg`, fix what the tool flags or you see.
6. `pitch deck publish` once per turn with a one-line summary; never a broken or
   half-finished deck. If the request is ambiguous, take the most sensible
   reading, do it, and say what you assumed.
