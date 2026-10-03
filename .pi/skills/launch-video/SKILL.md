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

Elsewhere: an ad, promo, brand anthem or editorial montage is
[promo-video](../promo-video/SKILL.md); changing an existing video file is
[video-editing](../video-editing/SKILL.md); a recorded browser walkthrough is
demo-video.

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
   (`references/storyboard.md`). A narrated film writes and
   records its read first (`references/audio/narration.md`); the picture is
   timed to it.
4. **Build the shared pieces, then one scene at a time,** checking each before
   the next (`references/build.md`; `references/3d.md` when a scene has depth).
5. **Critique the whole film as a stranger would,** fix the biggest problem,
   and go again until it holds up (`references/finish.md`).
6. **Sound** (`references/audio.md`), then report.

An edit loads only what that change needs and keeps the established direction.

## Motion principles

1. **The front of the shot becomes the transition.** A title, logo or object
   moves toward the camera or across the frame while the next scene already
   waits underneath. The thing that clears a shot is often what the next one
   is about.
2. **One object carries the story** across shots and keeps its identity: the
   product's own file, message, card, cursor or mark, changing role as the
   film moves on. Separate scenes then read as one piece.
3. **One movement leads.** Smaller ones layer under it, start a little after
   it and overlap it, so the frame never stops or starts all at once. A
   composition can hold many elements; only one leads.
4. **The speed always changes.** Things arrive decelerating, rest long enough
   to read, leave accelerating, and the next thing slows as it arrives.
   Nothing moves linearly except a continuous loop.
5. **Cut only on a match.** A hard cut reads as continuous when size,
   direction or subject match on both sides; a question cut to its answer
   matches in meaning. A cut where nothing matches is a new chapter.
6. **Every action has a visible result.** A tap makes a new state, a scan
   makes findings, a request makes a confirmation. An action with no
   consequence is decoration.
7. **Type is motion.** Big words enter from opposite sides, reveal the next
   scene, arrive in phrases fully formed, and never sit over a busy picture
   without something behind them. Text never collides with or travels
   through other text.
8. **Vary the scale.** Close, wide, overhead, full-frame type. Never the same
   layout twice running (a heading over three cards, again).

And for every frame:

- **What leads fills the frame.** No small cards floating in empty space. This
  is about scale, not count: several things may share a large frame.
- **Frame one is a finished picture.** It is the thumbnail and the autoplay
  still, never a word halfway through flying in.
- **Set the film on the product's ground.** The background and surfaces are
  colours recon measured (`recon/brand-tokens.md`) or the user gave you. A
  colour that is not there is not the product's, whatever you call it ("its
  IDE canvas"). Go dark only when recon measured a dark site or the user asks;
  a mood (power, speed, energy, premium, cinematic) is not a reason. Dark
  grey-blue with glowing lines is the stock "tech film" look, and the audit
  notes it.
- **Design for the MP4.** Video keeps colour at half resolution, so thin text
  that differs from its ground only in hue (red code on navy) smears on export.
  Essential text carries light-dark contrast and is sized to read on a phone:
  crop into the code or UI rather than showing a whole editor.

Nothing in this skill is a look to repeat. Two films for two products should
not resemble each other; the product's own objects, colours and mechanism make
the difference.

## Honesty

- On screen goes only what `facts.md` holds: no invented testimonial, rating,
  price, saving, warranty, customer or result.
- Build in code first. A generated image (`pitch motion image`) or clip is a
  supporting plate, labelled a concept, never the product, a screen, a real
  customer or a finished job.
- In reports, separate what you measured from what still needs a person to
  watch or listen to.

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

Runtime follows what the film has to show and be read; it is approximate unless
the user says exact or a maximum. Report the actual length.

## References

Paths are relative to this skill. Load each when its step comes.

| Step | Read |
|---|---|
| Study a video the user supplied | `references/reference-video.md` |
| Brief, idea, directions to choose from, storyboard and its critique | `references/storyboard.md` |
| Build with the engine: shared pieces, scenes, joins, type | `references/build.md` |
| A scene with real depth (three.js) | `references/3d.md` |
| Critique rounds, the quality bar, the report | `references/finish.md` |
| Narration: script and record before building | `references/audio/narration.md` |
| Music, sound effects, mix | `references/audio.md` |

The motion principles are adapted from Chris (@everestchris6)'s published
motion-video prompt and his MIT-licensed motion-video-kit.
