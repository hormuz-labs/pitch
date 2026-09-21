---
name: promo-video
description: Creates cinematic, voice-led promotional films and brand manifestos as live shots.js previews, using rhythmic montage, sparse micro-copy, sourced or generated imagery, graphic overlays, and designed sound. Use when the user asks for a promo video, brand anthem, manifesto film, inspirational science or technology montage, or the dark editorial reference style; use launch-video for product-led feature films and video-editing for post-processing an existing file.
---

# Promo video

Create `shots.js`; the studio plays the compiled `index.html` live and the user
exports the MP4. This skill authors an original thematic promo, not a copy of a
reference film. For edits to an uploaded or rendered video file, use
[video-editing](../video-editing/SKILL.md).

Read [the editorial grammar](references/editorial-grammar.md) before planning.
It captures the supplied reference's transferable visual, pacing, type, audio,
and ending principles without depending on its footage, script, or branding.

## Shape the film

- Find one human question or tension that the brand can credibly own. Build a
  spoken thesis, not a product feature list; it must still make sense as audio.
- Decide the emotional curve from the brief. The reference-like default is
  mystery → inquiry → accelerating discovery → breath/reset → human resolve →
  quiet brand landing. Treat this as a shape, not a fixed timestamp template.
- Choose a small motif network that can match-cut across unlike sources: circle,
  eye, lens, aperture, particle field, tunnel, orbit, horizon, or another concept
  native to the subject. Every return must advance the thought.
- Write `direction.md` with audience takeaway, thesis, emotional curve, motifs,
  footage/source ledger, graphic system, sound arc, end-card copy, and a shot
  table: `id | spoken thought | focal image/action | copy | duration | connection`.

## Build the audio spine first

For original narration, read
[narration](../launch-video/references/audio/narration.md), record one continuous
read, and align it before timing shots. User-supplied licensed or public-domain
speech may be edited into a documented collage; do not scrape speeches, clone a
recognizable person's voice, or assume archival footage is free to use.

Read [audio routing](../launch-video/references/audio.md) for the music, SFX, and
mix modules actually needed. Plan one or two genuine breaths in the arrangement,
reserve signature impacts for structural turns, and let the music carry across
picture cuts. Do not imitate the reference's hot master or copy its score.

## Source and author

- Use supplied, licensed, public-domain, or product-owned footage. Record source
  and rights notes in `direction.md`. Use [generated-video](../generated-video/SKILL.md)
  only for abstract or otherwise nonexistent footage, never to fake a real
  person, product, event, or historical record.
- Inspect an unfamiliar brand with the product-research skill. Use real product
  imagery only when it supports the thesis; this treatment is metaphor-led.
- Explore effects with `pitch effects browse`, `pitch effects search`, or
  `pitch effects families`; inspect candidates with `pitch effects show <id>`,
  and load `--source` only for chosen mechanisms.
  Use each cited lab ID once.
- Follow [authoring](../launch-video/references/authoring.md) for scaffolding,
  schemas, seekable GSAP implementation, and the `direction.md`/shot workflow.
  Follow [continuity](../launch-video/references/continuity.md) for match cuts,
  transformations, and scene connections.
- Keep centered micro-copy rare and readable. Use a giant keyword only when it
  marks a true structural reset. Prefer restrained monochrome/near-black frames
  with one controlled accent family over unrelated spectacle.

## Finish

Run `pitch motion check`, then follow
[finish](../launch-video/references/finish.md): one audit, one compact settled-frame
review, and targeted transition samples only for unresolved motion. Check that
voice remains intelligible, flashes are brief and purposeful, overlays support
the image, source rights are documented, and the final brand card has enough
quiet time. Report actual runtime and unresolved limitations; MP4 export remains
the user's action.
