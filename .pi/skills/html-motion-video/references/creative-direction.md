# Creative Direction Playbook — Deriving a Bespoke Look Per Product

This reference supplies questions and option spaces, not a house style. URL
recon and product meaning outrank every menu, example, plugin suggestion, and
numeric range below. Invent a direction outside these menus when the evidence
supports it; never imitate a reference simply because it looked polished.

This is the decision framework behind `direction.md`. Work through the 8 axes
in order — later axes depend on earlier ones. For every choice, write one line
of **evidence** from recon. If you can't cite evidence, you're defaulting; go
back to recon.

The goal is not "different for the sake of different" — it's that the video
should look like the product's own design team spent a month on it. Steal the
brand's actual design tokens: their exact colors, their border radius, their
button style, their shadow softness, their copy voice. The video is an
extension of their brand, not of this skill.

---

## Axis 1 — Palette & Background System

### 1a. Extract the palette (never invent one)

From the product's site CSS: base/background color, surface/card color, primary
text color, 1–2 accent colors. Decide light vs dark by what the *product*
ships — a light SaaS app filmed on a black void looks like a template.
Derive supporting tints programmatically (same hue, shifted lightness), don't
import indigo/purple because the examples use it.

### 1b. Choose ONE background system

| # | System | What it looks like | Best for | Living-motion layer |
|---|---|---|---|---|
| 1 | **Editorial light** | Warm paper (#F7F5F2-ish), ink-dark type, one accent color, hairline rules | Design tools, docs, health/calm products, prosumer SaaS with light UIs | Drifting hairline rules, subtle accent-tint gradient pan (grain, if any, stays static) |
| 2 | **Solid brand field** | The brand's saturated primary color full-bleed, giant contrasting type | Bold consumer brands, creator tools, anything playful with a strong brand color | Hue drift ±8°, oversized type parallax, floating flat shapes |
| 3 | **Studio backdrop** | Soft radial light falloff behind the subject, like product photography | Hardware, mobile apps, premium/luxury products | Light source slowly orbiting (radial-gradient position tween), soft shadow drift |
| 4 | **Technical grid** | Fine blueprint grid lines, crosshair ticks, mono coordinate labels | Infra, data platforms, analytics, robotics, anything "precision" | Grid scroll/pan, tick pulses, dashed-line draws |
| 5 | **Terminal noir** | True black, phosphor-colored text (the brand's accent, not always green), scanline optional | CLIs, dev tools, MCP servers, hacker-audience products | Cursor blinks, log lines scrolling in a background layer at low opacity |
| 6 | **Gradient mesh** | Multi-stop mesh/aurora in the brand's actual hues | Brands whose own site uses gradients (check first!) | Mesh control-point drift via CSS var tweens |
| 7 | **Deep space + glow** | Near-black with blurred glow shapes | ONLY when the product's own site is dark-with-glow. Restricted: vary hue, count, and geometry — never "two orbs flanking center" | Orb/glow drift with asymmetric periods |
| 8 | **Duotone poster** | Two-color print aesthetic, halftone/noise texture, cut-out shapes | Media, music, community, campaign-style launches | Shape rotation/drift, color-plate offset slide (positional, constant opacity) |

Rules:
- System 7 is the old house default and is **banned without evidence** from the
  product's own site.
- The living-motion layer replaces the old hardcoded "3 orbs" — build the one
  that belongs to your chosen system.
- Background can evolve across scenes (hue shift per beat) but stays within
  the system — don't switch systems mid-video.

## Axis 2 — Typography

Use the brand's own font when its file can be harvested or downloaded; declare
it in `brand.fonts` (self-hosted under `assets/fonts/`, never a CDN link — a
failed fetch would bake fallback metrics into the render). Otherwise match the
*personality* of the brand's font with a self-hostable equivalent:

| Brand font personality | Google equivalents | Feels like |
|---|---|---|
| Geometric grotesk | Space Grotesk, Archivo, Sora | Modern tech, confident |
| Neo-grotesk / neutral | Inter, Instrument Sans, Geist | Understated, product-led (only if the brand actually uses this) |
| Humanist | Nunito Sans, Source Sans 3, Albert Sans | Friendly, consumer, health |
| Serif display | Fraunces, Newsreader, Instrument Serif | Editorial, premium, fintech-with-taste |
| Mono | JetBrains Mono, IBM Plex Mono, Geist Mono | Dev tools, terminals, data |
| Rounded / display | Bricolage Grotesque, Clash-alikes, Gabarito | Playful, creator, consumer social |

Then pick a **scale approach**:
- **Poster scale:** 120–200px headlines, few words, type IS the visual
  (manifesto arcs, brand-field backgrounds).
- **Restrained scale:** 64–90px headlines with more compositional room for UI
  (demo-led arcs, editorial systems).
- Always: tight tracking on large display type (−0.02 to −0.04em), ≤ 8 words
  per screen, subtitles 24–32px at ~0.75 opacity.

And vary the type shots: the engine gives you `type-field` (stacked slam),
`word-cut` (scale-in line), `type-wipe` (slide + char wipe), `overlay-type`
(lines succeeding each other), `color-punch` (card slam). Use **≥ 3 distinct
ones** across the film; the same type shot for every headline is a fail. A
treatment the engine lacks (scramble decode, word rotator, ink-fill sweep)
becomes a project factory in `js/shots.custom.js` — see
`references/archive/effects-catalog.md` for recipes to re-implement.

## Axis 3 — Motion Language

Pick ONE. It fixes the easing vocabulary, tempo, and transition style
everywhere — mixing languages is how videos turn to mush.

| Language | Easings | Tempo | Transitions | Avoid | Fits |
|---|---|---|---|---|---|
| **Precision** | `expo.out`, `power4.inOut`, linear holds | Fast entrances (0.4–0.6s), tight staggers (0.03s) | Clip-path wipes, hard pushes, snap zooms | Wobble, overshoot, blur | Dev tools, infra, perf-focused products |
| **Fluid** | `power3.inOut`, long `sine` drifts | Slow, overlapping (0.8–1.4s) | 3D fly-throughs, blur-through zooms | Sudden snaps | Premium, luxury, hardware, fintech |
| **Elastic** | `back.out(1.6)`, `elastic.out`, squash-stretch | Bouncy, medium (0.5–0.8s) | Scale-pop cuts, bounce-ins | Solemn slow fades | Consumer apps, creator tools, social |
| **Editorial** | `power2.out`, opacity+y only, minimal 3D | Calm, longer holds with micro-motion | Flat pushes, column reveals, rule-line draws | 3D explosions, whip pans | Docs, design tools, calm B2B, serif brands |
| **Kinetic** | `power4.in/out` pairs, beat-synced | Very fast, 2–4s scenes | Whip pans, scale punches, match cuts | Long holds | Launch hype, montage arcs, Gen-Z consumer |
| **Continuous** | `expo.out` entrances, `power3.in` exits, `back.out` pops | Dense: an element every ~1s, shots 1.5–3s | Almost no hard cuts — exits (`scatter`, `scale`) overlap entrances on one persistent stage | Empty frames, solid-color slides | Explainers, AI/builder tools, playful SaaS (the Replit reference in `pacing.md`) |

**Density is not a language choice.** Whatever the language, the film keeps
an event every ≤ 1.5s (measured with drift and ambient off). Editorial gets
there with rule-lines drawing, captions swapping and column reveals; Fluid
with overlapping layers; Precision with clip-path wipes and cursor actions.
The `ambient` stage (`blobs` or `grid`, brand color, low opacity) is on by
default; turning it off is a direction.md decision with a reason.

Write the chosen language's parameters into direction.md and reuse them
everywhere — consistency inside a video is as important as variety between
videos. In the engine the language shows up as: which type shots you lean on,
`cut: "punch"` vs hard cuts, `dur` rhythm (Kinetic 0.9–1.6s, Editorial
2.5–4s), `drift` on or off, and the easings inside any custom factory.

Boundaries are **cut-first**: the engine offers a one-frame hard cut and a
`punch` landing, and the outgoing shot's content **exits with motion**
(`motion.exit`: `up` / `down` / `scale` / `scatter`) in its last 0.3s, so
the cut reads as an arrival. There are no crossfades — rhythm comes from the
contrast between the outgoing and incoming shot, and from landing cuts on
the bed's beats. State in direction.md which 2–3 boundaries get `punch` and
which exit mode the film uses.

## Axis 4 — Dimensionality

The engine is flat by default with a slow rest drift per shot (`drift`), and
`ui-frame` adds a semantic camera push toward one hotspot. Decide how much
depth the brand wants:

- **Flat 2D** — composition and typography carry the video. Pairs with
  Editorial/Precision, light backgrounds, print aesthetics. A flat video with
  great type beats a 3D video with no idea.
- **2.5D** — `punch` cuts, `drift` on, `ui-frame` focus moves, and custom
  factories that move layers at different rates.
- **3D** — only via a custom factory, only when separating layers
  *communicates something* ("one platform, many modules"). Never a requirement.

Dimensionality does not decide whether the camera reframes attention; define
the focus grammar per product-demo beat with `attention-camera.md`.

## Axis 5 — Composition Axis

- **Horizontal flow** — content travels left→right; suits pipelines,
  workflows, timelines, "from X to Y" stories.
- **Vertical** — content stacks/scrolls upward; suits feeds, docs,
  mobile-first products, checklists.
- **Centered poster** — one subject dead-center per scene; suits manifesto
  arcs, hero reveals, poster typography.
- **Split-screen** — two panes in tension; suits before/after, manual-vs-auto,
  us-vs-them comparisons.
- **Asymmetric editorial grid** — off-center subject + margin annotations;
  suits light editorial systems, design-literate audiences.

Vary the axis *between scenes* for rhythm, but give the video a dominant axis
that matches how the product's value flows.

## Axis 6 — Scene Format Selection

The core question: **what does each beat need to *show* to be believed?**
Map the product's value propositions to formats:

| The value prop is… | Show it with | Engine type |
|---|---|---|
| "The app/dashboard itself is great" | The real product with one focus move and a click | `ui-frame` (harvested `src`, `focus`, `cursor`) — 30–50% of runtime for UI products |
| "It's on your phone" | The real mobile screen in a phone frame | `ui-frame` with `frame: "phone"` |
| "A message/alert arrives" | Notification landing on a device | `device-notif` (with the product's `src` icon) |
| "We save you time / replace a slog" | Old way vs product | custom `split-compare` factory, or two `word-cut` shots cut against each other |
| "Transformation quality" | Before → after | `ui-frame` with a `cursor.then` state swap |
| "Developers love it" | Typed command, real output | `ui-frame` with native `html` in `brand.mono` |
| "Scale / speed / traction" | One number rolling up | `stat-counter` (numbers from recon) |
| "Emotion / thesis / positioning" | The words are the visual | `type-field`, `word-cut`, `overlay-type`, `color-punch` |
| "Plays well with your stack" | Real integration logos travelling | `icon-marquee` with harvested `src` items |
| Open / close | Brand lockup, CTA | `logo-sting`, `logo-cta` with the harvested logo |

Format-selection rules:
- A `ui-frame` has three evidence-preserving modes: a harvested screenshot
  (default), a native `html` rebuild when internal parts must animate, or a
  screenshot plus a `cursor.then` swap for the consequence. Do not fabricate
  recognizable UI, and do not leave a screenshot static for a whole shot.
- A UI product's video that never convincingly shows the UI fails. An API
  product's video that fakes a dashboard also fails — show code, diagrams, or
  data flow instead.
- Don't reuse a format twice in a row; alternate density (busy demo → sparse
  type beat) for rhythm.
- Every format renders in the video's OWN palette/typography/motion language —
  a terminal scene in an Editorial-light video is a paper-toned card with the
  brand's mono font, not a sudden black hacker screen.

## Axis 7 — Narrative Arc

| Arc | Beats | When |
|---|---|---|
| **Problem → Relief** | Hook → pain montage → reveal → 2 feature proofs → proof/stats → CTA | Default for products replacing a painful workflow |
| **Demo-first** | Cold open INSIDE the product mid-action → zoom out "this is X" → 2 deeper features → CTA | Products that look great immediately; confident, modern |
| **Manifesto** | Thesis type beats → the belief → product as the answer → one proof → CTA | Category creators, brand-led launches, poster typography |
| **Montage** | Logo sting → 5–7 rapid feature vignettes (2–3s each) on a beat → stats → CTA | Feature-rich products, Kinetic language, hype launches |
| **Metric-led** | A number counting up → what it means → how the product does it → social proof → CTA | Traction stories, perf tools, "10x" claims |

8–16 shots, typically 20–40s, average 1.5–2.8s. Durations follow the language
(Kinetic 0.9–1.6s type beats, Editorial up to 3.2s with a second act) and the
bed's beat grid. Narration never sets a shot's length — a line bridges shots. Not every video needs a
"problem" section — a beautiful product can just be shown.

## Axis 8 — Audio Persona

Decide together with Axis 3 (motion and sound must agree):

- **Narration: yes or no.** Decide it here and record it. Kinetic 20–30s
  type-led films are usually stronger music-only; demo-led or explanatory
  films earn a voice. When yes — voice & register: a female voice (Aoede/Kore
  family) unless the brand/user suggests otherwise, and the *delivery* is
  brand-specific:
  intimate-confident for premium, bright-energetic for consumer, dry-precise
  for dev tools, warm-credible for fintech. The narration is ONE script, ONE
  read, ONE delivery direction. The arc (hook = drawing-in, reveal = proud,
  CTA = inviting) is written into the copy's phrasing and punctuation, never
  into separate clips — a clip per line is exactly what sounds robotic.
- **Music genre by direction:** minimal warm electronic (Fluid/premium),
  upbeat indie-electronic (Elastic/consumer), sparse percussive/glitch
  (Precision/dev), cinematic build (Manifesto), beat-driven (Kinetic — sync
  scene cuts to the beat: at 120bpm a beat lands every 0.5s; nudge scene
  durations to beat multiples).
- **SFX density:** Kinetic/Elastic can afford more (still ≤ 6 per 30s);
  Editorial wants almost none — maybe one shimmer and one soft impact.
- **Beat sync:** the curated beds ship a beat map (`musicTimestamp.json`);
  nudge shot `dur`s so cuts land on strong beats.

---

## Worked micro-examples (contrast, not templates)

**A CLI code-review tool:** Terminal-noir background in the brand's amber
accent; JetBrains Mono + a grotesk for headlines; Precision language
(clip-path wipes, 0.4s expo entrances); flat 2D; horizontal axis; formats:
terminal demo → code diff → counter beat → kinetic-type CTA; Demo-first arc;
dry confident VO over sparse percussive bed.

**A consumer journaling app:** Editorial-light paper background with the
brand's sage accent; Fraunces serif display + humanist body; Editorial
language (opacity+y, long holds, rule-line draws); flat 2D with 2.5D drift on
the phone frame; centered/vertical axis; formats: kinetic type manifesto →
device-frame demo → before/after (chaos → calm) → CTA; Manifesto arc;
music-only with soft piano, no VO.

**A data-pipeline platform:** Technical-grid background on deep slate (their
site's exact #0E1116, not the skill's navy); mono labels + Archivo headlines;
Precision-to-Fluid hybrid leaning Precision; 2.5D; horizontal axis; formats:
workflow graph hero → reconstructed dashboard with one cursor click → counters
→ integration grid → CTA; Problem→Relief arc; measured female VO, warm
analog-pad bed.

Same skill, three videos that share nothing visually. That's the bar.
