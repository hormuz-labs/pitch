# Effects — shared integration guide

Read once before adapting source from `pitch effects show <id> --source`.
Study cards describe the effect-specific mechanism; this is the common contract.

## Learn, then adapt

Look at the strip and identify the useful principle: opposing motion and a
collision, a camera revealing spatial relationships, a mask revealing a word,
a material transformation. Preserve that mechanism where it serves the concept.
Choose composition, element count, imagery, typography, colour and rhythm for
the product. The original's adaptation notes and timings describe that study;
they do not override direction.md. Reproduce it faithfully when requested.

## From a demo page to a shot factory

- DOM goes in `mount(el, shot)` in `js/shots/<type>.js`; scope selectors to `el`.
  Put styles in `css/shots/<type>.css`, scoped to that shot type.
- The demo's HTML shell, font reset, GSAP imports and preview loop belong to
  the lab. The film scaffold supplies its own shell and registered plugins.
  Keep the effect's actual geometry, masks, material and motion logic; replace
  placeholder logos, copy, UI and imagery with sourced product content.
- `fx.timeline({duration})` becomes the `gsap.timeline()` returned by
  `animate(el, shot, D)`. Map source time `t` to `t / sourceDuration * D`, then
  adjust for the film's action and reading time. Include repeats and stagger
  in the total time budget; the returned timeline must fit inside `D`.
- `fx.rng(seed)` → `ShotKit.rng(seed)`; `fx.wait(promise)` → `ShotKit.ready(promise)`.
- `fx.register({duration, seek(t)})` describes a deterministic draw function.
  Drive its time from the returned timeline. Use `ShotKit.frameHook` for canvas
  redraws and `ShotKit.three` for a 3D scene so forward/backward seeking works.
  No independent animation loop, ticker or unseeded randomness.
- `pitch motion schema --section "custom shot types"` gives the factory API.
  `pitch motion check` links new factory/style files automatically.

## Shared helpers

The lab already factors reusable code into `_lib/base.css`, `fx.js`, `anim.js`
and `motion.js`. Import tags name those dependencies; their implementations
are not part of every study. Do not read or copy the whole runtime per shot.
The film does not automatically expose the lab's `fx` or `Motion` globals.
Use the engine/GSAP equivalents, or port only needed math into one shared
project helper and reuse it.

For `Motion`-based studies: `phase(t,start,end,ease)` is clamped eased progress;
`between` maps that progress between two values; `envelope` multiplies an entry
and an exit; `spring` reshapes normalized progress. `set` applies transforms,
opacity and blur. `camera` positions a world point at the viewport centre with
zoom/rotation; use the film's viewport dimensions when adapting it.

For `launch-primitives` wrapper pages, `--source` also returns the chosen preset
and its shared setup, leaving out unrelated presets when the bundle can be
isolated safely. Those are source excerpts, not a preinstalled film factory.

## Scale and masks

Check the study's stated dimensions. A 1280×720 study scales to 1920×1080 at
1.5×; square and portrait studies need recomposition. At half-size playback,
source 16px text becomes 8px: isolate essential controls or increase scale.

An overflow-hidden mask with line-height ≤ 1 can cut descenders and accents.
When needed, give it `padding: .16em .08em .24em` and
`margin: -.16em -.08em -.24em`, start hidden text at `yPercent: 140`, and keep
the longest hero line within the safe frame. Review the adapted result.

Credit a genuinely adapted implementation with `lab: "family/slug"` on the shot.
Record the useful principle and substantial changes in direction.md. General
inspiration goes in that document, without pretending to be a source port.
