---
name: promo-video
description: Makes promotional films and ads as live shots.js previews — short-form social and performance ads (Reels, TikTok, Shorts, Stories, paid social, DTC, UGC-style, B2B) that hook in three seconds, cut in bursts under word-synced captions, keep a fast, performed voiceover and drop the music on the turn; and cinematic voice-led brand manifestos. Use it for any request to make an ad, a promo, a commercial, a product video for social, "an ad like this reference", a video from stock or uploaded footage, a brand anthem or manifesto — even when the user only says "make a video for my product/site" and the result is meant to sell. Use launch-video when the product's UI walkthrough is the subject, and video-editing to post-process an existing file.
---

# Promo videos and ads

Build `shots.js`; the studio plays it live and the user exports the MP4. This
skill makes an original film in a studied shape — never a copy of a
reference's footage, words, voice, music or brand.

## Choose the treatment

| The brief | Treatment | Read first | Frame |
|---|---|---|---|
| An ad for a product or service: short-form, social, paid, DTC, B2B, "sell this", a reference ad to match | social ad | [social-ad.md](references/social-ad.md) | 9:16 |
| A brand anthem, manifesto, inspirational or editorial montage led by a spoken idea | manifesto | [editorial-grammar.md](references/editorial-grammar.md) | 16:9 |

The frame follows the placement: 9:16 for Reels/TikTok/Shorts/Stories (the
ad default), 4:5 or 1:1 for a feed, 16:9 for YouTube pre-roll or a site hero.
When the brief does not say, take the default and name it in the summary.
Set it once with `pitch motion scaffold --format 9:16`.

For an ad, also choose a **look** — editorial DTC, loud DTC or cinematic B2B
(social-ad.md → Three looks) — from the product and its audience, and keep
its devices together. [reference-studies.md](references/reference-studies.md)
has five studied ads beat by beat; read the one nearest the brief.

## Workflow

1. **Facts.** Read the product (product-research skill, `pitch motion recon
   <url>` for colours, fonts and logo). Collect what the film may claim: the
   product's own facts, at most one or two outside facts with their source
   page (`pitch motion inspect <url>`), and real product imagery (uploads,
   then the site).
2. **Script.** Write it for the ear in the arc of the treatment: a hook that
   works in 3 seconds, one number, the enemy, the turn, the name, proof, the
   close. Aim for runtime × 3 words/s. Put delivery marks in it (below).
3. **Sound score, then voice.** Write the sound score first: the voice's
   character in a few words, and for every beat what the voice feels, what
   the music section does and which sound acts it out
   ([ad-sound.md](references/ad-sound.md) → Step 1). Then cast a Gemini voice
   from the character, audition two on the plain hook, and record one
   continuous, performed read: `pitch motion tts --pace ad --provider gemini
   --model gemini-3.8-flash-tts --voice <name>`. The script is directed in
   turns, `{dry and sarcastic, speaking rapidly}` at each change of feeling
   from the score, with a few `<sigh>`/`<laugh>` events inline. Remove the breaths with
   `pitch motion tighten`, then `pitch motion align`.
4. **direction.md.** Takeaway, audience, placement, look, the script, the
   claim ledger (each fact → its source), the footage ledger (each clip →
   file, origin, licence), the **sound score** (voice character, each beat's
   feeling, music sections and drops on named words, the sounds) and the shot
   table
   `id | spoken words (cue) | density (BURST / HOLD / INTERRUPT) | picture | source | caption | sound`.
   Alternate densities: a burst in the first 3 seconds, an interrupt every
   5–10, a hold on every proof.
5. **Picture.** Source and prepare footage ([footage.md](references/footage.md));
   build the special shots from [recipes.md](references/recipes.md); the
   skeleton in [example-ad.md](references/example-ad.md) shows the pieces
   together. Scaffold, then add shots in small batches with `pitch motion check`.
6. **Words on screen.** The `captions` track — keywords, mixed type, and for
   long or loud ads a `subtitles` tier (`pitch motion schema --section
   captions`) — then `pitch motion sync --write` for cued shots.
7. **Sound.** Perform the score: choose a library bed and cut it into
   sections with `audio.fx` (`thin` windows that end on the drop words, a
   `breath` before the name, one `muffle` or `ring` if a word asks for it),
   put manifest SFX on the score's moments (a riser ending on the turn, an
   impact on it), then `pitch motion mix` and listen against the score
   ([ad-sound.md](references/ad-sound.md)). There is no ElevenLabs step: no
   generated music or custom sound effects.
8. **Finish.** [finish](../launch-video/references/finish.md): one `pitch
   motion review`, `--times` inside every burst and across the turn, one
   `pitch motion audit`. Report runtime, frame, sources and anything
   unresolved. Export belongs to the user.

## Tools this skill leans on

| Need | Command |
|---|---|
| Frame, footage, captions, audio fx fields | `pitch motion schema --section "format,footage,captions,audio effects"`, `pitch motion schema --types footage --types evidence --types card` |
| Stock footage/photos (licensed) | `pitch motion stock --mode search …`, then `--mode get --pick N --name …` |
| Prepare any clip for the film | `pitch motion footage --src … --name … --in … --dur … --focus x,y` |
| Look inside a long source | `pitch video frames --source … --times '[…]' --contact-sheet` |
| Footage that cannot exist (abstract, metaphor) | `pitch video generate` — read [generated-video](../generated-video/SKILL.md) first |
| A source page, read or captured | `pitch motion inspect <url>`, `pitch motion screenshot --url … --out … [--fullPage]` |
| Record the voice (Gemini) | `pitch motion tts --pace ad --provider gemini --model gemini-3.8-flash-tts --voice <name>` (script directed in `{turns}`), `pitch motion tighten`, `pitch motion align`, `pitch motion sync --write` |
| Music bed and its sections | `pitch motion find-audio`, `pitch media review --purpose music` (optional), `audio.fx` `thin` / `muffle` / `ring`, `breath` beats |
| Sound effects, mix | `pitch motion sfx --mode query --event "…"`, `pitch motion sfx --mode build`, `pitch motion mix` |
| Other motion | `pitch effects search/show` (see launch-video's effects list); cite `lab` only for ported source |

## Non-negotiable

- **No invented evidence.** Every number, study, quote, review, rating,
  customer count, before/after, award or "as seen in" on screen or in the
  voice traces to a source recorded in direction.md. `evidence` shots quote
  the source verbatim and name it. No source, no claim: rewrite the line as
  the brand's own promise, or cut the beat.
- **The product is real.** Product shots come from the brand's imagery or the
  user's uploads — never generated, redrawn or composited into stock footage.
  Stock and generated footage show context, emotion and metaphor, never the
  product in use.
- **People in stock are not customers.** Never pair a stock or generated
  face with a testimonial, a quote, a before/after or "I use it". Creator and
  UGC proof comes only from real footage the user supplies.
- **Health, money and safety claims** stay inside the source's own wording:
  no cures, guarantees or fear beyond what the source says. An offer
  (risk-free, a guarantee, a price) must be the brand's real offer.
- **Sound is performed, not applied.** The voice changes feeling at least
  three times, the bass returns on a named word, and the turn is the biggest
  sound moment. Narration is always Gemini TTS; never call `pitch motion
  voices`, `music` or `sound` (ElevenLabs) from this skill.
- **Flashes are brief.** Bursts of hard cuts and one-frame flashes last under
  a second and never strobe for longer; `glitch` marks act changes only.
- **Readable at phone size.** Keywords stay inside the safe area (middle 80%
  of the width, above the bottom fifth); subtitles sit just above it with a
  `box`; every caption holds long enough to read.

If a needed input is missing — no product imagery, no stock key, no source
for a claim, no real reviews — say so first in the summary and show what
replaced it.
