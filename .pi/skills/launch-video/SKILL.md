---
name: launch-video
description: Makes or edits product-led launch films, teasers, feature announcements, kinetic-type films, and 3D product animations as live shots.js previews. Use when the product, its workflow, or a feature is the film's subject; use promo-video for ads (short-form social, footage-led, problem → product), brand manifestos and cinematic editorial montages, and demo-video for recorded browser walkthroughs.
---

# Launch films

A launch film makes a stranger understand what a product does, with the sound
off, and moves well enough to sit next to the best launch films without
looking weaker. A film with no bugs is not the same as a good film.

You build it in code: `shots.js` compiles to a live `index.html` the studio
plays as you save, every scene animated on one seekable GSAP timeline, three.js
only where depth explains something. The user exports the MP4; never render one
to check your work.

## The order of work

1. **Understand the product.** Explore it with `pitch motion inspect <url>` and
   the links it returns (product-research when it is unfamiliar), then
   `pitch motion recon <canonical-url>` once for its colours, type, logo and
   fonts. If recon fails or finds next to nothing, ask the user for
   screenshots of the product, its logo and any brand colours or fonts, and
   end the turn; their screenshots then stand in for recon. Never fill the gap
   from memory. Find its mechanism: what goes in, what comes out, what changes for
   the person using it, and what the landing page fails to show. Write
   `facts.md`: every number, name, quote and claim the film may use, each with
   its source. Nothing reaches the screen that is not in it.
2. **Study the references** the user gave, before planning
   (`references/reference-video.md`). With none, the principles below are the
   reference.
3. **Let the user choose a direction, then write the brief and storyboard**
   in `direction.md` and critique it before building anything
   (`references/storyboard.md`). The picture is cut to the sound, so the sound
   comes first. A film is narrated unless the user asks for music only: the
   script and its read (`references/audio/narration.md`) over a bed measured
   with `pitch motion beats` (`references/audio/music.md`). Each row is built
   from an effect in the library (`references/effects.md`).
4. **Build the shared pieces, then one scene at a time,** porting each row's
   effect and checking each scene before the next (`references/build.md`;
   `references/3d.md` when a scene has depth).
5. **Critique the whole film as a stranger would,** fix the biggest problem,
   and go again until it holds up (`references/finish.md`).
6. **Mix** (`references/audio.md`), then report.

An edit loads only what that change needs and keeps the established direction.

## Motion principles

1. **Motion tells the eye what to read, and in what order.** Nothing that
   matters appears all at once: each element arrives when it is to be read,
   and the movement of one leads the eye to the next (a line draws to the
   label, the cursor travels to the button, the camera pushes to the number).
   One movement leads; smaller ones start a little after it and overlap it.
   If you cannot say where the eye lands first, second and third, the shot is
   not designed yet.
2. **Everything new lands on the word that names it,** or on the music
   where no one speaks.
3. **The content makes the transition, never the frame.** The stage stays;
   the old elements leave one by one, or one already on screen becomes the
   next thing (a pill opens into the card, a word travels into the headline).
   No slide comes in or goes out.
4. **One object carries the story** across shots and keeps its identity: the
   product's own file, message, card, cursor or mark, changing role as the
   film moves on. Separate scenes then read as one piece.
5. **Things come to life; they never appear and then move.** An element is
   born travelling (scale, position, blur, a mask) and slows into a settle
   that lasts through the read instead of stopping dead. A later change comes
   from a cause that touches it (the cursor, a line, the camera), never from a
   frozen object. Every move starts from rest and settles long.
6. **Cut only on a match.** A hard cut reads as continuous when size,
   direction or subject match on both sides; a question cut to its answer
   matches in meaning. A cut where nothing matches is a new chapter.
7. **Every action has a visible result.** A tap makes a new state, a scan
   makes findings, a request makes a confirmation; a click lands on the thing
   it clicks.
8. **Type is motion, never the same motion twice running.** Words arrive in a
   way that fits what they say, from the library's `text` family (word by
   word, letter by letter, a mask wipe, a scramble, out of a blur), and
   no text entrance repeats in the next shot, and rarely at all in one film.
   Words never sit over a busy picture without something behind them, and
   never collide with or travel through other text.
9. **Vary the scale.** Close, wide, overhead, full-frame type. Never the same
   layout twice running (a heading over three cards, again).

And for every frame:

- **What leads fills the frame.** No small cards floating in empty space. This
  is about scale, not count: several things may share a large frame.
- **The brand's colours, and only those.** The ground follows the site's
  measured page (`recon/brand-tokens.md`): a light site makes a light film,
  and its dark surfaces are for objects inside it (a card, a screen). Every
  colour in your code is a token or a measured surface; a treatment colour is
  declared once in `brand.palette`. The audit fails anything else.
- **Design for the MP4.** Video keeps colour at half resolution, so thin text
  that differs from its ground only in hue (red code on navy) smears on export.
  Essential text carries light-dark contrast and is sized to read on a phone:
  crop into the code or UI rather than showing a whole editor.

Nothing in this skill is a look to repeat. Two films for two products should
not resemble each other; the product's own objects, colours and mechanism make
the difference.

## Honesty

- The logo is the product's own file (`assets/logo/` from recon, or the
  user's), placed as it is: never redrawn, retyped or approximated as a path.
  If the film needs the mark alone and only the full logo exists, use the full
  logo or ask the user for the mark.
- An icon is a real asset: the product's own, a brand mark (`pitch icons`), or
  an animated one from the library. Never a Unicode glyph (↑ ✓ ↗), an emoji
  or a path you draw.
- On screen goes only what `facts.md` holds: no invented testimonial, rating,
  price, saving, warranty, customer or result.
- Build in code first. A generated image (`pitch motion image`) or clip is a
  supporting plate, labelled a concept, never the product, a screen, a real
  customer or a finished job.

## What it is for

The brief decides the kind of film; each puts something different at the centre.

| Kind | Centre of the film |
|---|---|
| Launch / brand film | one product-specific visual idea and an emotional turn; scale, light and material carry it |
| Product walkthrough | one task from input to visible result, on real or faithfully simplified screens, cropped to the control that matters |
| Feature announcement | one change made visible: before, the action, after; supporting features stay out |
| Kinetic typography | language as the material; scale, position, masks and rhythm express meaning |
| Teaser | one reveal: what is withheld, why the viewer cares, what they remember |
| 3D product film | something physical or spatial (layers, parts, placement, scale) that flat cannot show |

Paths are relative to this skill; load each reference when its step comes.
The motion principles are adapted from Chris (@everestchris6)'s published
motion-video prompt and his MIT-licensed motion-video-kit.
