# Creative direction — deriving a bespoke look per product

Questions and option spaces, not a house style. Recon and product meaning
outrank every menu and range here; invent outside the menus when the evidence
supports it. Work the 8 axes in order — later ones depend on earlier ones —
and write one line of **recon evidence** per choice. No evidence means you
are defaulting: go back to recon. The bar: the video looks like the product's
own design team spent a month on it, built from their exact tokens.

## Axis 1 — Palette and background system

Extract, never invent: base/background, surface, primary text, 1–2 accents
from `recon/brand-tokens.md`. Light or dark is what the *product* ships — a
light SaaS app on a black void is a template. Derive tints by shifting
lightness, never by importing indigo. Then choose ONE background system:

| System | Looks like | Fits | Living layer |
|---|---|---|---|
| Editorial light | warm paper, ink type, one accent, hairlines | design tools, docs, calm/prosumer | drifting hairlines, accent-tint gradient pan |
| Solid brand field | the saturated primary full-bleed, giant type | bold consumer, creator tools | hue drift ±8°, type parallax, flat shapes |
| Studio backdrop | soft radial light behind the subject | hardware, mobile, premium | light source orbiting, shadow drift |
| Technical grid | blueprint grid, ticks, mono labels | infra, data, analytics, "precision" | grid pan, tick pulses, dashed draws |
| Terminal noir | true black, phosphor text in the brand accent | CLIs, dev tools, hacker audience | cursor blinks, low-opacity log scroll |
| Gradient mesh | mesh/aurora in the brand's own hues | brands whose site already uses gradients | control-point drift |
| Deep space + glow | near-black, blurred glow shapes | **only** when the site is dark-with-glow; vary hue, count, geometry | orb drift, asymmetric periods |
| Duotone poster | two-colour print, halftone, cut-outs | media, music, community, campaigns | shape drift, plate offset |

Deep space + glow was the old house default and is banned without site
evidence. The background may evolve across shots (hue per beat) but never
switches system mid-film.

## Axis 2 — Typography

The brand's own font, self-hosted via `brand.fonts` (recon saves the files
to `assets/fonts/`), never a CDN link. When it cannot be harvested, match
the personality with a self-hostable equivalent:

| Personality | Equivalents | Feels |
|---|---|---|
| Geometric grotesk | Space Grotesk, Archivo, Sora | modern tech |
| Neo-grotesk | Inter, Instrument Sans, Geist | understated — only if the brand uses one |
| Humanist | Nunito Sans, Source Sans 3, Albert Sans | friendly, consumer, health |
| Serif display | Fraunces, Newsreader, Instrument Serif | editorial, premium, fintech |
| Mono | JetBrains Mono, IBM Plex Mono, Geist Mono | dev tools, data |
| Rounded / display | Bricolage Grotesque, Gabarito | playful, creator, social |

Scale: **poster** (120–200px, few words, type is the visual) or **restrained**
(64–90px, room for UI). Tight tracking on display type (−0.02 to −0.04em),
≤ 8 words per screen, subtitles 24–32px at ~0.75 opacity. Use **≥ 3 distinct
type treatments** across the film (`type-field`, `word-cut`, `type-wipe`,
`overlay-type`, `color-punch`, `word-build`); a treatment the engine lacks
becomes a custom factory (`effects-catalog.md`).

## Axis 3 — Motion language (pick ONE)

| Language | Easings | Tempo | Transitions | Avoid | Fits |
|---|---|---|---|---|---|
| Precision | `expo.out`, `power4.inOut` | 0.4–0.6s entrances, 0.03s staggers | clip-path wipes, snap zooms | wobble, blur | dev tools, infra, perf |
| Fluid | `power3.inOut`, long `sine` | 0.8–1.4s, overlapping | 3D fly-throughs, blur-through zooms | snaps | premium, hardware, fintech |
| Elastic | `back.out(1.6)`, `elastic.out` | 0.5–0.8s, bouncy | scale-pop cuts | solemn fades | consumer, creator, social |
| Editorial | `power2.out`, opacity+y | calm, micro-motion holds | flat pushes, rule draws | 3D, whip pans | docs, design tools, serif brands |
| Kinetic | `power4.in/out`, beat-synced | very fast, 0.9–1.6s shots | whip pans, punches, match cuts | holds | hype launches, montage |
| Continuous | `expo.out` in, `power3.in` out, `back.out` pops | an element every ~1s, 1.5–3s shots | exits overlap entrances on one stage | empty frames, slides | explainers, AI/builder tools |

Density is not a language choice: every language keeps an event every
≤ 1.5s — Editorial with rule draws and caption swaps, Fluid with layers,
Precision with wipes and cursor actions. `ambient` is on by default; off is a
direction.md decision with a reason. Boundaries are cut-first: hard cuts,
`punch` on 2–3 landings, the outgoing shot exiting with motion
(`motion.exit`: `up` / `down` / `scale` / `scatter`). No crossfades. Write the
language's parameters into direction.md and reuse them everywhere.

## Axis 4 — Dimensionality

**Flat 2D** (type and composition carry it; Editorial/Precision, print) ·
**2.5D** (`punch`, `drift`, `ui-frame` focus, layered custom factories) ·
**3D** only via a custom factory and only when separating layers *says*
something. A flat film with great type beats a 3D film with no idea. Camera
focus per demo beat is decided in `attention-camera.md`, not here.

## Axis 5 — Composition axis

Horizontal flow (pipelines, "from X to Y") · vertical (feeds, docs, mobile)
· centred poster (manifesto, hero) · split-screen (before/after, us/them) ·
asymmetric editorial grid (design-literate audiences). One dominant axis
matching how the product's value flows; vary between shots for rhythm.

## Axis 6 — Shot format per beat

| The value prop is… | Show it with | Type |
|---|---|---|
| the app itself is great | the real product, one focus move, a click | `ui-frame` (harvested `src`, `focus`, `cursor`) — 30–50% of a UI product's runtime |
| it's on your phone | the real mobile screen | `ui-frame` with `frame: "phone"` |
| a message arrives | a notification landing | `device-notif` with the product's `src` icon |
| we replace a slog | old way vs product | custom split-compare, or two `word-cut` shots cut against each other |
| transformation | before → after | `ui-frame` with `cursor.then` |
| developers love it | typed command, real output | `ui-frame` with native `html` in `brand.mono` |
| scale / traction | one number rolling | `stat-counter` (recon numbers) |
| thesis / positioning | the words are the visual | `type-field`, `word-cut`, `word-build`, `overlay-type`, `color-punch` |
| plays with your stack | real integration logos | `icon-marquee` with harvested `src` items |
| open / close | lockup, CTA | `logo-sting`, `logo-cta` with the harvested logo |

A UI product's film that never convincingly shows the UI fails; an API
product's film that fakes a dashboard also fails — show code, diagrams, data
flow. Never the same format twice in a row; alternate dense and sparse. Every
format renders in the film's own palette and type — a terminal beat in an
editorial-light film is a paper-toned card in the brand's mono, not a black
hacker screen.

## Axis 7 — Narrative arc

| Arc | Beats | When |
|---|---|---|
| Problem → relief | hook → pain montage → reveal → 2 proofs → stats → CTA | replacing a painful workflow (default) |
| Demo-first | cold open inside the product → "this is X" → 2 features → CTA | products that look great immediately |
| Manifesto | thesis beats → belief → product as answer → one proof → CTA | category creators, poster type |
| Montage | sting → 5–7 vignettes on the beat → stats → CTA | feature-rich, Kinetic, hype |
| Metric-led | a number → what it means → how → proof → CTA | traction, "10×" claims |

8–16 shots, 20–40s, average 1.5–2.8s. Not every film needs a problem section.

## Axis 8 — Audio persona (decide with Axis 3)

- **Narration: yes or no**, decided here. Kinetic 20–30s type-led films are
  usually stronger music-only; demo-led or explanatory films earn a voice.
  When yes: a female voice (Aoede/Kore) unless brand or user suggests
  otherwise, and ONE delivery direction for ONE read — intimate-confident
  (premium), bright-energetic (consumer), dry-precise (dev), warm-credible
  (fintech). The arc lives in the copy's phrasing, never in separate clips.
- **Music** by language: minimal warm electronic (Fluid), upbeat indie
  (Elastic), sparse percussive (Precision), cinematic build (Manifesto),
  beat-driven (Kinetic — cut on the bed's beat map).
- **SFX density**: Kinetic/Elastic up to ~6 signature cues per 30s;
  Editorial almost none.

## Three products, nothing shared

A CLI code-review tool: terminal noir in the brand's amber; JetBrains Mono +
a grotesk; Precision; flat; horizontal; terminal demo → diff → counter →
kinetic CTA; demo-first; dry VO over sparse percussion. A journaling app:
editorial paper with the brand's sage; Fraunces + humanist body; Editorial;
2.5D drift on the phone; centred; manifesto → phone demo → chaos-to-calm →
CTA; music-only piano. A data-pipeline platform: technical grid on their
exact `#0E1116`; mono labels + Archivo; Precision leaning Fluid; 2.5D;
horizontal; workflow graph → dashboard with one click → counters →
integrations → CTA; measured female VO over analog pads. That is the bar.
