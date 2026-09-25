# The social ad

The grammar of five studied short-form ads (9:16, 33–95s: hearing
protection, a men's acne device, B2B sales software, a women's serum, a men's
supplement), and how to build it here. Their beat-by-beat breakdowns are in
[reference-studies.md](reference-studies.md). Borrow the argument, the
rhythm, the caption system and the sound design; never their footage,
words, claims, music or brand.

## What all five share, measured

- **One continuous voice, fast and unbroken.** 2.75–3.68 words/s (median
  3.1), and almost no pauses: the longest ad has one pause of 0.3s+ in 90
  seconds. Breaths are edited out. The voice slows only on numbers ("forty
  percent", "twenty thousand dollars", "three hundred sixty-five") and on the
  last word of a punchline.
- **A burst in the first three seconds.** Four of five cut 4–15 times before
  3s; the fastest cuts are 2–3 frames (0.07–0.12s). The fifth opens on a
  pattern interrupt instead ("This is not an apple").
- **Bursts, then holds.** 0.6–1.2 cuts/s on average, but never evenly: a
  cluster of 0.1–0.3s cuts on a list or a plural noun, then a 1.5–5s hold on
  the image that lands the thought. Median shot 0.34–0.82s; longest holds
  4–15s (a product demo, a creator talking).
- **Cuts follow ideas, not the metronome.** Measured against a random
  baseline, cuts land on beats and on word onsets no more often than chance.
  A new picture arrives with a new noun or phrase. What follows the argument
  is the MUSIC's structure: sections, bass breakdowns and drops.
- **Words hold while pictures change.** A caption like YOUNG ENOUGH or OVER
  THE AGE [25] stays put while seven faces flicker under it in 0.7s. The eye
  reads once; the burst says "all of them".
- **A pattern interrupt every 5–10 seconds**: a black card, a colour flip, a
  glitch, a tiny word alone on white, a sticker, a counter, a retention line
  ("KEEP WATCHING").
- **The turn changes the world**: a new ground colour (black → white), a
  bass drop, a different voice energy — on the line where the film pivots
  from problem to solution.

## The arc

| # | Beat | Job | Built with |
|---|---|---|---|
| 1 | **Hook** (0–3s) | stop the thumb: call out the viewer ("Mothers over 40", "Men over 25"), a turn ("Here's the thing"), or a pattern interrupt ("This is not an apple…") | `card` or a burst `footage` + big captions |
| 2 | **Stake** (2–4s) | one real number at human scale | burst under a steady caption; `fx: "type"` / `"count"` |
| 3 | **Retention line** (optional, ≤1s) | "keep watching", "here's the truth" | `card`, chromatic caption |
| 4 | **Problem made literal** (4–10s) | what it costs, a picture per noun, one analogy | footage, `signal`, black cards |
| 5 | **Proof of the problem** (2–3s) | the source on screen | `evidence`, a real screenshot with `scroll` or `push` |
| 6 | **The enemy** (3–8s) | what's wrong with today's options, in the viewer's words: the industry, the drug, the price ($20,000 per treatment) | windows, stickers, `strike`, a price anchor |
| 7 | **Turn** (1.5–3s) | "I got tired of it", "So we made…", "But this ends today" | colour flip + `thin` ending on the line |
| 8 | **Reveal** (1.5–3s) | the name, big; the real product alone | giant word + `float` / packshot on the new ground |
| 9 | **Mechanism** (3–8s) | how it works, one idea, shown | `exploded`, macro footage, creators using it |
| 10 | **Proof stack** (4–10s) | count-up of customers, before/after, a review wall, "clinically…" only with a source | `count`, `window` pairs, `scroll` down reviews |
| 11 | **Payoff / offer** (3–8s) | the feeling in the brand's voice, or the offer: risk-free, guarantee, price | big captions, `stack: "replace"` |
| 12 | **Close** (2–5s) | wordmark, URL in a search bar or pill, one imperative | `logo-sting`, `line` typing a URL, scrolled landing page |

Scale it: **15s** = 1, 2, 7, 8, 11, 12. **30s** = add 4, 6, 9. **45–90s**
= all twelve, with the problem and proof stacks longer. Voice ≈ runtime ×
3.0 words/s minus the silent beats; cut copy rather than speed the read.

## Attention: bursts, holds, interrupts

Plan density before shots: in the shot table, mark each beat BURST, HOLD
or INTERRUPT and keep alternating.

- **The opening burst.** 4–10 clips in the first 2.5s, 0.08–0.3s each, all
  under one caption that holds (`footage` with `clips` and `every: 0.12`).
  Same framing and grade for every clip (faces centred, eyes on one line) so
  the eye stays put while the picture changes. End it on a hold.
- **Hold the words, flicker the pictures.** A plural noun or a list — people,
  mothers, men, "every day" — is a burst under one steady caption; never
  change the caption with every clip.
- **Anaphora on the beat.** A repeated word over a new picture each time —
  NO sun damage / NO dark spots / NO sagging; SHADOW OF MYSELF / LOWER
  CONFIDENCE / FEWER DATES — one image, one caption phrase each, 0.5–1s apiece.
- **Holds land thoughts.** 1.5–3s with a slow `push` on the image that proves
  or lands the point (the product reveal, the before/after, the price).
- **Interrupt every 5–10s.** Rotate: a black `card` with type only; a colour
  flip of the ground; a `glitch` cut; a tiny word alone on white then a
  full-bleed shout (whisper → shout); a sticker or illustration popping in;
  a counter; a window shrinking out of full-bleed (`window.from`).
- **Speed ramps** (the B2B study's opening): a clip at `rate` 0.4 cut to the
  same subject at `rate` 2, or a push from 1 to 1.2 over 0.3s on the cut word.
- Check with `pitch motion review --times` inside every burst: each tile must
  be a readable picture, not a blur.

## Three looks

Choose one per film, from the product and the audience; mix devices only
within a look.

| Look | Studies | Ground and colour | Type | Signature devices |
|---|---|---|---|---|
| **Editorial DTC** | A, B | black and desaturated/teal problem act; **white** solution act | bold uppercase grotesk stacks; mixed weights inside a line; bracket tags [25] [FRUSTRATION] | footage in small glowing windows, hand-drawn arrows and circles, article evidence, colour flip at the turn |
| **Loud DTC** | D, E | one neon brand colour as flood cards, borders and highlights; white fields | condensed heavy italic + serif italic + a wild face (blackletter, neon glow); tiny italic whisper words | two caption tiers (subtitles under keywords), stickers and emoji, anaphora lists, price anchor, offer/guarantee close, landing-page scroll |
| **Cinematic B2B** | C | dark, grainy archival and vintage metaphor footage; warm gradients | clean sans captions, a serif wordmark | speed-ramped opening, the product UI small and centred on black, one word per image in the hook, URL typed into a search bar |

Brand colours come from recon; a look's "neon" is the brand's accent pushed
bright, declared in `brand.palette` as an authored choice.

## Captions

The film-wide `captions` track (`pitch motion schema --section captions`):

- **Which words.** The hook, the number, the enemy, the list items, the turn,
  the name, the offer. About a third of the script as keywords.
- **Two tiers** (loud DTC, long ads): `captions.subtitles` runs the whole
  read small at the bottom (`pos` ~0.76, a dark `box`), while keyword phrases
  sit `upper` or `center`. One tier for short and editorial ads.
- **Mixed type inside a phrase.** Emphasis by weight and face, not by
  underline: `stack: "line"` with a heavy keyword, a serif italic
  `{ text: "you", font: "Georgia, serif", italic: true, case: "none", weight: 400 }`,
  and small light connectives `{ text: "of the", scale: 0.5, weight: 500 }`.
- **Numbers** giant with `fx: "count"` (a count-up across the spoken word) or
  `"type"`; brackets for tags ([25], [FRUSTRATION]) as literal text.
- **Say it with the type**: `blur` for "muffled", `strike` for the old way,
  `glitch` + `big` for the insult, `accent` for the brand's word, `rgb` for
  the retention line. One per phrase.
- **Placement** in the picture's empty area, inside the safe zone (middle 80%
  of the width, above the bottom fifth — except the subtitle tier, which sits
  just above the platform's own UI at ~0.76).
- **Contrast**: white with shadow on footage; `shadow: false` on flat grounds;
  dark `color` on white; `box` when a phrase crosses busy light footage.

## Proof, honestly

- Evidence of the problem: a real source (`evidence`, or a real screenshot as
  `footage` with `scroll`/`push`), named on screen.
- Social proof only from the brand's own real numbers and reviews: a count-up
  (`fx: "count"`), before/after pairs in two `window`s, a review page scrolled.
  No invented customers, counts, ratings or quotes — if the brand has none,
  leave the beat out.
- A price anchor ("$20,000 per treatment") needs a source like any number.

## Product act and close

- Real product imagery only (the brand's site, uploads): `float`, `exploded`,
  packshots with `push`, creator or UGC footage the brand supplied.
- The reveal gets a new ground (the colour flip) and the name giant (a caption
  phrase `size` 0.25–0.35, or `logo-sting`).
- The close: `logo-sting`/`logo-cta`, or the URL typed into a search bar (a
  `line` shot with `typing`), or the landing page scrolled (`footage` +
  `scroll`). One imperative. Leave 1–1.5s of audio tail.

## Pacing checks

- First 3s: a burst or an interrupt, and words on screen by 0.5s.
- No stretch over ~8s without an interrupt; no stretch over ~4s of bursts
  without a hold.
- Every caption readable at phone size for its time on screen.
- `audio.pace: "ad"`; the read 2.7–3.5 words/s after `pitch motion tighten`.
- `pitch motion audit --max_quiet 2.5`: holds are intentional; bursts must
  still resolve into readable frames.
