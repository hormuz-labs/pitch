# Creative Direction Playbook — Deriving a Bespoke Look Per Product

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

Match the *personality* of the brand's own font, using a Google Fonts
equivalent if the real one isn't free:

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

And choose **≥ 3 distinct text treatments** for the video from the suite in
`effects-catalog.md` #21 (line-mask reveal, char/word stagger, scramble
decode, typewriter, word rotator, ink-fill sweep, per-word VO-synced pop) —
which treatments fit follows from the motion language (Axis 3). One stagger
recipe reused for every headline is a fail.

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

Write the chosen language's parameters into direction.md (default ease,
entrance duration, stagger step, transition type) and reuse them everywhere —
consistency inside a video is as important as variety between videos.

Each language also implies a **plugin palette** (all GSAP plugins are free —
pick what fits, list it in direction.md):

| Language | Signature plugins & tools |
|---|---|
| **Precision** | ScrambleText, DrawSVG, TextPlugin typewriter, clip-path wipes, `steps()`-like stagger grids |
| **Fluid** | MorphSVG, MotionPath, SplitText line masks, CustomEase signature curves, blur cascades |
| **Elastic** | CustomBounce, CustomWiggle, Physics2D bursts, Flip layout morphs, squash-and-stretch |
| **Editorial** | SplitText line masks, DrawSVG rule-lines, word rotator, ink-fill sweeps — restraint over spectacle |
| **Kinetic** | SplitText char staggers, Flip match cuts, Physics2D confetti, whip transitions, beat-synced `addLabel` grid |

## Axis 4 — Dimensionality

The `#camera` rig always exists (it's how transitions and determinism work),
but how much depth you *use* is a choice:

- **Full 3D** — perspective camera, z-separated layers, fly-through
  transitions, possibly a 3D exploded UI. Earns its keep when the product has
  layered structure to reveal (dashboard composed of panels, stack diagram).
  Pairs with Fluid/Kinetic.
- **2.5D parallax** — flat layers moving at different rates, slight rotations.
  Safe middle ground; pairs with anything.
- **Flat 2D** — composition and typography carry the video; transitions are
  pushes/wipes. Pairs with Editorial/Precision, light backgrounds, print
  aesthetics. A flat video with great type beats a 3D video with no idea.

The 3D exploded dashboard (effects catalog #17) is one option for one kind of
scene — never a requirement. Use it only when separating layers *communicates
something* (e.g. "one platform, many modules").

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

| The value prop is… | Show it with | Notes |
|---|---|---|
| "The app/dashboard itself is great" | **Reconstructed UI demo** — native HTML rebuild, cursor performs one real flow | 30–60% of runtime for UI products. Rebuild faithfully: exact nav items, real labels, real chart shapes |
| "We automate a multi-step process" | **Workflow node graph** — nodes pop in, connector draws, glow-dot travels | Route the path AROUND nodes (curves through gaps) |
| "We save you time / replace a slog" | **Timeline strip** or **split-screen race** — old way vs product, clock/date scrubbing | Great for agents, schedulers, batch tools |
| "Transformation quality" (gen-AI, redesign, cleanup) | **Before/after** — wipe reveal or slider | The delta is the product; let it breathe |
| "Developers love it" | **Terminal / code diff** — typed command, streaming output, syntax-highlighted diff | Mono font, real-looking commands, no lorem code |
| "Scale / speed / traction" | **Counters & data viz** — count-ups, chart draws, logo strips | Numbers from recon, not invented |
| "A composed platform of parts" | **3D exploded UI** — panels z-separate with per-panel rotation and staggered timing | The only good reason for #17 |
| "Emotion / thesis / positioning" | **Kinetic typography** — the words are the visual | Cold opens, manifesto beats, CTAs |
| "It's on your phone / in your browser" | **Device frame** — 3D floating phone or browser chrome with gesture | B2C, extensions, mobile |
| "Plays well with your stack" | **Integration grid** — logo tiles cascading in, connection lines | Keep to one scene |

Format-selection rules:
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

Scene count 5–9. Durations follow the language (Kinetic short, Editorial
long). Not every video needs a "problem" section — a beautiful product can
just be shown.

## Axis 8 — Audio Persona

Decide together with Axis 3 (motion and sound must agree):

- **VO voice & register:** default female voice (Aoede/Kore family) unless the
  brand/user suggests otherwise — but the *delivery* is brand-specific:
  intimate-confident for premium, bright-energetic for consumer, dry-precise
  for dev tools, warm-credible for fintech. Write per-scene style strings that
  move through the arc (hook = drawing-in, reveal = proud, CTA = inviting).
- **Music genre by direction:** minimal warm electronic (Fluid/premium),
  upbeat indie-electronic (Elastic/consumer), sparse percussive/glitch
  (Precision/dev), cinematic build (Manifesto), beat-driven (Kinetic — sync
  scene cuts to the beat: at 120bpm a beat lands every 0.5s; nudge scene
  durations to beat multiples).
- **SFX density:** Kinetic/Elastic can afford more (still ≤ 6 per 30s);
  Editorial wants almost none — maybe one shimmer and one soft impact.
- **No-VO option:** a music-only video with on-screen copy is a legitimate
  choice for Editorial/Manifesto directions — say so in direction.md instead
  of forcing narration.

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
