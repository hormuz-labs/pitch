# Composition Guide

The four aesthetic directions, with enough detail to actually execute on each. Read the section for the chosen direction before writing CSS.

The brief: every direction must read as deliberate, not generic. If swapping one project's CSS into a different project would still "work," the choices weren't specific enough.

---

## How to choose

| Direction | Picks this for | Avoids if |
|---|---|---|
| **Premium minimal** | SaaS, fintech, B2B tools, "modern Stripe" feel | Topic is dramatic or data-heavy |
| **Bold editorial** | Consumer brands, lifestyle, founder stories, brand films | Topic is a technical product |
| **Cinematic dataviz** | Infrastructure, payments, analytics, anything with real numbers | Topic is purely emotional/narrative |
| **Swiss / precise** | Developer tools, technical specimens, methodology explainers | Topic needs warmth |

Cinematic dataviz is the most distinctive of the four — it's hardest to mistake for AI slop. When in doubt and the topic supports it, lean here.

---

## Direction 1: Premium minimal

The contemporary SaaS look. Restraint is the entire point.

**Palette**
- Background: white (`#FFFFFF`) or very light cream (`#FAFAF7`)
- Ink: deep navy or near-black (`#0A0E1A`, `#111111`)
- One accent — the brand primary, used sparingly (15–20% of visual weight)
- Optional: a single soft secondary tint for cards/surfaces (`rgba(brand, 0.06)`)
- No reds or greens unless representing risk/success state

**Typography**
- Display: Inter, SF Pro Display, or the brand's specified display font
- Body: same family, regular/medium weight
- Letter-spacing: tight on display (`-0.03em` to `-0.04em`), neutral on body
- Title size: clamp(48px, 6vw, 88px). Restraint means no oversize hero type.
- No mono. No uppercase. No kicker labels (or, if used, the same family as body, not mono).

**Layout**
- Lots of whitespace. 8vh+ scene padding.
- Content blocks centered or left-aligned, never both
- Subtle borders (`rgba(0,0,0,0.06)`) and rounded corners (12–16px)
- Cards float on the page rather than sitting in containers
- One shadow style across the film: soft, large, low opacity (`0 30px 60px -20px rgba(0,0,0,0.08)`)

**Motion**
- Fades and small translations only. No rotations, no scale springs.
- 0.6–0.9s ease-out transitions. Never bounce.
- Scene transitions: simple opacity fade, no blur
- Counters tick in fast and stop crisp
- No ambient looping motion. The page is still between beats.

**What "good" looks like**
- A first-time viewer would say "this is well designed" before they say "this looks like a video"
- Could be a series of static screenshots and still feel intentional
- No element draws attention away from the content

**What kills it**
- Gradients (especially purple-to-pink). Use flat color.
- Glow effects, drop shadows on type, animated borders
- Excessive icon use. One or two iconographic moments at most.
- Stock-feeling shapes (free-floating circles, decorative blobs)

---

## Direction 2: Bold editorial

Magazine pacing, vivid blocks of color, oversized type. A full-bleed hero on every scene.

**Palette**
- Saturated, contrast-y combinations. Two or three colors with equal visual weight, not a primary + supporting.
- Examples: deep cobalt + chartreuse + cream; oxblood + mustard + ivory; jet + coral + bone
- Each scene can shift palette (within the established set) for variety
- Brand colors used as accents within these systems

**Typography**
- Display: a font with personality — serif (Recoleta, Tiempos, Editorial New), grotesque (PP Neue Machina, Söhne Breit), or display sans (Migra, Cabinet Grotesk)
- Body: a clean foil to the display — Inter, GT America, or Söhne
- Title size: clamp(72px, 9vw, 140px). Genuinely oversized.
- Mix weights aggressively. Light next to black. Italic next to roman.
- Drop caps and giant pull quotes are on the table.

**Layout**
- Bento-style grids: 2x2 or 2x3 with elements of different sizes
- Asymmetric compositions — content lands off-center deliberately
- Type can break out of containers, hang off edges, overlap images
- Use background color blocks aggressively — half the scene one color, half another
- Numbers presented as design objects, not in chart form

**Motion**
- Big moves. Scale-from-zero springs, elements sliding in from off-screen, type lifting in piece by piece.
- Scene transitions: hard cuts with color changes, or "wipes" via clip-path
- Type animates in line by line or word by word (use the typewriter-via-clip recipe per word, not per character)
- Some scenes are mostly still with one statement-making move

**What "good" looks like**
- Could be a printed editorial spread, scene by scene
- Strong opinion in every layout
- Color tells a story across the film

**What kills it**
- Falling back to safe centered layouts when a layout decision is hard
- Mixing two display fonts (one display, one body — that's the rule)
- Decorative elements. Every shape on screen should mean something.

---

## Direction 3: Cinematic dataviz

Real chart primitives, particle systems, and film chrome. The "is this a Bloomberg terminal or a movie" feel.

**Palette**
- Two-color foundation: a paper/canvas tone (warm cream `#FFF8F3` or deep navy `#061B31`) plus the brand primary
- Brand primary is the only chromatic accent — used everywhere a value, particle, or chart line appears
- Reserved utility colors: `#E5484D` exclusively for risk/error state, `#30A46C` exclusively for success/uptime state. Never for anything else.
- Optional warm bloom: a soft peach gradient (`#FFE0D1` at 30–40% opacity) drifting in from one corner of cream backgrounds

**Typography**
- Display: Inter or SF Pro Display, with `font-feature-settings: 'ss01', 'cv11', 'cv02'`
- Mono: JetBrains Mono, SF Mono, or IBM Plex Mono — used heavily for kicker labels, axis labels, timecodes, and corner chrome
- All numbers in display set with `font-variant-numeric: tabular-nums`
- Title letter-spacing: aggressive negative (`-0.035em`)
- Mono kickers: 11–12px, uppercase, `letter-spacing: 0.2em`

**Layout**
- Every scene has cinema chrome at the corners (see below)
- Hairline grid mask over the entire canvas (1px lines on `rgba(ink, 0.05)`, masked to fade at edges)
- Soft vignette via radial gradient from center
- Film grain on `mix-blend-mode: multiply`, opacity 0.4
- Content positioned in scene head (kicker + title + sub) and stage (the visualization) with absolute positioning

**Cinema chrome (every scene)**
- Top-left: brand/film name with a small accent dot (`STRIPE / FILM_V3`)
- Top-right: running timecode (`REC 00:23`)
- Bottom-left: format markers (`16:9 / 24FPS`)
- Bottom-right: cue indicators (`IN ► OUT`)
- All in mono, 10–11px, `letter-spacing: 0.18em`, color `rgba(ink, 0.55)`

**Visualizations (the heart of this direction)**
Every scene should use a real visualization primitive, not a decorative shape. Read the **Visualization primitives** section at the bottom for procedural recipes.

**Motion**
- Path-draw on every chart line and arc
- Particles flowing along bezier curves from source to destination
- Counters tick from 0 to target value with `power3.out` ease
- Scene transitions: blur + scale (the default in `motion.md`)
- Ambient: slow grid drift (24s period), grain breathing, ring orbits — slow enough that they're felt, not seen

**What "good" looks like**
- Looks like a documentary or a data-driven brand film
- Numbers feel real even when they're animated counters
- Could be paused at any frame and the result would look like a magazine infographic

**What kills it**
- Decorative motion that doesn't represent data
- Three or more chromatic colors (the discipline is two + utility reserves)
- Soft or rounded UI elements — this direction wants crisp geometry, hairline borders, sharp corners on chart elements
- Sans-serif corner chrome (kills the cinematic register; mono is essential)

---

## Direction 4: Swiss / precise

International typographic style applied to motion. Every pixel justified, nothing ornamental.

**Palette**
- Monochrome plus one accent. White or off-white background, black or near-black ink, one chromatic accent.
- The accent appears only at moments of meaning — counter values, the active state, a key callout
- No gradients. No tints. No transparency except for hairline rules.

**Typography**
- A single typographic system. One sans family used at multiple sizes and weights.
- Helvetica Now, Akkurat, Söhne, or Inter set with `font-feature-settings` for tabular numerals
- Mono used only for technical metadata (file specs, line numbers, code)
- Type set in a strict modular scale — only certain sizes used, no clamps or fluid scaling
- Left-aligned, ranged left, ragged right. No centering.

**Layout**
- 12-column grid visible (faintly) on every scene
- Content snaps to grid lines. Always.
- Every element gets a label — small caption text describing what it is
- Numbered scenes (`01 / 10`)
- Ample whitespace, but distributed via the grid, not as decoration

**Motion**
- Mechanical, even-paced. `ease: 'none'` or `'power1.inOut'` mostly.
- Elements appear and disappear, but rarely transform
- No scaling, no rotation, no springs
- Scene transitions: snap cuts, no fade
- Counters tick at constant rate — `ease: 'none'` not `'power3.out'`

**What "good" looks like**
- Looks like a Lars Müller publication animated
- Reads as technical documentation that happens to move
- Restraint is communicating substance, not hiding the absence of it

**What kills it**
- Any decorative shape, any rounded corner, any gradient
- Centered text (except possibly an opening title card)
- Default sans (Arial, system-ui defaults) — use a real grotesque
- Inconsistent spacing — gaps must come from the grid

---

## Visualization primitives (cinematic dataviz)

Procedural recipes for the visual content of each scene type. All assume the SVG helper from `motion.md`.

### Scatter plot (data with two dimensions)

Used for: complexity/chaos, fraud risk classification, customer segmentation. Generate ~80–100 points distributed by underlying logic (e.g. risk score by amount), color a subset (the "risk" cohort) with the reserved red.

```js
for (let i = 0; i < 95; i++) {
  const x = 80 + Math.random() * 870;
  const t = (x - 60) / 900;
  const yBound = 200 - t * 120 + 30 * Math.sin(t * 4);  // boundary curve
  let y, isRisk;
  if (Math.random() < 0.18) {
    y = 60 + Math.random() * (yBound - 70);
    isRisk = true;
  } else {
    y = yBound + 30 + Math.random() * (400 - yBound - 30);
    isRisk = false;
  }
  // append circle...
}
```

Animate dots in with random stagger and `back.out` ease. Draw the decision boundary path on top. For "filtering out risk," scale risk dots up briefly then collapse them to zero with a stagger.

### Network graph / hub-and-spoke

Used for: unification, integration, "one platform for X". Place outer nodes at known positions, draw bezier curves to a center hub, then animate particles along each curve.

Use the particle-along-path recipe from `motion.md`. Multiple particles per path with offset start times. The hub itself can be a styled `<div>` with `position: absolute` over the SVG.

### Map / spatial network

Used for: global reach, payouts, regional coverage. Generate destinations on an elliptical distribution around a center:

```js
for (let i = 0; i < 25; i++) {
  const angle = (i / 25) * Math.PI * 2 + (Math.random() - 0.5) * 0.15;
  const radius = 180 + Math.random() * 100;
  const x = cx + Math.cos(angle) * radius * 1.6;
  const y = cy + Math.sin(angle) * radius * 0.85;
  // dest at (x, y)
}
```

The 1.6/0.85 ratio gives a believable continent-shape ellipse. Draw dashed arcs from center to each destination, then fly a particle along each arc.

### Sparkline / area chart

Used for: trend visualization, growth, performance over time. Two SVG paths — the line (stroked) and the fill (filled, no stroke). Use a linear gradient for the fill that fades from accent color at top to transparent at bottom. Draw the line via stroke-dashoffset, fade the fill in simultaneously.

### Wireframe globe

Used for: global infrastructure, reach, scale. Pure SVG — no Three.js (not available). Concentric ellipses make the meridians and parallels:

```js
const R = 200;
// Meridians: vertical ellipses with varying x-radius
for (let i = 0; i < 9; i++) {
  const t = i / 8;
  const rx = Math.abs(Math.cos(Math.PI * t)) * R;
  meridG.appendChild(svgEl('ellipse', { cx: 0, cy: 0, rx, ry: R }));
}
// Parallels: horizontal ellipses with vertical squash
for (let i = -3; i <= 3; i++) {
  const y = (i / 4) * R;
  const r = Math.sqrt(Math.max(0, R*R - y*y));
  parG.appendChild(svgEl('ellipse', { cx: 0, cy: y, rx: r, ry: r * 0.18 }));
}
```

Wrap in a parent SVG with `viewBox="-220 -220 440 440"`. Add pulse points at random positions inside the circle, projected. Slowly rotate the parent SVG +/- 12 degrees on a yoyo.

### Histogram / bar series

Used for: distributions, latency, comparisons. Generate heights from a believable distribution (most low, a few high — that's how real latency looks). Animate `transform: scaleY` from 0 to 1 with `transformOrigin: bottom` and a small per-bar stagger.

### Code panel

Used for: developer-facing scenes, "APIs built for X". A dark panel with terminal chrome (three colored dots top-left, file label top-right). Syntax-highlighted code typed in via the `clip-path: inset()` recipe with `steps()` ease.

Color tokens for code:
- Keywords: brand-light tint (`#C4B8FF` for purple brands)
- Strings: warm tone (`#FFD3BC`)
- Functions: brand mid-tone (`#8B7CFF`)
- Numbers: brand light
- Comments: low-opacity white (`rgba(255,255,255,0.32)`)

---

## A note on consistency across scenes

Once a direction is chosen, every scene uses the same type system, the same shadow style, the same border radius, the same easing curves. Variation comes from layout and visualization choices, not styling primitives. A film where each scene has a different aesthetic register is unwatchable.

A useful test: after writing scene 5, can you copy-paste the corner chrome from scene 1 unchanged? If yes, you're consistent. If you'd need to adjust, you've drifted.
