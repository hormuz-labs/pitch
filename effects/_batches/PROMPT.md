You are recreating Jitter motion templates as self-contained HTML/CSS/JS effects, rendered to video for a human review. Work only inside `effects/`.

Read first, in this order:
1. `effects/README.md` — the folder layout and the render contract. Follow it exactly.
2. `effects/_lib/fx.js` — `fx.timeline`, `fx.register`, `fx.wait`, `fx.rng`.
3. `effects/text/bold-text-snap/index.html` — a finished exemplar (GSAP, local assets, paused timeline).
4. Your batch file (given below): each entry has `name`, `familySlug`, `slug`, `seconds`, `tags`, `description`. The description is Jitter's own one-liner and is the whole reference — there is no preview video. Recreate the move it describes as a motion designer would: the specific mechanism named (a snap, a collide-and-settle, a blur scroller, a morph, a ring counter, a 3D phone turn…), with expo/power eases, staggers, overshoot only where the description implies bounce, and a clean loop at about `seconds` (cap at 10s). Never a static frame: something is always moving.

For every entry create `effects/<familySlug>/<slug>/index.html`:
- `<meta name="fx" content="w=1280 h=720">` (1080x1080 or 1080x1920 when the description is clearly a social/story format).
- Local assets only, no network: GSAP + plugins from `../../../assets/gsap/` (available: gsap, CustomEase, CustomBounce, CustomWiggle, DrawSVG, EasePack, Flip, MorphSVG, MotionPath, Physics2D, PhysicsProps, ScrambleText, SplitText, TextPlugin, Observer, Draggable, Inertia), three.js ES module at `../../../assets/three/three.module.min.js` via an importmap for anything 3D (this works in the renderer — a probe at `effects/_lib/_probe/index.html` shows the exact loading pattern; use WebGLRenderer with `preserveDrawingBuffer: true` and render inside `seek(t)`), lottie at `../../../assets/lottie/lottie.min.js`, backgrounds (aurora.png, ocean.png, sunset.png, drift-*.mp4) in `../../../assets/backgrounds/`, fonts from `_lib/base.css` (Atlas Grotesk, Sharp Grotesk, Sorts Mill Goudy) or system fonts. Canvas 2D and SVG filters (feTurbulence, feDisplacementMap, feGaussianBlur, feColorMatrix) are encouraged for glitch/noise/dither/blur/liquid looks.
- All motion is a function of time via the paused timeline or your `seek(t)`; no rAF loops, no Date.now, no Math.random (use `fx.rng`), no CSS animations. Video elements: set `currentTime` from `seek(t)` and `fx.wait` for `loadeddata`.
- Placeholder content: generic product UI, neutral copy, invented brands ("Acme", "Northwind"), simple geometric logos. Build UI in DOM (fields, rows, buttons, cards, phones, browser chrome) — never an image of UI.
- Text must not clip; nothing important off-frame; readable contrast.

Process: write 4–5 effects, then render them with
`node effects/render.mjs <familySlug>/<slug> <familySlug>/<slug> ... --jobs 2`
(run from the repo root). For each, Read its `strip.jpg` (8 frames across the loop) and judge it: does it show the described move across the frames, is anything blank, clipped, static, or wrong? Read `render.json` for console errors. Fix the HTML and re-render with `--force` until the strip shows the move and there are no errors. Then the next 4–5. Do not skip the strip check — a render that "succeeded" with a blank stage is a failure.

Do not touch `effects/_lib`, `effects/render.mjs`, `effects/build-index.mjs`, `effects/catalog.json`, or folders outside your batch. Do not run `--all` or `--missing`. Do not git commit.

Final report, briefly: one line per effect — `familySlug/slug — ok|fail — the technique used, and anything you could not do faithfully`.
