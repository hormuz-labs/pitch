# Shot compiler

`shots.js` (`window.SHOTS`) → DOM + paused GSAP master timeline exposing
`__SEEK` / `__DURATION` / `__CUES` / `__READY`. This is the runtime for every
video in the studio: the preview, the element inspector, the scene strip, the
mixer and the renderer all read the same shot list.

- `schema.md` — every shot type and field, the **density layer** (`ambient`
  stage, `motion.exit`, per-shot `beats`, `word-build`, `pile`), plus how a
  project adds its own types in `js/shots.custom.js`.
- `js/factories.js` — the built-in types. `window.ShotKit` exposes the helpers
  custom factories use.
- `js/compiler.js` — brand tokens, fonts, cuts, timeline, studio inspector.
- `css/shots.css` — stage and type styles. Brand colors come from `:root`.

Projects are self-contained under `projects/<name>/` and load the engine via
`../../engine/`. Do not edit the engine from inside a project; extend it with a
project factory instead.

Preview: the studio, or serve the repo root and open
`/projects/<name>/index.html?play` (space play/pause, arrows seek).
`?audit` builds the page with drift and ambient off — what `motion_audit`
measures. `projects/pacing-demo/` is a reference shot list that passes the
gate and exercises every density feature.

Render (from the project folder — the studio's Export button does the same):

```
node ../../.pi/skills/html-motion-video/scripts/capture.mjs index.html --fps=60 --out-res=1080p --out=renders/launch-1080p.mp4
```
