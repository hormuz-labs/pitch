# Creative direction — deciding this product's look

Questions, not a menu. The lists below are there to stop you defaulting, not
to be chosen from: if the product suggests something that is not here, do
that instead and say why. Every decision gets one line of evidence from
recon. No evidence means you are defaulting.

The bar: it looks like the product's own design team spent a month on it.

## The design

`chain` or `chapters`, decided first, because everything else follows.

**chain** — the product has one object the viewer already understands (a
file, a message, a photo, a card, a document) and one job story: put it in,
it is processed, here is the result. Few screens. 25–40s, usually music-only.

**chapters** — the product is a suite or an editor: many screens, many jobs,
each a sentence a user would say. 45–90s, voice optional.

A product that fits both takes the chain when it has one object, chapters
when it has many doors. Read `designs/<design>.md` before the shot list.

## The look

**Palette.** Base, surface, ink and one or two accents, all from
`recon/brand-tokens.md`. Light or dark is what the *product* ships — a light
app on a black void is a template. Derive tints by shifting lightness, never
by importing a colour the brand does not use.

**The stage** (`ambient` in shots.js) is the first thing every frame shares,
so it is the first thing two films share. Pick the one the brand's own
surfaces imply: `none` (whitespace does the work — the chain's stage),
`aurora` (soft discs in the brand's hues under hero type), `hairlines`,
`blueprint`, `halftone`, `shapes`, `light`, `grid`, `blobs`. Blobs on
near-black was the old house default and needs the site to be dark-with-glow
before you reach for it. The stage may shift hue across shots; it never
changes kind mid-film.

**Type.** The brand's own font, self-hosted. When it cannot be harvested,
match the personality: geometric grotesk (Space Grotesk, Archivo) for modern
tech, humanist (Nunito Sans, Source Sans 3) for consumer and health, serif
display (Fraunces, Instrument Serif) for editorial and premium, mono
(JetBrains Mono, IBM Plex Mono) for dev tools and data, rounded display
(Bricolage Grotesque) for playful. Poster scale (120–200px, type is the
visual) or restrained (64–90px, room for the product). Tight tracking on
display type, ≤ 8 words on screen, the noun in the accent rather than a
weight change. Type is **travelled, not read**: the camera pushes into one
word at a time.

**The finish** is the `grade` block — temperature, a curve, vignette, grain —
derived from the site's own photography. No grade is a decision too; an
imported teal-and-orange grade on a product that has neither is borrowed
taste.

## Motion language

One language, everywhere. It decides the eases, the tempo and the exits.

| Language | Eases | Tempo | Fits |
|---|---|---|---|
| Precision | `expo.out`, `power4.inOut`, no blur | 0.4–0.6s entrances, tight staggers | dev tools, infra, performance |
| Fluid | `power3.inOut`, long sines, `shutter: 0.5` | 0.8–1.4s, overlapping | premium, hardware, fintech |
| Elastic | `back.out`, `elastic.out` | 0.5–0.8s, bouncy | consumer, creator, social |
| Editorial | `power2.out`, opacity and y | calm, micro-motion under the holds | docs, design tools, serif brands |
| Kinetic | `power4`, cut to the beat, `shutter: 0.5–0.7` | very fast, 0.9–1.6s shots | hype launches, montage |
| Continuous | `expo.out` in, `power3.in` out, nothing bounces | an element every ~1s, never a still frame | the chain and chapters grammars |

Exits belong to the language (`motion.exit`), and two or three shots override
it so the cuts are not a metronome. A transition (`dissolve`, `wipe-*`,
`push-*`, `iris`, `zoom`, `flip`, `flood`) is spent where it says something —
a wipe along the axis value flows, a zoom into the thing the words promised.
A dissolve between two type beats is a slideshow. `carry` is the match cut.

## The arc and the hook

Pick an arc and argue for it: problem → relief (only when the viewer already
hates the workflow), demo-first (the product looks great immediately),
manifesto (category creation), montage (feature-rich, kinetic), metric-led (a
number is the story), one idea from five angles, or reverse (the result
first). Stats and a CTA are not owed to the ending — a film may end on the
product doing the thing, or on the claim.

The hook is the first three seconds and it is a kind, not a logo: a cold open
inside the product, one huge number, the question the viewer already asks,
what the product refuses to be, one object doing one thing, a word-per-beat
slam, or sound first on a black frame.

## Words

This is where a film sounds like every other AI film fastest.

- **The product's own register.** Its voice, its real nouns, its UI labels.
- **One fact per shot**, and something only this product could say. "Fast" is
  nothing; "recall in 40ms" is a shot.
- **Verbs over adjectives.** A sentence a person would say out loud, not a
  headline a landing page would print.
- The banned list is in SKILL.md, and it is a floor, not a ceiling.

## The test, before you build

Swap the product's name and logo for a competitor's. If the film still works,
it is a template — go back to the stage, the type, the moves and the words
until it does not. Then name the **signature**: the one thing only this
product could own, living across the film.

Three products, nothing shared. A CLI code-review tool: terminal noir in the
brand's amber, mono and a grotesk, Precision, flat, demo-first, a dry read
over sparse percussion. A journaling app: editorial paper in the brand's
sage, Fraunces, Editorial, drift on the phone, manifesto, piano, no voice. A
data-pipeline platform: a blueprint grid on their exact near-black, mono
labels, Precision leaning Fluid, workflow graph into one click into counters,
a measured read over analog pads. That is the bar.
