---
name: explainer-video
description: Author a single-file animated scene module for the in-house explainer-video renderer — a JS file exporting `html` (HTML/CSS string) and `buildTimeline(data)` (a GSAP timeline factory). Use whenever the user asks to build, rebuild, restyle, or extend an explainer video scene; whenever they reference `movie.payload.json`, `branding.json`, `storyboard.md`, or a `videos/<project>/` folder; whenever they describe a 30–60 second animated brand explainer with sequential scenes; whenever they say "scene module," "film," "explainer," "animated brand video," or paste a file with `export const html` and `export function buildTimeline`. Trigger even when the request is vague ("make this video better," "rethink the animations") — interpreting intent and producing the scene file is the whole job.
---

# Explainer Video Scene Module

This skill produces one thing: a single `.js` file that drops into the in-house explainer-video renderer. The file is loaded by the renderer, which calls `buildTimeline()` and plays the resulting GSAP timeline. Everything you write — markup, styles, animation logic, procedural generation — lives in that one file.

The pipeline conventions are fixed. The aesthetic is not. Your job is to interpret the brief, ask the two questions that matter, and then write the file.

---

## The export contract (non-negotiable)

Every scene module must export exactly these two things:

```js
export const html = `<div class="fvN-root"> ... </div>`;

export function buildTimeline(data = {}) {
  // ... generate procedural elements, set initial states, build GSAP timeline ...
  const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });
  // ... scene 1 ... scene 2 ... scene N ...

  const targetDuration = Number(data.duration || 45);
  if (Number.isFinite(targetDuration) && targetDuration > 0) {
    const baseDuration = tl.duration();
    if (baseDuration > 0) tl.timeScale(baseDuration / targetDuration);
  }
  return tl;
}
```

Rules that follow from this:

- **`gsap` is a global.** Do not `import` it. Do not assume `gsap-trial` or `@gsap/business`. Treat any plugin not in core GSAP as unavailable — that includes DrawSVG, MorphSVG, SplitText. Workarounds for each are in `references/motion.md`.
- **The HTML string is injected as innerHTML.** All CSS lives in a `<style>` block at the top of the string. There is no separate stylesheet.
- **`buildTimeline` is called *after* the HTML is in the DOM.** It can therefore query elements, generate SVG children, measure path lengths, etc.
- **The function may be called more than once per page lifetime.** Generate procedural elements (random scatter points, particle counts, etc.) inside `buildTimeline`, not at module top level.
- **Scope every selector with a unique prefix** like `fv3-`, `fv4-`, `fvHotelX-`. Multiple scene modules can be loaded into the same page; unscoped class names will collide.
- **`data.duration` rescales the timeline at the end.** Build the timeline at whatever pace feels right, then let the rescale block handle the target length.

---

## The input folder

Project inputs live in a folder, typically `videos/<project-name>/`. Read all of it before writing any code. The shape:

| File | What it tells you |
|---|---|
| `storyboard.md` | The beat-by-beat scene list, with titles and approved proof points. **The text in here is sacred** — never invent or paraphrase a stat, never drop a beat. |
| `movie.payload.json` | The render payload. Contains `scene_id` (your filename stem), `theme`, `design_tokens`, `music_track`, target `duration` if specified, and the scene list the renderer will load. |
| `branding.json` | A brand snapshot, often from a Firecrawl scrape. Source of truth for colors, fonts, logo treatment. May say `"This is an extracted snapshot and should be re-fetched"` — believe it. If a brand value looks wrong, flag it; don't silently substitute. |
| `README.md` | Folder conventions and project notes. |

If a previous version of the scene module exists (e.g. `*-v2.js`), read it. It encodes prior decisions about scene order, proof-point copy, and the renderer's expectations. When asked to "rebuild" or "improve," preserve everything textual and structural; rethink everything visual and motion-related.

---

## The two questions to ask

Before writing the file, ask the user these two questions. Do not skip them — committing to a direction without asking produces generic output and wastes the round-trip. Use a structured prompt (single-select buttons if available):

**1. Aesthetic direction** — pick one of:

- **Premium minimal** — restrained, glassy, subtle gradients, lots of whitespace, sparse motion, the modern Stripe.com / Linear feel
- **Bold editorial** — vivid blocks of color, oversized type, bento-style layouts, magazine pacing
- **Cinematic dataviz** — particles, real chart primitives (scatter plots, sparklines, network graphs, wireframe globes), film grain + timecode chrome, dramatic
- **Swiss / precise** — grid-locked, mono throughout, technical specimen feel, restrained palette, hairline rules

**2. Color palette anchor** — usually one of:

- The brand's primary on a dark background
- The brand's primary on a light/cream background
- "Surprise me" — pick what fits the chosen direction

Skip the questions only if the user has pre-specified both, or if they explicitly say "you pick." When skipping, state what you chose and why in one line.

`references/composition.md` describes each direction in enough detail to actually execute on it — read it once a direction is chosen.

---

## Workflow

1. **Read every file in the input folder.** Including any prior `.js` scene modules. Note the scene_id from `movie.payload.json` — that's your output filename stem.
2. **Ask the two questions** unless already answered.
3. **Read `references/composition.md`** for the chosen aesthetic direction. It has palettes, type scales, layout patterns, and motion vocabulary specific to each.
4. **Read `references/motion.md`** before writing any GSAP. It has the recipes you'll actually use (counters, path-draw without DrawSVG, particle-along-path, typewriter, scene transitions) and the gotchas that bite every time.
5. **Pick a unique class prefix.** If the prior version was `fv2-`, go `fv3-`. If you're starting fresh, use 2–3 letters from the project name plus a digit.
6. **Write the file.** Use `assets/starter-scene.js` as the skeleton if starting from scratch. `assets/reference-film.js` is a complete worked example — read it before your first build to internalize the patterns.
7. **Verify the export contract.** Run `node --check <file>.js` to catch syntax errors. The file must parse as an ES module.
8. **Save to the project folder** with the filename matching `scene_id` from the payload (e.g. `scene_id: "stripe-00-film-v3"` → `stripe-00-film-v3.js`).

---

## Scene structure

Default to 10 scenes for a ~45s film, ~4–5 seconds each. The storyboard usually dictates this; follow it.

Each scene has the same skeleton:

```html
<section class="fvN-scene" id="fvN-sK">
  <div class="fvN-head">
    <p class="fvN-kicker">Section label</p>
    <h2 class="fvN-title">Scene title from storyboard</h2>
    <p class="fvN-sub">Optional subtitle</p>
  </div>
  <div class="fvN-stage">
    <!-- the actual visualization -->
  </div>
</section>
```

Scenes are absolutely positioned and stacked. The timeline shows one at a time:

```js
const hideScene = (id) => gsap.to(id, {
  autoAlpha: 0, scale: 1.04, filter: 'blur(10px)',
  duration: 0.55, ease: 'power2.in'
});
const showScene = (id) => gsap.fromTo(id,
  { autoAlpha: 0, scale: 0.97, filter: 'blur(10px)' },
  { autoAlpha: 1, scale: 1, filter: 'blur(0px)', duration: 0.85, ease: 'expo.out' }
);
```

Use timeline labels (`tl.addLabel('s2', '-=0.2')`) so scene timings are readable and easy to nudge. The `-=0.2` overlap softens cuts.

---

## Visual chrome (every scene, every aesthetic)

These small pieces of frame furniture do disproportionate work in making the output look like a film instead of a slide deck. Include them by default unless the chosen aesthetic is "premium minimal" (which prefers a cleaner frame).

- **Corner markers** — four absolutely-positioned mono-font labels: brand/film name (TL), running timecode (TR), aspect/framerate (BL), in/out cue (BR). Update the timecode via a low-priority `gsap.to({v:0}, {v:45, repeat:-1, onUpdate:...})`.
- **Background layers** — a paper/canvas color, a faint grid mask, a vignette, optional film grain on `mix-blend-mode: multiply`. Each layer is a positioned `<div>`.
- **Tabular numerals** — `font-variant-numeric: tabular-nums` on every counter. Numbers must not jitter as they tick.
- **Mono kicker labels** — small uppercase mono text above each title, with letter-spacing around `0.2em`. Cheapest reliable way to look editorial.

---

## Text content is sacred

Take every title, subtitle, kicker, and proof point verbatim from the storyboard. Do not paraphrase. Do not invent supporting copy. Do not "tighten" a stat by rounding. If the storyboard says "200M+ active subscriptions managed on Stripe Billing," that exact string appears in the output. If the storyboard is silent on a piece of copy a layout seems to need, leave it out — don't fabricate.

Brand names, currency symbols, and percentage formatting all match the source.

The one exception: filler text in mock UI elements (a fake card number `4242 4242 4242 4242`, a placeholder email, a sample API call) is fine and expected. These should obviously be illustrative, not real customer data.

---

## What "good" looks like

A scene module is working well when:

- **Every scene has one clear visual idea** that maps to the title. "Scale payouts seamlessly" → particles flying from a hub to 25 destination pins, not a generic carousel.
- **Motion serves a beat.** Each animation reveals or transforms information. Decorative motion (idle drifting, infinite spinning rings) is fine as ambient texture but never carries a scene.
- **Procedural over hardcoded.** Twenty-five destination pins are placed by a `for` loop with elliptical math, not 25 hand-coded `<circle>` elements. This makes scenes easy to retune and gives them an organic feel.
- **Numbers count up, paths draw in, type clips on.** Static elements appearing fully-formed feel cheap. Dynamic reveal is the baseline.
- **Color discipline.** One accent color carries the film. Red is reserved exclusively for risk/error states. Green only for success states. Don't introduce a third or fourth hue.
- **The file is self-contained.** No external CSS, no imports beyond the implicit `gsap` global.

---

## What to avoid

- **Don't `import` GSAP, lodash, three, or anything else.** The renderer provides only `gsap` as a global.
- **Don't use `localStorage`, `sessionStorage`, or `fetch`.** The scene runs inside the renderer's frame and may have these blocked.
- **Don't use DrawSVG, MorphSVG, SplitText, ScrollTrigger.** All paid or context-inappropriate. `references/motion.md` has GSAP-core substitutes.
- **Don't animate CSS pseudo-elements directly.** GSAP can't target `::before`/`::after`. Use a class toggle plus a CSS `transition` on the pseudo-element.
- **Don't hardcode the duration anywhere except the rescale block.** All internal timings should be relative; `data.duration` does the global scaling at the end.
- **Don't reuse a class prefix from a prior version of the same film.** v2 was `fv2-`; v3 must be `fv3-`. If both load on one page, unscoped overlap breaks everything.
- **Don't ship without a syntax check.** `node --check` is free.
- **Don't talk back into the page from inside the timeline** — no `window.location`, no `document.title` changes, no calls into the parent renderer.

---

## When the brief is "make it better" with no specifics

This happens often. The user uploads a working file and says "rebuild" or "rethink everything but text." That is the trigger to:

1. Read the existing file in full.
2. Inventory what stays (export contract, scene order, all text) and what's open (palette, motion, layout, scene composition).
3. Ask the two questions (direction + palette).
4. Write a fresh file with a new class prefix. Do not edit the old file in place — leave it for diffing.

The user is asking for taste, not patches. Commit to a direction.

---

## References

- **`references/motion.md`** — GSAP recipes used in nearly every scene (counters, path-draw via `strokeDasharray`, particle-along-path via `getPointAtLength`, typewriter via `clip-path`, scene transitions, ambient loops) plus the pitfalls that catch every first build.
- **`references/composition.md`** — The four aesthetic directions in detail: palettes, type scales, layout vocabulary, motion personality, and a checklist for each. Read this once a direction is chosen.
- **`assets/starter-scene.js`** — Minimal skeleton with the export contract, base styles, scene shell, and a single example scene. Start here for new projects.
- **`assets/reference-film.js`** — Full ten-scene worked example in the cinematic-dataviz direction. Read this once before your first build; it encodes most of the patterns the cookbook describes.
