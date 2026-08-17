# Project Architecture — Shell, Scene Modules, Master Timeline, Shims, Cursor

Reference code for Phase 3. Colors, fonts, and easings in these snippets are
**placeholders** — always substitute the values from `direction.md`.

---

## 1. index.html (thin shell)

No inline styles or scripts beyond the loader. The `#bg-layer` contents depend
on the background system chosen in direction.md (grid lines, gradient mesh,
paper grain, glow shapes…) — there is no fixed set of orbs.

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Launch Video</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=<FONTS-FROM-DIRECTION>&display=swap">
  <link rel="stylesheet" href="css/base.css">
  <link rel="stylesheet" href="css/cursor.css">
  <link rel="stylesheet" href="css/ui-components.css">
  <link rel="stylesheet" href="css/scenes.css">

  <!-- GSAP core + the plugin palette chosen in direction.md. vendor/gsap/ is
       copied from the skill's vendored dist at scaffold time
       (cp -R $SKILL/vendor/gsap vendor/gsap) and contains EVERY plugin,
       including the Club bonus ones: SplitText, DrawSVG, MorphSVG,
       ScrambleText, Physics2D, CustomBounce, CustomWiggle, Inertia, ... -->
  <script src="vendor/gsap/gsap.min.js"></script>
  <script src="vendor/gsap/SplitText.min.js"></script>
  <script src="vendor/gsap/DrawSVGPlugin.min.js"></script>
  <script src="vendor/gsap/MotionPathPlugin.min.js"></script>
  <script src="vendor/gsap/CustomEase.min.js"></script>
  <script src="vendor/gsap/TextPlugin.min.js"></script>
  <!-- Load only what this video uses. NEVER load GSDevTools in a render
       build. All non-GSAP scripts stay at the END of <body> (below) so the
       DOM they reference exists — see SKILL.md invariants #13–14. -->
</head>
<body>
  <div id="viewport">
    <!-- Living background per direction.md's background system -->
    <div id="bg-layer"></div>

    <div id="camera">
      <div id="scene1" class="scene">
        <div class="camera-content"><!-- Scene HTML --></div>
      </div>
      <div id="scene2" class="scene">
        <div class="camera-content"></div>
      </div>
      <!-- ... -->
    </div>

    <!-- Persistent shared-element/portal assets during scene boundaries. -->
    <div id="transition-layer" aria-hidden="true"></div>

    <!-- Cursor rig (above scenes, below finish layers). Hidden by default. -->
    <div id="cursor-rig">
      <div id="cursor-glow"></div>
      <div id="cursor-pointer-wrap">
        <svg id="cursor-pointer" viewBox="0 0 24 24" width="28" height="28">
          <path d="M4 2l6.5 16 2.5-6 6-2.5L4 2z"/>
        </svg>
      </div>
      <div id="cursor-ripple"></div>
    </div>

    <!-- Finish pass: optional, per direction.md (vignette suits dark systems;
         light/editorial systems may want only grain, or nothing) -->
    <div id="finish-layer"></div>
  </div>

  <script src="js/timing.js"></script>
  <script src="js/focus.js"></script>
  <script src="js/cursor.js"></script>
  <script src="js/transitions.js"></script>
  <script src="js/scenes/scene1.js"></script>
  <script src="js/scenes/scene2.js"></script>
  <!-- ... all scenes ... -->
  <script src="js/master.js"></script>
</body>
</html>
```

- `#viewport` is a fixed 1920×1080 stage.
- Each product-demo scene gets one full-stage `.camera-content` wrapper with
  `position:absolute; inset:0; transform-origin:0 0;`. The focus director
  transforms that wrapper; screen-edge chrome that must stay fixed lives
  outside it.
- **`.scene` starts hidden:** `css/base.css` sets `.scene { position: absolute;
  inset: 0; opacity: 0; }` so every scene is invisible until master.js fades
  it in (and back out — see §3). Without this, later scenes sit visible on top
  of the current one from frame 0.
- Grain, if used, is an SVG `feTurbulence` rect in `#finish-layer` at low
  opacity; keep `mix-blend-mode` appropriate to light vs dark base.

## 2. Scene module pattern (js/scenes/sceneN.js)

Each scene file defines a global function returning a `gsap.timeline()`. Scene
duration comes from `SCENE_TIMING` (js/timing.js, generated from measured VO
clips in Phase 3) — never a guessed constant:

```js
function scene4() {
  const D = window.SCENE_TIMING.scene4.dur;   // measured VO + air
  const tl = gsap.timeline();

  tl.set("#scene4", { opacity: 1 })
    // Content entrances chain from t≈0.2 onward, relative offsets
    .from("#scene4 .demo-shell", { y: 150, scale: 0.7, opacity: 0, duration: 0.9, ease: EASE.entrance }, 0.2)
    // ... all content tweens, selectors ALWAYS scoped to #scene4 ...
    // Semantic camera track LAST; it overlaps the interaction at explicit time.
    .add(FocusDirector.focusElement("#scene4 .composer", {
      label: "scene4", measureOffset: 1.15, scale: 2.1,
      landingX: 1030, landingY: 520, hold: 1.2,
      release: { scale: 1.08, x: -35, y: 0 },
    }), 0.8);

  return tl;
}
```

Rules baked into this pattern:
- **All selectors scoped to the scene ID.** GSAP `.from()` is
  `immediateRender: true`; unscoped selectors corrupt other scenes at load.
- **Camera transform track last** — placing a full-duration camera tween first
  would make subsequent relative tweens chain after it. Semantic focus tracks
  use explicit beat positions; restrained ambient drift, when needed, starts at
  position `0`.
- `EASE.*`/duration constants come from a small `js/motion-tokens.js` (or top
  of transitions.js) that encodes the motion language from direction.md, so
  the whole video shares one vocabulary.

## 3. Master timeline (js/master.js)

```js
// Register exactly the plugin palette this video loads in index.html
gsap.registerPlugin(SplitText, DrawSVGPlugin, MotionPathPlugin, CustomEase, TextPlugin);

const master = gsap.timeline({ paused: true });

// Scenes chain through addScene, which wraps every scene in an explicit
// fade-IN at its label and fade-OUT at the end of its window. The fade-out is
// NOT optional: without it the scene stays visible under every later scene
// and the final MP4 shows all scenes stacked on top of each other
// (SKILL.md invariant #19 — audit.mjs fails the build on this).
function addScene(sceneTl, sceneId, label, overlap = "-=0.4") {
  master.addLabel(label, master.duration() ? overlap : 0);
  master.to(`#${sceneId}`, { autoAlpha: 1, duration: 0.4, ease: "none" }, label);
  master.add(sceneTl, label);
  const outTime = `${label}+=${window.SCENE_TIMING[sceneId].dur}`;
  master.to(`#${sceneId}`, { autoAlpha: 0, duration: 0.4, ease: "none" }, outTime);
}

addScene(scene1(), "scene1", "scene1", 0);
addScene(scene2(), "scene2", "scene2", "-=0.4");
addScene(scene3(), "scene3", "scene3", "-=0.4");
// ... relative offsets only — absolute .add(scene(), 21.0) is banned

// Capture finite duration BEFORE any infinite-repeat ambient tweens
const CONTENT_DURATION = master.duration();

// DrawSVG paths must be initialized hidden HERE (load time), not inside a
// timeline callback — otherwise they flash visible → hidden → drawn.
gsap.set(".chart-path, .connector-path", { drawSVG: "0%" });

window.__SEEK = (t) => { master.seek(t, false); };
window.__DURATION = () => CONTENT_DURATION;
window.__CUES = () => Object.entries(master.labels).map(([label, time]) => ({ label, time }));

// Resolve scene-relative click targets ({label, offset} → absolute time).
// Prefer this over hardcoded targetTime — VO regen shifts labels and
// silently desyncs hardcoded numbers.
CursorController.pendingClicks.forEach((entry) => {
  if (entry.opts.label !== undefined) {
    entry.opts.targetTime = master.labels[entry.opts.label] + (entry.opts.offset || 0);
  }
});

setupAmbient(CONTENT_DURATION);   // background living-motion layer (repeat: -1 allowed now)

// Fonts affect DOM geometry. Resolve both attention frames and cursor targets
// only after fonts load, then signal capture readiness.
document.fonts.ready.then(() => {
  FocusDirector.resolveLabelTimes(master);
  FocusDirector.bindAllFrames();  // seek-measure camera targets (see §6)
  CursorController.bindAllClicks(); // seek-measure click targets (see §5)
  window.__READY = true;
});
```

Determinism rules: no CSS animations/transitions, no `gsap.ticker`, and no
`Math.random()` — use a seeded generator so `__SEEK(t)` is reproducible:

```js
function rng(seed) { return () => ((seed = Math.imul(48271, seed)) >>> 0) / 4294967296; }
const rand = rng(1234);
```

## 4. Text & SVG plugin usage (real plugins, vendored)

SplitText, DrawSVG, and the other Club bonus plugins are vendored **in this
repo** at `$SKILL/vendor/gsap/` (GSAP 3.15 — see `VERSION.txt`), so they are
always available regardless of npm/CDN. **No shims.** Usage rules that keep
the render correct:

```js
// SplitText — split at build time (before master assembly), stagger in scenes.
// - charsClass/wordsClass/linesClass give you stable CSS hooks. Target .char
//   in CSS, NEVER ".headline span" (matches both word wrappers and char
//   spans → double-renders background-clip gradients).
// - NEVER split gradient wordmarks (.brand-word etc.) — background-clip:text
//   breaks across child spans. Animate the whole word instead.
const split = SplitText.create("#scene2 .headline", {
  type: "lines,words,chars",
  charsClass: "char", wordsClass: "word", linesClass: "line",
  mask: "lines",           // wraps each line in a clipped slot → mask reveals
  autoSplit: true,         // re-splits after fonts load (fonts change wrapping)
});
tl.from(split.chars, { yPercent: 110, duration: 0.6, ease: EASE.entrance, stagger: 0.02 });

// ScrambleText — decode-in for technical brands
tl.to("#scene3 .metric-label", {
  scrambleText: { text: "LATENCY: 4ms", chars: "01<>/", speed: 0.4 }, duration: 0.9,
});

// DrawSVG — initialize hidden at LOAD TIME in master.js (never in a timeline
// callback — the path flashes visible → hidden → drawn otherwise):
gsap.set(".chart-path", { drawSVG: "0%" });          // at load
tl.to("#scene5 .chart-path", { drawSVG: "100%", duration: 1.6 });  // in scene

// MorphSVG — morph between same-purpose icons (checkbox → checkmark,
// upload → done). Keep morphs meaningful, not decorative.
tl.to("#scene6 .status-icon path", { morphSVG: "#scene6 .icon-check", duration: 0.6 });
```

Split text and set DrawSVG initial states **once at load** (master.js), not
per-seek — `__SEEK(t)` must land on identical DOM every time.

## 5. Cursor controller (js/cursor.js)

Policy (single source of truth — see SKILL.md §4.6): hidden by default,
appears only to perform a real interaction, then leaves. No idle presence.

**Init-order contract (SKILL.md invariant #14):** `init()` captures DOM refs,
so it must run after the `#cursor-rig` markup exists — cursor.js loads at the
end of `<body>` and init is deferred to DOMContentLoaded as a belt-and-braces.
`bindAllClicks()` runs LAST, after master assembly, and self-guards: calling
it with refs missing used to crash the whole build with
`Uncaught TypeError: Cannot read properties of null (reading '_gsap')`
(GSAP receiving null targets).

```js
const CursorController = {
  wrap: null, ptr: null, glow: null, ripple: null, pendingClicks: [],
  init() {
    this.wrap = document.querySelector("#cursor-pointer-wrap");
    this.ptr = document.querySelector("#cursor-pointer");
    this.glow = document.querySelector("#cursor-glow");
    this.ripple = document.querySelector("#cursor-ripple");
    if (this.wrap) {
      gsap.set([this.wrap, this.glow], { x: 1400, y: 760, opacity: 0 });
      gsap.set(this.ptr, { rotation: 0, transformOrigin: "5px 2px" });
    }
  },

  // Curved swoop (separate x/y easings) → tilt into the turn → settle →
  // squash press → ripple → elastic release → leave. Never straight lines,
  // never 360° spins.
  clickAt(x, y, opts = {}) {
    const { fromX = x - 260, fromY = y + 190, travel = 0.85, hold = 0.12, tilt = -18 } = opts;
    const tl = gsap.timeline();

    tl.set([this.wrap, this.glow], { x: fromX, y: fromY })
      .set(this.ptr, { rotation: tilt * 0.4, scale: 0.9 })
      .to([this.wrap, this.glow], { opacity: 1, duration: 0.2, ease: "sine.out" })
      .to(this.wrap, { x, duration: travel, ease: "power2.inOut" }, "<")
      .to(this.wrap, { y, duration: travel, ease: "power3.out" }, "<")
      .to(this.glow, { x, y, duration: travel, ease: "power2.inOut" }, "<")
      .to(this.ptr, { rotation: tilt, duration: travel * 0.5, ease: "power2.out" }, "<")
      .to(this.ptr, { rotation: 0, scale: 1.08, duration: travel * 0.5, ease: "sine.inOut" }, `<${travel * 0.4}`)
      .to(this.ptr, { scale: 1, duration: 0.12, ease: "sine.inOut" })
      .to(this.ptr, { scaleX: 0.74, scaleY: 1.2, duration: 0.09, ease: "power2.in" }, `+=${hold}`)
      .to(this.glow, { scale: 1.5, opacity: 0.95, duration: 0.09 }, "<")
      .fromTo(this.ripple, { x, y, scale: 0, opacity: 1 }, { scale: 2.6, opacity: 0, duration: 0.58, ease: "power2.out" }, "<")
      .to(this.ptr, { scaleX: 1.14, scaleY: 0.88, duration: 0.14, ease: "back.out(2)" })
      .to(this.ptr, { scaleX: 1, scaleY: 1, duration: 0.22, ease: "elastic.out(1, 0.42)" })
      .to(this.glow, { scale: 1, opacity: 0.5, duration: 0.3, ease: "sine.out" }, "<")
      .to([this.wrap, this.glow], { opacity: 0, duration: 0.28, ease: "sine.in" }, "+=0.28");

    return tl;
  },

  // Scene modules call this — it records a placeholder timeline that gets
  // filled in by bindAllClicks() after master assembly.
  clickElement(selector, opts = {}) {
    const tl = gsap.timeline();
    this.pendingClicks.push({ selector, opts, tl });
    return tl;
  },

  // PRECISE TARGETING: measuring getBoundingClientRect() at script-build time
  // gives stale coordinates (elements still carry their .from() offsets).
  // bindAllClicks() runs after master assembly: seeks master to targetTime,
  // measures the RENDERED center, then builds the real clickAt timeline.
  bindAllClicks() {
    if (!this.wrap) this.init();          // guard: never run against null refs
    if (!this.wrap) {                     // rig genuinely absent from the DOM
      console.warn("CursorController: #cursor-rig not in DOM — skipping clicks");
      return;
    }
    this.pendingClicks.forEach(({ selector, opts, tl }) => {
      const { targetTime, travel = 0.85, hold = 0.12, tilt = -16 } = opts;
      let targetX = 960, targetY = 540;
      if (targetTime !== undefined && window.__SEEK) {
        window.__SEEK(targetTime);
        const target = document.querySelector(selector);
        if (!target) throw new Error(`CursorController: click target not found: ${selector}`);
        const r = target.getBoundingClientRect();
        const vp = document.querySelector("#viewport").getBoundingClientRect();
        targetX = (r.left - vp.left) + r.width / 2;
        targetY = (r.top - vp.top) + r.height / 2;
      }
      tl.add(this.clickAt(targetX, targetY, { fromX: targetX - 260, fromY: targetY + 190, travel, hold, tilt, ...opts }));
    });
    if (window.__SEEK) window.__SEEK(0);
  }
};
// Defer init until the DOM exists — cursor.js already loads at the end of
// <body>, but this makes the controller safe even if script order changes.
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => CursorController.init());
} else {
  CursorController.init();
}
```

Usage in a feature scene (always via element + targetTime, never raw coords).
Prefer `{ label, offset }` over a hardcoded `targetTime` — master.js resolves
it against the real labels after assembly, so VO regeneration can't desync
the click:

```js
tl.add(CursorController.clickElement("#scene5 .apply-btn", { label: "scene5", offset: 1.1, travel: 0.8 }), 1.1)
  .to("#scene5 .apply-btn", { scale: 0.92, yoyo: true, repeat: 1, duration: 0.15 }, "<1.1");
```

## 6. Focus director (js/focus.js)

The focus director uses the same deferred seek-and-measure principle as the
cursor. A scene records a placeholder timeline; after master assembly and font
loading, the director seeks to the settled target state, measures at camera
identity, and fills the placeholder with deterministic numeric transforms.

```js
const FocusDirector = {
  pending: [],

  focusElement(selector, opts = {}) {
    const tl = gsap.timeline();
    this.pending.push({ selector, opts, tl });
    return tl;
  },

  resolveLabelTimes(master) {
    this.pending.forEach((entry) => {
      const { label, measureOffset = 0 } = entry.opts;
      if (label !== undefined) {
        entry.opts.measureTime = master.labels[label] + measureOffset;
      }
    });
  },

  bindAllFrames() {
    this.pending.forEach(({ selector, opts, tl }) => {
      const target = document.querySelector(selector);
      if (!target) throw new Error(`FocusDirector: target not found: ${selector}`);
      const content = target.closest(".camera-content");
      if (!content) throw new Error(`FocusDirector: ${selector} needs .camera-content`);

      if (opts.measureTime !== undefined && window.__SEEK) {
        window.__SEEK(opts.measureTime);
      }

      const saved = {
        x: gsap.getProperty(content, "x"),
        y: gsap.getProperty(content, "y"),
        scale: gsap.getProperty(content, "scale"),
        transformOrigin: gsap.getProperty(content, "transformOrigin"),
      };
      gsap.set(content, { x: 0, y: 0, scale: 1, transformOrigin: "0 0" });

      const cr = content.getBoundingClientRect();
      const tr = target.getBoundingClientRect();
      const cx = tr.left - cr.left + tr.width / 2;
      const cy = tr.top - cr.top + tr.height / 2;
      const scale = opts.scale || 2;
      const frame = {
        scale,
        x: (opts.landingX || 960) - scale * cx,
        y: (opts.landingY || 540) - scale * cy,
      };

      gsap.set(content, saved);
      tl.to(content, {
        ...frame,
        duration: opts.duration || 0.68,
        ease: opts.ease || "power4.inOut",
        transformOrigin: "0 0",
      });
      if (opts.hold) tl.to({}, { duration: opts.hold });
      if (opts.release) {
        tl.to(content, {
          ...opts.release,
          duration: opts.releaseDuration || 0.92,
          ease: opts.releaseEase || "power2.inOut",
        });
      }
    });
    if (window.__SEEK) window.__SEEK(0);
  },
};
```

This is the core calculation. Production implementations must also clamp the
computed frame to safe margins and support normalized image hotspots. See
`attention-camera.md` for scale tiers, hotspot math, and framing policy.

## 7. Cursor CSS (css/cursor.css)

Style the cursor with the **brand's accent color** from direction.md — the
indigo below is a placeholder. On light backgrounds invert: dark pointer,
darker soft shadow, subtler glow.

```css
#cursor-rig { position: absolute; inset: 0; z-index: 900; pointer-events: none; }
#cursor-pointer-wrap { position: absolute; top: 0; left: 0; will-change: transform; }
#cursor-pointer {
  width: 44px; height: 44px;
  filter: drop-shadow(0 3px 10px rgba(0,0,0,0.35));
}
#cursor-pointer path { fill: #fff; stroke: rgba(0,0,0,0.55); stroke-width: 1.2; }
#cursor-glow {
  position: absolute; top: -14px; left: -14px; width: 72px; height: 72px;
  border-radius: 50%; opacity: 0.5; will-change: transform;
  background: radial-gradient(circle, var(--accent-40) 0%, var(--accent-20) 40%, transparent 70%);
}
#cursor-ripple {
  position: absolute; width: 50px; height: 50px; border-radius: 50%;
  border: 2px solid var(--accent); background: var(--accent-15);
  transform: translate(-50%, -50%) scale(0); opacity: 0; pointer-events: none;
}
```

## 8. Transitions (js/transitions.js)

Implement the 2–3 transition helpers your motion language calls for (see
`creative-direction.md` Axis 3, `scene-transitions.md`, and recipes in
`effects-catalog.md` #12–14). All transitions:

- chained with relative offsets (`">-0.5"`),
- classified in the storyboard as a connected bridge or motivated chapter cut,
- preserve one named property across connected boundaries (identity, position,
  velocity, shape, color, or meaning),
- outgoing scene visibly departing while incoming arrives (~0.3–0.8s overlap),
- **the outgoing scene always ends fully transparent** (`autoAlpha: 0`) — a
  transition that only moves/scales the old scene off-camera still leaves it
  composited; opacity is the only guaranteed hide,
- never two readable screens at rest simultaneously.

Persistent bridge duplicates live in `#transition-layer` above scenes and are
hidden before/after their exact handoff window. Seek-measure their outgoing and
incoming rectangles after fonts/assets load; never guess shared-element
coordinates. Full hierarchy and implementation recipes:
`scene-transitions.md`.
