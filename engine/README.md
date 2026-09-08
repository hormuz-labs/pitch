# Shot compiler

`shots.js` (`window.SHOTS`) → DOM + paused GSAP master timeline exposing
`__SEEK` / `__DURATION` / `__CUES` / `__READY`. This is the runtime for every
video in the studio: the preview, the element inspector, the scene strip, the
mixer and the renderer all read the same shot list.

- `schema.md` — every shot type and field, the **density layer** (`ambient`
  stage, `motion.exit`, per-shot `beats`, `word-build`, `pile`), plus how a
  project adds its own types in `js/shots.custom.js`.
- `js/factories.js` — the built-in types, including `lottie`, `rive` and the
  layered `ui-frame`. `window.ShotKit` exposes the helpers custom factories
  use: `three` (a WebGL stage), `lottie`, `rive`, `ready`, `frameHook`.
- `js/compiler.js` — brand tokens, fonts, cuts and transitions, the `carry`
  match cut, timeline, canvas frame hooks, asset-ready gating, studio inspector.
- The render side (`shutter`/`samples`, 10-bit, the `grade`) is
  `.pi/scripts/launch-video/lib/encode.mjs`, read from the same
  shots.js by capture.mjs and review.mjs.
- `css/shots.css` — stage and type styles. Brand colors come from `:root`.

Projects are self-contained under `projects/<name>/` and load the engine via
`../../engine/`. Do not edit the engine from inside a project; extend it with a
project factory instead.

Preview: the studio, or serve the repo root and open
`/projects/<name>/index.html?play` (space play/pause, arrows seek).
`?audit` builds the page with drift and ambient off — what `pitch motion audit`
measures. `projects/pacing-demo/` is a reference shot list that passes the
gate and exercises every density feature.

Render (from the project folder — the studio's Export button does the same):

```
node ../../.pi/scripts/launch-video/capture.mjs index.html --fps=60 --out-res=1080p --out=renders/launch-1080p.mp4
```
