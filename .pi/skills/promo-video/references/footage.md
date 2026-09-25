# Footage: source it, prepare it, cut it

## Where pictures come from, in order

1. **The user's uploads** (`ls uploads`) and the brand's own imagery (recon,
   the site's product pages): the only source for the product itself, its
   making, its team and its customers.
2. **Licensed stock** — `pitch motion stock` (Pexels): people, places,
   objects, nature, textures; context and emotion, never the product.
3. **Generated clips** — `pitch video generate`, after reading the
   generated-video skill: only for what cannot be filmed or found (an abstract
   texture, a metaphor, an impossible camera). Never a real person, product,
   event or place presented as real. It costs the user money per clip.
4. **Built in the engine** — black cards, type, the `signal` wave, charts,
   diagrams, `evidence`: often the strongest shot and always free.

Record every clip in direction.md's footage ledger: file, origin (upload /
Pexels id and author / generated prompt), licence, and the claim it supports.
`uploads/stock/credits.json` and `assets/footage/footage.json` keep the facts;
the ledger keeps the reasons.

## Stock that works

- **Search for the picture, not the idea.** "hearing loss" finds nothing
  useful; "close-up woman covering her ears, dark background" does. Name the
  subject, the action, the framing and the light. Use `--orientation
  portrait` for a 9:16 film (landscape sources lose two thirds of their width).
- **Read the sheet.** Every search returns a numbered contact sheet: choose
  by what is visibly in the frame — a readable face, a clean silhouette, room
  for type — not by the listing text. Search again with different words
  rather than settling.
- **For a montage, one search, several picks** with matching framing and
  light, so the burst reads as one idea. Name files for a person:
  `uploads/stock/face-grey-hair.mp4`.
- **People.** A stock face is a stranger, never a customer: no quote, rating
  or "I use it" beside them. Pain, noise, crowds and joy are fine; mockery and
  medical depiction are not.
- **No key on this host** → the command says so. Use uploads, engine-built
  shots and (sparingly) generated abstraction, and say which shots lack real
  footage.

## Preparing a clip

Every video the film plays goes through `pitch motion footage` — uploads,
stock and generated clips alike:

```sh
pitch video frames --source uploads/stock/club-crowd.mp4 --times '[0,2,4,6,8,10]' --contact-sheet
pitch motion footage --src uploads/stock/club-crowd.mp4 --name club-crowd --in 3.2 --dur 2.5 --focus 0.5,0.4
```

- Look inside anything longer than ~5s first, and take the range where the
  action you need happens. **A range must not cross a cut in the source** —
  the returned five-frame strip shows it if it does; re-prepare.
- `--focus x,y` is where the kept frame is centred, in fractions of the
  source: move it onto the face or the object. The strip shows the result;
  a subject cropped out is a re-prepare, not a keep.
- Baked-in black bars are cut automatically. Low-resolution sources are
  reported ("upscaled 2.1×"): keep them short or small.
- Prepare only the range you use, plus a little: 1–4s for most shots. The
  output is silent; the soundtrack is built separately.

## Cutting footage in shots.js

```js
{ id: "faces", type: "footage", dur: 2.4, look: "mono", push: [1, 1.05], flash: "#fff",
  clips: [{ src: "assets/footage/face-1.webm" }, { src: "assets/footage/face-2.webm", in: 0.4 },
          { src: "assets/footage/face-3.webm" }, { src: "assets/footage/face-4.webm" }], every: 0.3 },
{ id: "sand", type: "footage", dur: 1.4, src: "assets/footage/hourglass.webm", rate: 0.7, push: 1.06 },
```

- `in` starts a clip later inside the prepared file; `rate` below 1 slows it
  (a 30fps source at 0.5 shows each frame twice — fine for 1s, choppy for 3s).
- A clip shorter than its time on screen freezes on its last frame: prepare a
  longer range, or `loop: true` for textures.
- Stills (packshots, screenshots, photos) use the same shot: `src` an image,
  with `push` for life. Keep images in `uploads/` or `assets/`.
- `look` grades per shot (`mono`, `mono-hard`, `warm`, `cool`, `faded`,
  `night`, `vivid`, or a CSS filter); the top-level `grade` (`pitch motion
  schema --section "render and grade"`) finishes the whole film, e.g. a touch
  of `grain` over mixed stock sources so they sit together.
- `shade` (0.2–0.45) darkens busy footage under captions.
- `window` sets footage in a rounded frame on the shot's `bg` — the way the
  studied ads show selfies, UGC, screenshots and archive: `window: 0.78`, or
  `{ w: 0.8, h: 0.5, y: 0.55, border: "<brand accent>", glow: true, from: 1,
  at: 0.2 }` to shrink it out of full-bleed mid-shot (an interrupt).
  Two windows side by side (two shots, or two `x` positions across a cut) make
  a before/after.
- `scroll: [0.05, 0.3]` travels down a tall image: a landing page, a wall of
  reviews, a long article (capture it with `pitch motion screenshot
  --fullPage`, then crop or scroll it). Keep the travel slow enough to read
  one line, or fast and blurred as a "there's so much" interrupt.
- Check the result with `pitch motion review --times …` at the bursts: every
  tile shows the exact frame the export will.

## Bursts that read

- Prepare each burst clip short (0.5–1.5s) around the frame you want, with
  `--focus` on the same point (the eyes, the product) so every clip lands the
  subject in the same place of the frame.
- One search, several picks with the same light and framing; `look` the
  whole burst alike (`mono` for a problem act).
- The caption over a burst holds for the whole burst; the burst ends on a
  hold, not on the fastest clip.
- A speed ramp: the same subject as two clips, the first at `rate` 0.4, the
  second at `rate` 2, cut on the stressed word.

## Creator and UGC footage

Talking-to-camera clips, routines, unboxings and before/after selfies are the
strongest proof — and they must be real: the user's uploads or the brand's
own customers with permission. Never stock or generated people presented as
customers. A creator clip's own audio can be the narration: extract it with
`pitch media ffmpeg` to `audio/vo.wav`, align it, and cut the picture to it.

## Product imagery

- Harvested images from the brand's site (`pitch motion recon` writes them;
  `ls recon assets`) and uploads. Transparent PNGs are best: they float,
  explode and sit on any stage.
- Product video from the brand (a turntable, an unboxing, a use shot) goes
  through `pitch motion footage` like everything else.
- Missing? Say so. Do not substitute a generated or similar-looking product.
