# Effects lab

Every Jitter template (`catalog.json`, 408 entries scraped from
jitter.video/templates) recreated in plain
HTML + CSS + JS with GSAP, three.js, lottie, and rendered to video for review.

```
effects/
  catalog.json          the 408 templates: name, family, seconds, tags, description, jitterUrl
  _lib/fx.js            the render contract (window.__fx) + preview loop
  _lib/base.css         reset + vendored fonts
  _lib/anim.js          interpolation, springs, colour and bezier helpers, merged into window.fx
  _lib/motion.js        phase/envelope/spring helpers and a world camera (window.Motion), for the launch families
  _lib/launch-primitives.js  the presets behind launch-primitives/*, one wrapper page each
  render.mjs            node effects/render.mjs --all | --missing | --family text | text/bold-text-snap
  build-index.mjs       node effects/build-index.mjs → index.html, the review gallery
  index.html            open it in a browser; every render, filterable
  <family>/<slug>/
    index.html          the effect, self-contained apart from ../../_lib and ../../../assets
    render.mp4          the frame-by-frame render (30fps, h264)
    poster.jpg          one frame at 45%
    strip.jpg           8 frames across the duration
    render.json         duration, size, console errors
    meta.json           the notes: move, how, moves[], libs[], adapt, port, caveats[], fidelity, loop, size
```

The agent reaches it through `pitch effects` (`.pi/cli/effects.ts`):
`search` returns a shortlist and one contact sheet of the results' strips,
`show <id>` returns the notes and the page to port, `families` lists the
families. The directories are the index, so an effect with an `index.html` is
found as soon as it exists; `meta.json` and `catalog.json` enrich its notes.
How films use it: `.pi/skills/launch-video/references/effects.md`. The folder
is read-only in the agent sandbox; `_lib` and `_batches` are hidden from it.

`node effects/serve.mjs` serves the human review gallery at
`http://127.0.0.1:4173/effects/index.html`. The gallery is generated from the
current files on each page request. Cards use the effect HTML itself as a live
preview: visible iframes load and play automatically, then unload offscreen so
the page never runs all effects at once. The gallery does not need MP4 or poster
files. “Open live” opens the effect at full size.

For another static server or opening the saved gallery directly, run
`node effects/build-index.mjs` after adding or rendering effects to refresh
`effects/index.html`. The saved HTML is a snapshot. MP4 and poster generation
remain optional tooling for contact strips or offline review, not gallery inputs.

## Writing an effect

```html
<!doctype html><meta charset="utf-8">
<meta name="fx" content="w=1280 h=720">
<link rel="stylesheet" href="../../_lib/base.css">
<style>/* everything this effect needs */</style>
<div class="stage">…</div>
<script src="../../../assets/gsap/gsap.min.js"></script>
<script src="../../../assets/gsap/CustomEase.min.js"></script>   <!-- only what you use -->
<script src="../../_lib/fx.js"></script>
<script>
  const tl = fx.timeline({ duration: 4 });   // paused; the renderer seeks it
  tl.from('.word', { yPercent: 120, stagger: 0.08, ease: 'expo.out', duration: 0.7 })
    .to('.word', { opacity: 0, duration: 0.3 }, 3.5);
</script>
```

For canvas / three.js / WebGL:

```js
fx.register({ duration: 6, seek(t) { /* draw the frame at time t */ renderer.render(scene, camera); } });
```

Rules, because the renderer seeks rather than plays:

- **All motion is a function of `t`.** A paused GSAP timeline seeked by `__fx.seek`,
  or a `seek(t)` you write. No `requestAnimationFrame` loops of your own, no
  `setInterval`, no `Date.now`, no `Math.random` (use `fx.rng(seed)`), no
  `repeat: -1` tweens outside the timeline. CSS `@keyframes` are seeked by the
  harness as a fallback but are second choice.
- **Assets are local.** GSAP + every plugin: `../../../assets/gsap/*.min.js`.
  three.js: `../../../assets/three/three.module.min.js` (ES module; use an
  `importmap` — the renderer launches Chromium with file access for modules
  and SwiftShader GL; `_lib/_probe/index.html` is a working three.js example,
  use `preserveDrawingBuffer: true` and render inside `seek(t)`). lottie: `../../../assets/lottie/lottie.min.js`.
  p5: `../../../assets/p5/p5.min.js` in instance mode with `noLoop()`, drawing
  inside `seek(t)` (`launch/p5-generative-wave`); a film that ports one is
  scaffolded with `--p5`. Fonts in
  `base.css`. Backgrounds in `../../../assets/backgrounds/`. No CDN, no
  network: the render runs offline.
- **Anything async is awaited** with `fx.wait(promise)` before `__fx.ready`
  flips (image decode, three.js texture load, lottie DOMLoaded).
- The template's loop length in `catalog.json` is the target duration
  (`seconds`); the effect should read as one clean loop at that length.
- The stage is the viewport. Default 1280×720; a square social template can
  declare `w=1080 h=1080`, a story `w=1080 h=1920`.
- Placeholder content, not brand content: neutral product UI, generic copy,
  no real logos. The point is the move.

## Rendering

```bash
```

`--jobs 4` pages in parallel; `--force` re-renders; `--fps 30` default. A
failed render writes `render.json` with the error and shows red in the gallery.
