# Effects Catalog — After Effects-Style Recipes in GSAP

All recipes assume a paused master timeline (see SKILL.md Phases 3–4). Each `sceneN()`
returns a `gsap.timeline()` that gets `.add()`-ed to the master timeline using relative position offsets (`">-0.5"`).
Never use CSS animations/transitions or `gsap.ticker` — everything lives on the timeline so `__SEEK(t)` is deterministic.

**These are recipes, not a style.** The colors, fonts, and easings shown here
(indigo/purple, dark stage, `back.out`) are placeholders — always substitute
the palette, typography, and motion-language parameters from the project's
`direction.md`. Pick only the effects your creative direction calls for.

**Plugin loading:** the complete GSAP dist — core plus ALL plugins, including
the Club bonus ones (SplitText, ScrambleText, TextPlugin, DrawSVG, MorphSVG,
MotionPath, Physics2D, PhysicsProps, Inertia, Flip, CustomEase/Bounce/Wiggle,
Observer) — is vendored in this repo at `$SKILL/vendor/gsap/` and copied into
each project as `vendor/gsap/` (see `architecture.md` §1 & §4). Load and
register the palette chosen in direction.md from there. No shims, no CDN
tags, no npm reliance, and never GSDevTools in a render build.

**ANTI-FLICKER (applies to every recipe):** no infinite `yoyo` loops on
opacity/brightness/glow anywhere. Ambient life = position, scale, rotation,
slow hue drift at constant opacity. Glows, sweeps, and pulses are one-shot
beat accents (max 2–3 per video).

Seeded random (use everywhere instead of `Math.random()`):

```js
function rng(seed) { return () => ((seed = Math.imul(48271, seed)) >>> 0) / 4294967296; }
const rand = rng(1234);
```

---

## 1. Kinetic Typography — 3D Letter & Word Stagger

The signature "Apple Keynote" entrance. Stagger characters or words with 3D rotation flips and blur reveals.

```js
function titleIn(selector) {
  const split = new SplitText(selector, { type: "chars,words" });
  return gsap.timeline()
    .from(split.chars, {
      y: 50, opacity: 0, filter: "blur(10px)",
      rotationX: -80, transformPerspective: 1000,
      duration: 0.7, ease: "back.out(1.6)", stagger: 0.025,
    });
}
```

**Exit variant:**
```js
function titleOut(selector) {
  const split = new SplitText(selector, { type: "chars" });
  return gsap.timeline()
    .to(split.chars, {
      y: -40, opacity: 0, filter: "blur(8px)",
      duration: 0.35, ease: "power2.in", stagger: 0.015
    });
}
```

---

## 2. Blur-In Reveal (Paragraphs / Secondary Text)

```js
tl.from(".sub-headline", {
  opacity: 0, filter: "blur(12px)", y: 20, scale: 1.04,
  duration: 0.6, ease: "power3.out"
});
```

---

## 3. Logo Mask Reveal + Specular Light Sweep

```html
<div class="logo-wrap">
  <div class="logo-text">BRAND</div>
  <div class="sweep"></div>
</div>
<style>
.logo-wrap { position: relative; overflow: hidden; display: inline-block; padding: 20px; }
.logo-text { font-size: 90px; font-weight: 800; letter-spacing: -0.04em; color: #fff; }
.sweep {
  position: absolute; inset: 0; mix-blend-mode: overlay; transform: translateX(-150%);
  background: linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.9) 50%, transparent 60%);
}
</style>
```

```js
tl.fromTo(".logo-wrap", { clipPath: "inset(0 100% 0 0)" }, { clipPath: "inset(0 0% 0 0)", duration: 0.7, ease: "power3.inOut" })
  .to(".sweep", { xPercent: 280, duration: 0.6, ease: "power2.inOut" }, ">-0.1")
  .fromTo(".logo-text",
    { filter: "drop-shadow(0 0 0px rgba(99,102,241,0))" },
    { filter: "drop-shadow(0 0 45px rgba(99,102,241,.9))", duration: 0.3, yoyo: true, repeat: 1, ease: "power2.out" }, "<");
```

---

## 4. Attention Rack (Semantic Zoom + Pan)

Treat the camera as an attention director. Establish enough context to orient
the viewer, then tween scale and x/y together so one active target becomes
unmistakable and readable. Hold it; release only after the action lands.

```js
// Frames are measured after master-timeline assembly; values are illustrative.
// Add this transform track last so it overlaps the content choreography.
tl.fromTo("#scene4 .camera-content",
  { scale: 1.0, x: 0, y: 0 },
  { scale: 2.15, x: -510, y: 165, duration: 0.68,
    ease: "power4.inOut", transformOrigin: "0 0" },
  "focus-input"
).to("#scene4 .camera-content",
  { scale: 1.1, x: -45, y: 0, duration: 0.9, ease: "power2.inOut" },
  "release-input"
);
```

The focal move is normally 0.45–0.85s, followed by a 0.7–2.0s readable hold.
Scale is chosen by legibility, not a universal percentage: a full composition
may remain near 1×, while a small icon or password control may need 2.5–4×.
See `attention-camera.md` for target measurement and safe framing.

### Ambient dolly (subordinate)

When a scene has no semantic camera beat, a restrained scale/pan drift can keep
the frame alive. It must not compete with a focal action or run linearly through
a UI interaction.

```js
tl.fromTo("#scene4 .camera-content",
  { scale: 1.0, x: -18, y: -8 },
  { scale: 1.06, x: 18, y: 8, duration: sceneDuration, ease: "none" },
  0
);
```

---

## 5. Multi-Layer Parallax Drift

```js
tl.to(".layer-bg",  { x: -30, y: -15, duration: d, ease: "none" }, 0)
  .to(".layer-mid", { x: -60, y: -30, duration: d, ease: "none" }, 0)
  .to(".layer-fg",  { x: -110, y: -50, duration: d, ease: "none" }, 0);
```

---

## 6. Living Ambient Glow Orbs

Only for the "deep space + glow" background system (creative-direction.md
Axis 1, system 7) — never a default. Other background systems get their own
living-motion layer (grid pans, mesh drift, light-source orbit — positional,
constant opacity).

```html
<div class="orb orb-1"></div>
<div class="orb orb-2"></div>
<style>
.orb {
  position: absolute; width: 750px; height: 750px; border-radius: 50%;
  filter: blur(130px); opacity: 0.4; pointer-events: none;
}
.orb-1 { background: radial-gradient(circle, #6366f1, transparent 70%); }
.orb-2 { background: radial-gradient(circle, #a855f7, transparent 70%); }
</style>
```

```js
// Asymmetric duration prevents synchronized loop. POSITION ONLY — opacity
// stays constant (opacity yoyo = flicker, banned).
tl.to(".orb-1", { x: 90, y: 50, repeat: -1, yoyo: true, duration: 15, ease: "sine.inOut" }, 0)
  .to(".orb-2", { x: -80, y: -60, repeat: -1, yoyo: true, duration: 21, ease: "sine.inOut" }, 0);
```

---

## 7. Particle Field

```js
const frag = document.createDocumentFragment();
for (let i = 0; i < 35; i++) {
  const p = document.createElement("div");
  p.className = "particle";
  const size = 2 + rand() * 3;
  Object.assign(p.style, {
    position: "absolute", left: rand() * 1920 + "px", top: rand() * 1080 + "px",
    width: size + "px", height: size + "px", borderRadius: "50%",
    background: "rgba(255,255,255,0.4)", pointerEvents: "none"
  });
  frag.appendChild(p);
  // Drift only — no opacity oscillation (twinkling particle fields flicker).
  tl.to(p, { y: -(150 + rand() * 200), repeat: -1, duration: 10 + rand() * 8, ease: "none" }, 0)
    .to(p, { x: `+=${(rand() - 0.5) * 60}`, repeat: -1, yoyo: true, duration: 6 + rand() * 4, ease: "sine.inOut" }, 0);
}
stage.appendChild(frag);
```

---

## 8. 3D Cutout Poster Effect (Hero Scene Signature)

The product/subject is cut out (`rembg`) and layered *between* oversized 3D headline typography.

```html
<div class="cutout-scene" style="transform-style: preserve-3d; perspective: 1200px;">
  <div class="layer back-text"> <h1 class="mega">DIGITAL</h1> </div>
  <img class="layer subject-img" src="cutout.png">
  <div class="layer front-text"><h1 class="mega outline">SETTLEMENT</h1> </div>
</div>
<style>
.cutout-scene { position: relative; width: 100%; height: 100%; display: grid; place-items: center; }
.layer { position: absolute; inset: 0; display: grid; place-items: center; transform-style: preserve-3d; }
.mega { font-size: 210px; font-weight: 800; letter-spacing: -0.04em; color: #fff; }
.outline { color: transparent; -webkit-text-stroke: 2px rgba(255,255,255,0.9); }
.subject-img { height: 85%; width: auto; filter: drop-shadow(0 40px 80px rgba(0,0,0,0.8)); }
</style>
```

```js
function cutoutScene() {
  const tl = gsap.timeline();
  tl.from(".subject-img", { y: 150, scale: 0.9, opacity: 0, duration: 0.9, ease: "power4.out" })
    .from(".back-text .mega",  { x: -450, opacity: 0, duration: 0.8, ease: "power3.out" }, "-=0.5")
    .from(".front-text .mega", { x: 450, opacity: 0, duration: 0.8, ease: "power3.out" }, "<0.1")
    // Layered 3D parallax drift across scene hold
    .to(".back-text",  { x: -60, rotationY: 4, duration: 6, ease: "sine.inOut" }, 0)
    .to(".subject-img",{ x: 20, y: -15, rotationY: -3, duration: 6, ease: "sine.inOut" }, 0)
    .to(".front-text", { x: 70, rotationY: 4, duration: 6, ease: "sine.inOut" }, 0);
  return tl;
}
```

---

## 9. Native 3D Device / Glass Card Float

```js
tl.from(".glass-card", {
    y: 140, rotationX: 12, rotationY: -18, scale: 0.88, opacity: 0,
    duration: 0.9, ease: "power4.out", transformPerspective: 1200
  })
  .to(".glass-card", {
    rotationY: "+=4", rotationX: "-=2", repeat: -1, yoyo: true,
    duration: 4, ease: "sine.inOut"
  });
```

---

## 10. Live Animated Stat Counter

```html
<div class="stat-card">
  <div class="stat-num" id="counter1">$0.00</div>
  <div class="stat-label">Total Volume Processed</div>
</div>
```

```js
const counterObj = { val: 0 };
tl.to(counterObj, {
  val: 2849100.00, duration: 2.2, ease: "expo.out",
  onUpdate: () => {
    document.querySelector("#counter1").textContent =
      "$" + counterObj.val.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
});
```

---

## 11. Live SVG Chart Line Draw with Motion Path Dot

```html
<svg viewBox="0 0 800 300" class="chart-svg">
  <path id="chartPath" d="M 0 250 Q 200 50 400 150 T 800 30" fill="none" stroke="#6366f1" stroke-width="5" />
  <circle id="chartDot" r="8" fill="#a855f7" filter="drop-shadow(0 0 12px #a855f7)" />
</svg>
```

```js
gsap.registerPlugin(DrawSVGPlugin, MotionPathPlugin);

tl.from("#chartPath", { drawSVG: "0%", duration: 1.8, ease: "power2.inOut" })
  .to("#chartDot", {
    motionPath: { path: "#chartPath", align: "#chartPath", alignOrigin: [0.5, 0.5] },
    duration: 1.8, ease: "power2.inOut"
  }, "<");
```

---

## 12. 3D Camera Fly-Through Portal Transition

Use only when a real outgoing card/window/device becomes the portal into its
own detail or result. A camera fly-through with no surviving semantic object is
generic spectacle; choose another bridge or a chapter cut.

```js
function transitionCameraFly(currentScene, nextScene) {
  const tl = gsap.timeline();
  tl.to(currentScene, { scale: 4, z: 1200, rotationX: 15, opacity: 0, filter: "blur(25px)", duration: 0.65, ease: "power3.in" })
    .fromTo(nextScene,
      { scale: 0.5, z: -800, opacity: 0, filter: "blur(15px)" },
      { scale: 1, z: 0, opacity: 1, filter: "blur(0px)", duration: 0.65, ease: "power3.out" }, "-=0.35");
  return tl;
}
```

---

## 13. Zoom-Through Transition

Use only when the outgoing focal surface plausibly expands into the incoming
scene (for example, a clicked website row → verified website, chart point →
detail view). Match the zoom origin to the measured source rectangle.

```js
tl.to("#sceneA", { scale: 7, opacity: 0, filter: "blur(20px)", duration: 0.5, ease: "power3.in" })
  .fromTo("#sceneB", { scale: 1.2, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.5, ease: "power3.out" }, "-=0.2");
```

---

## 14. Directional Carry Transition

Preserve velocity across the boundary. Avoid gratuitous 3D rotation: outgoing
and incoming content should share one vector so the viewer reads a continued
flow rather than two unrelated slides.

```js
tl.to("#sceneA", { xPercent: -115, opacity: 0, duration: 0.42, ease: "power3.in" })
  .fromTo("#sceneB",
    { xPercent: 115, opacity: 1 },
    { xPercent: 0, opacity: 1, duration: 0.52, ease: "power3.out" },
    "-=0.18");
```

For shared-element, surface-expansion, iris-wipe, match-cut, and chapter-cut
patterns, use `scene-transitions.md`.

---

## 15. Living Background Evolution Across Scenes

Evolve background gradient colors per scene beat to signal progress.

```js
function setSceneBackground(hueStart, hueEnd, duration) {
  const bgObj = { h1: hueStart, h2: hueEnd };
  return gsap.to(bgObj, {
    h1: hueStart + 40, h2: hueEnd + 40, duration: duration, ease: "none",
    onUpdate: () => {
      document.querySelector("#viewport").style.background =
        `linear-gradient(135deg, hsl(${bgObj.h1}, 60%, 6%), hsl(${bgObj.h2}, 70%, 10%))`;
    }
  });
}
```

---

## 16. Grain + Vignette Finish Pass

```html
<div class="vignette"></div>
<svg class="grain"><filter id="noiseFilter">
  <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="3" result="noise"/>
</filter><rect width="100%" height="100%" filter="url(#noiseFilter)"/></svg>
<style>
.vignette { position: absolute; inset: 0; pointer-events: none; z-index: 998; background: radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.7) 100%); }
.grain { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; z-index: 999; opacity: 0.045; mix-blend-mode: overlay; }
</style>
```

---

## 17. Native HTML/CSS 3D Exploded Dashboard Deconstruction (optional — use when depth communicates)

Use this **only** when separating layers says something about the product
("one platform, many modules") and the video's dimensionality is 3D/2.5D
(see creative-direction.md Axes 4 & 6). Keep it controlled — clean isometric
tilt, smooth Z-lift, single drift; over-rotating/over-scattering reads as
chaotic. Many dashboard products are better served by a flat reconstructed UI
demo with one cursor interaction.

**FAITHFULNESS CONTRACT (applies whenever product UI is shown, exploded or flat):**
- Never generate a generic abstract placeholder box.
- Inspect the provided screenshots and preserve the actual UI panels (exact
  sidebar items, navigation links, stat badges, chart paths, and data cards).
  Build separable/interactive regions natively in HTML/CSS; use a verified
  image base plate or hybrid overlay when it preserves complex product or
  third-party UI more faithfully. See `attention-camera.md`.
- Never fabricate product specifics you can't verify from recon (hotkey
  combos, metrics, feature names). Render the generic truth instead (a keycap
  labeled "the hotkey", not an invented "⌃Space") — a wrong detail is worse
  than an unspecific one.

If exploding, the standards are: Z-separation ≥ 200–500px; per-panel
`rotationX`/`rotationY` (5–20°), not just the container; staggered timing
(0.1–0.3s offsets per panel); independent per-panel float afterwards
(different durations, e.g. 2.2s / 2.5s / 2.8s); micro-Z offsets (30–70px) on
inner cards; brand-colored shadow glow intensifying during the explode.

```html
<div class="exploded-viewport">
  <div class="dashboard-3d" id="dashContainer">
    <!-- Base App Shell -->
    <div class="dash-panel dash-shell" id="dashShell">
      <div class="app-header"><span>Dashboard</span><span>Status: Live</span></div>
    </div>
    <!-- Sidebar Panel -->
    <div class="dash-panel dash-sidebar" id="dashSidebar">
      <div class="nav-item active">Overview</div>
      <div class="nav-item">Transactions</div>
      <div class="nav-item">Analytics</div>
    </div>
    <!-- Chart Card -->
    <div class="dash-panel dash-chart" id="dashChart">
      <h3>Settlement Volume</h3>
      <svg viewBox="0 0 500 150"><path d="M0 120 Q 120 20 250 80 T 500 10" fill="none" stroke="#6366f1" stroke-width="4"/></svg>
    </div>
    <!-- Stat Grid Card -->
    <div class="dash-panel dash-stats" id="dashStats">
      <div class="stat-value">$2.84B</div>
      <div class="stat-sub">24h Net Settlement</div>
    </div>
  </div>
</div>
<style>
.exploded-viewport { position: relative; width: 100%; height: 100%; display: grid; place-items: center; perspective: 1400px; }
.dashboard-3d { position: relative; width: 1100px; height: 620px; transform-style: preserve-3d; }
.dash-panel {
  position: absolute; background: rgba(255,255,255,0.05); backdrop-filter: blur(20px);
  border: 1px solid rgba(255,255,255,0.12); border-radius: 16px; padding: 24px;
  transform-style: preserve-3d; box-shadow: 0 30px 60px rgba(0,0,0,0.6);
}
.dash-shell   { inset: 0; }
.dash-sidebar { top: 70px; left: 20px; width: 220px; bottom: 20px; }
.dash-chart   { top: 70px; left: 260px; right: 20px; height: 300px; }
.dash-stats   { bottom: 20px; left: 260px; width: 320px; height: 190px; }
</style>
```

```js
function explodedDashboardScene() {
  const tl = gsap.timeline();
  // 1. Entrance assembled
  tl.from("#dashContainer", { y: 120, scale: 0.82, opacity: 0, rotateX: 15, duration: 0.8, ease: "power4.out" })
    // 2. Explode into 3D isometric perspective space
    .to("#dashContainer", { rotateX: 38, rotateY: -22, rotateZ: -10, scale: 0.92, duration: 1.6, ease: "power3.inOut" }, "+=0.2")
    .to("#dashShell",   { z: 0,   duration: 1.6, ease: "power3.inOut" }, "<")
    .to("#dashSidebar", { z: 70,  x: -50, y: -10, duration: 1.6, ease: "power3.inOut" }, "<")
    .to("#dashChart",   { z: 140, y: -25, duration: 1.6, ease: "power3.inOut" }, "<")
    .to("#dashStats",   { z: 220, x: 40, y: 30, duration: 1.6, ease: "power3.inOut" }, "<")
    // 3. Continuous 3D active float during hold
    .to("#dashContainer", { rotateY: "+=6", rotateX: "-=4", duration: 4.5, ease: "sine.inOut" }, "<");
  return tl;
}
```

---

## 18. Spotlight & Focus Pulse on Native HTML UI

Darkens surrounding elements while illuminating a target HTML UI card with an animated pulsing glowing border.

```html
<div class="spotlight-card" id="targetCard">
  <div class="glowing-border" id="glowRim"></div>
  <h3>Instant API Settlement</h3>
  <p>Sub-millisecond ledger confirmations</p>
</div>
<style>
.spotlight-card { position: relative; width: 420px; padding: 30px; background: rgba(255,255,255,0.06); border-radius: 20px; }
.glowing-border {
  position: absolute; inset: -3px; border-radius: 22px; pointer-events: none;
  background: linear-gradient(135deg, #6366f1, #a855f7); filter: blur(12px); opacity: 0;
}
</style>
```

```js
// One-shot spotlight: dim others, glow blooms in and HOLDS steady (no
// pulsing loop — that's flicker). Release the spotlight when focus moves on.
tl.to(".other-cards", { opacity: 0.25, filter: "blur(6px)", duration: 0.5 })
  .to("#targetCard", { scale: 1.08, duration: 0.5, ease: "back.out(1.4)" }, "<")
  .to("#glowRim", { opacity: 0.7, duration: 0.5, ease: "sine.out" }, "<");
```

---

## 19. Animated Cursor Tracking & Click Simulation

**Use `CursorController.clickElement(selector, { targetTime })` from
`architecture.md` §5 instead of this raw recipe** — it seek-measures the
rendered target position after master assembly, so clicks land dead-center.
The snippet below only illustrates the press/ripple mechanics; its hardcoded
coordinates violate the precise-targeting rule.

```html
<svg id="cursor" viewBox="0 0 24 24" width="32" height="32" style="position:absolute; z-index:100; pointer-events:none;">
  <path fill="#ffffff" stroke="#000" stroke-width="1.5" d="M3 3l7 18 3-7 7-3L3 3z"/>
</svg>
<div id="clickRipple" style="position:absolute; width:60px; height:60px; border-radius:50%; border:2px solid #6366f1; background:rgba(99,102,241,0.3); transform:translate(-50%,-50%) scale(0); opacity:0;"></div>
```

```js
function cursorClickScene() {
  const tl = gsap.timeline();
  // Move cursor to target button (x: 960, y: 540)
  tl.fromTo("#cursor", { x: 200, y: 900, opacity: 0 }, { x: 960, y: 540, opacity: 1, duration: 1.1, ease: "power3.out" })
    // Click down
    .to("#cursor", { scale: 0.8, duration: 0.12, ease: "power2.in" })
    // Ripple trigger
    .fromTo("#clickRipple", { left: 960, top: 540, scale: 0, opacity: 1 }, { scale: 2.4, opacity: 0, duration: 0.5, ease: "power2.out" }, "<")
    // Release
    .to("#cursor", { scale: 1, duration: 0.15, ease: "power2.out" })
    // Target UI element reacts
    .to("#targetButton", { scale: 0.95, yoyo: true, repeat: 1, duration: 0.15 }, "<-0.1");
  return tl;
}
```

---

## 20. Anchored Glass Callouts with Glowing Pointer Lines

Floating glass cards attached via glowing SVG lines directly to native UI coordinates.

```html
<svg class="line-canvas" viewBox="0 0 1920 1080" style="position:absolute; inset:0; pointer-events:none;">
  <path id="calloutLine" d="M 650 500 L 900 350 H 1150" fill="none" stroke="url(#lineGrad)" stroke-width="3" />
  <defs>
    <linearGradient id="lineGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#6366f1" stop-opacity="0.2"/>
      <stop offset="100%" stop-color="#a855f7" stop-opacity="1"/>
    </linearGradient>
  </defs>
</svg>
<div id="calloutCard" class="glass-card" style="position:absolute; top:300px; left:1160px;">
  <h4>Real-time Audit Trail</h4>
  <p>Cryptographically verified transactions</p>
</div>
```

```js
tl.from("#calloutLine", { drawSVG: "0%", duration: 0.8, ease: "power3.inOut" })
  .from("#calloutCard", { y: 20, opacity: 0, filter: "blur(10px)", duration: 0.5, ease: "power3.out" }, "-=0.2");
```

---

## 21. Text Effects Suite — vary the treatments (≥ 3 distinct per video)

### 21a. Line-Mask Reveal (editorial/premium signature)
```js
const split = SplitText.create("#scene2 .headline", {
  type: "lines", linesClass: "line", mask: "lines", autoSplit: true
});
tl.from(split.lines, { yPercent: 110, duration: 0.8, ease: "power4.out", stagger: 0.12 });
```

### 21b. Scramble Decode (technical/dev brands)
```js
tl.to("#scene3 .stat-label", {
  scrambleText: { text: "99.99% UPTIME", chars: "01<>/#", speed: 0.4 },
  duration: 0.9, ease: "none"
});
```

### 21c. Typewriter with Meaningful Caret
```js
// Caret blink is the ONE permitted blink: one element, >= 0.8s period.
tl.to("#scene4 .prompt", { text: "deploy --prod", duration: 1.1, ease: "none" });
```

### 21d. Word Rotator (one slot, swapping alternatives)
```js
// "Ship [faster] -> [safer] -> [today]" — each word rises in as the previous exits.
const words = gsap.utils.toArray("#scene5 .rotator .rot-word");
words.forEach((w, i) => {
  tl.fromTo(w, { yPercent: 120, opacity: 0 }, { yPercent: 0, opacity: 1, duration: 0.45, ease: "back.out(1.7)" }, i * 1.1)
    .to(w, { yPercent: -120, opacity: 0, duration: 0.4, ease: "power2.in" }, i * 1.1 + 0.75);
});
// Last word stays: skip the exit tween for words[words.length - 1].
```

### 21e. Gradient Ink-Fill Sweep (CTA / brand moment)
```css
/* inline-block + background-clip:text rules apply (SKILL.md invariants) */
.cta-fill-word { background-size: 220% 100%; background-position: 100% 0; }
```
```js
tl.to("#scene8 .cta-fill-word", { backgroundPosition: "0% 0", duration: 0.9, ease: "power2.inOut" });
```

### 21f. Per-Word Emphasis Pop (synced to VO)
```js
// Punch THE word as the narrator says it (get the time from the VO clip).
tl.to("#scene6 .kw-instant", { scale: 1.18, color: "var(--accent)", duration: 0.22, ease: "back.out(3)" }, VO_KEYWORD_T)
  .to("#scene6 .kw-instant", { scale: 1, duration: 0.3, ease: "power2.out" }, ">");
```

## 22. Physics2D Particle Burst (one-shot celebration)

For Elastic/Kinetic directions: confetti/spark burst when the CTA lands or a
metric hits its target. One shot, seeded positions, never looped.

```js
gsap.utils.toArray("#scene8 .spark").forEach(s => {
  tl.to(s, {
    physics2D: { velocity: 340 + rand() * 260, angle: -90 + (rand() - 0.5) * 70, gravity: 620 },
    opacity: 0, duration: 1.4, ease: "none"
  }, "cta+=0.05");
});
```

## 23. MorphSVG Icon Morph (state changes that mean something)

```js
// upload-cloud -> checkmark when processing completes; checkbox -> spinner -> check.
tl.to("#scene5 .status-icon path", { morphSVG: "#scene5 .icon-check-path", duration: 0.55, ease: "power2.inOut" });
```

## 24. CustomWiggle & CustomBounce Accents

```js
CustomWiggle.create("notifyWiggle", { wiggles: 5, type: "easeOut" });
CustomBounce.create("cardBounce", { strength: 0.5, squash: 2 });

// Notification bell shake as the badge count increments:
tl.to("#scene4 .bell", { rotation: 14, duration: 0.7, ease: "notifyWiggle" });
// Card landing with real bounce + squash-and-stretch:
tl.from("#scene6 .proof-card", { y: -220, duration: 0.9, ease: "cardBounce" })
  .to("#scene6 .proof-card", { scaleY: 0.92, scaleX: 1.06, duration: 0.12, yoyo: true, repeat: 1 }, "-=0.25");
```

---

## 25. Calm Camera Recipes (apply the §1a/§1b rules in attention-camera.md)

**Pan-follow (caret tracking)** — for text/lists/forms that fill
progressively. Hold scale nearly constant and glide along the write direction,
timed to the fill. Feels like reading, not inspecting:

```js
// One continuous glide across a row as each item highlights — replaces two
// zoom-and-release cycles. release:false keeps the frame where the story is.
tl.add(FocusDirector.focusElement("#scene6 .row-item-a", {
  label: "scene6", measureOffset: 3.5, scale: 1.12,
  duration: 0.85, hold: 1.1, release: false,
}), 2.65)
  .add(FocusDirector.focusElement("#scene6 .row-item-c", {
    label: "scene6", measureOffset: 5.8, scale: 1.12,
    duration: 1.25, ease: "sine.inOut", hold: 1.2, release: false,
  }), 4.55);
```

**Settle-then-act (typing)** — the camera lands on the field, holds a beat,
*then* typing starts. Never type while the camera is still traveling.

**Slow end-card push** — one unreleased push (scale ≤ 1.15) starting after the
CTA entrance and running into the scene fade. No release, no yo-yo:

```js
tl.add(FocusDirector.focusElement("#scene8 .cta", {
  label: "scene8", measureOffset: 4.2, scale: 1.14,
  duration: sceneDur - 4.15, ease: "sine.inOut", release: false,
}), 3.8);
```

**Release-to-consequence** — when the result matters more than the control,
the pull-back IS the point: release from the detail to reveal the outcome
chart/row/relationship, then cut.

## 26. Motion-Graphic Staples (element motion for no-camera scenes)

Scenes without a camera reframe still need choreography. These read as
"designed", not "template":

**Card deal / fan entrance** — rows, features, integrations:

```js
tl.from("#scene7 .card", {
  y: 90, rotation: (i) => (i - 2) * 3.5, transformOrigin: "50% 120%",
  opacity: 0, duration: 0.6, stagger: 0.12, ease: "back.out(1.4)",
}, 0.4);
```

**Marquee / ticker strip** — logos, keywords, or stats drifting at constant
speed (one of the few places `ease: "none"` belongs on screen):

```js
tl.to("#scene5 .ticker-track", { xPercent: -50, duration: 18, ease: "none", repeat: -1 });
```

**Edge-wipe reveal with a traveling rule** — a clip-path inset opens while a
1–3px accent line rides the wipe's leading edge; the line sells the wipe:

```js
tl.fromTo("#scene6 .panel", { clipPath: "inset(0 100% 0 0)" },
  { clipPath: "inset(0 0% 0 0)", duration: 0.7, ease: "power3.inOut" })
  .fromTo("#scene6 .wipe-edge", { x: 0 }, { x: panelWidth, duration: 0.7, ease: "power3.inOut" }, "<")
  .to("#scene6 .wipe-edge", { opacity: 0, duration: 0.2 });
```

**Magnetic emphasis** — a key word/stat scales 1 → 1.06 → 1 with
`sine.inOut` as the VO lands on it (pairs with §21f). Subtlety is the point:
> 8% reads as a jump cut.

**Number odometer roll** — for Precision/Editorial stats: digits translateY
through a clipped window with a per-column stagger (use §10's counter when the
value must count; use the odometer when the *roll itself* is the show).

---

## 27. Cold-Open Hooks (attention capture in the first 3 seconds)

The first 3 seconds decide whether the viewer stays. A studied 20s opener ran:
word-per-beat type on a quiet field → **color slam** on the trigger word → the
color field **morphs into an object** that becomes the next scene's actor.

**Word-per-beat cadence** — one word lands per ~0.5–0.7s, dead center, no
camera move. The restraint is what makes the slam land:

```js
tl.from("#scene0 .hook-word", { opacity: 0, scale: 0.85, duration: 0.3,
  stagger: 0.6, ease: "power3.out" }, 0.2);
```

**Color slam** — on the pivotal word, the whole frame inverts to the brand
color field in ≤ 0.15s, with a punch scale on the word and an `impact-boom`
hit. This is a deliberate violation of the video's own palette rhythm — it
works *because* nothing else in the film does it:

```js
tl.to("#bg-layer", { backgroundColor: BRAND, duration: 0.12, ease: "power4.in" }, "slam")
  .fromTo("#scene0 .trigger-word", { scale: 1.4 }, { scale: 1, duration: 0.35, ease: "power4.out" }, "slam");
```

**Morph-to-object** — the color field then shrinks with growing border-radius
into a small object (pill, card, button) on the next scene's background, and
that object *does* something (becomes a caret, a chip, the product window).
Conserved property: color + rounded shape. The viewer's eye follows the object
into the new scene — no cut needed.

## 28. Blur-Scroll Montage (the "countless possibilities" list)

A fast vertical list of use-cases/keywords scrolling with motion blur,
decelerating onto the one that matters. Words at the frame edges stay blurred
and dim; only the focal row is sharp. Camera may tilt a few degrees for
energy. Implementation: a tall column of rows translating on y with a strong
`power3.out` deceleration, plus `filter: blur()` on the column *wrapper*
(blur on a container is safe — never on background-clipped text) that eases
from 6px → 0 as the list settles:

```js
tl.fromTo("#scene2 .word-column", { y: 600 }, { y: -420, duration: 2.6, ease: "power3.out" }, 0)
  .fromTo("#scene2 .column-wrap", { filter: "blur(5px)" }, { filter: "blur(0px)", duration: 0.9 }, 1.7);
```

## 29. Fantasy Drop — the cursor delivers assets into the UI

The most charming product-demo move: the cursor *carries cargo*. File icons,
images, or data chips arrive fanned under the cursor, the target container
expands to receive them, and the items leap into place — each landing with a
slight rotation settle, then labels pop in beneath. One `bubble-pop` per
landing, pitch-laddered if several land in sequence:

```js
// Items staged as a fan under the cursor, traveling with it:
tl.to(["#scene5 .cargo", "#cursor-pointer-wrap"], { x: dropX, y: dropY, duration: 0.7, ease: "power3.inOut" }, "carry")
  // Container opens to receive:
  .to("#scene5 .prompt-bar", { height: "+=72", duration: 0.4, ease: "power3.inOut" }, "carry+=0.45")
  // Each item leaves the fan, arcs into its slot, settles its rotation:
  .to("#scene5 .cargo", {
    x: (i) => slotX(i), y: (i) => slotY(i), rotation: 0,
    duration: 0.45, stagger: 0.14, ease: "back.out(1.8)",
  }, "carry+=0.55")
  .from("#scene5 .cargo-label", { opacity: 0, y: 8, duration: 0.25, stagger: 0.14 }, "carry+=0.85");
```

Rules: cargo must be visible while carried (viewer tracks the hand-off), the
container reacts *before* the items move (it "opens" expectantly), and every
landing gets a sound. 3–5 items is the sweet spot.

## 30. Cursor Flip-and-Press (the click with personality)

A plain click is fine; a flip-click is a signature. The cursor travels on its
curved arc, **rotates up to ~90–135° during travel** (it tumbles like a tossed
tool), snaps upright into the settle, then squash-presses. After the click it
can fly off still rotating and exit frame — the exit is part of the gag:

```js
tl.to("#cursor-pointer-wrap", { x, duration: 0.6, ease: "power3.inOut" }, "go")
  .to("#cursor-pointer-wrap", { y, duration: 0.6, ease: "power4.out" }, "go")
  .to("#cursor-pointer", { rotation: 115, duration: 0.6, ease: "power2.inOut" }, "go")   // tumble
  .to("#cursor-pointer", { rotation: 0, duration: 0.22, ease: "back.out(2.5)" })          // snap upright
  // …squash-press + ripple as usual…
  .to("#cursor-pointer-wrap", { x: "+=420", y: "-=260", duration: 0.5, ease: "power2.in" }, "+=0.15")
  .to("#cursor-pointer", { rotation: -35, duration: 0.5 }, "<")                           // exits spinning
  .to(["#cursor-pointer-wrap", "#cursor-glow"], { opacity: 0, duration: 0.2 }, "<+=0.3");
```

Use at most once per video — it's a flourish, and flourishes don't repeat.

## 31. Blur-Zoom Carry (transition from prompt/ask into product result)

For "ask → answer" beats: on the submit click, the source UI scales *toward*
the viewer with rising motion blur while the result surface scales up beneath
it; they cross-fade mid-travel. The conserved property is forward velocity —
the click "pushes through" the screen:

```js
tl.to("#scene5 .ask-ui", { scale: 1.35, opacity: 0, filter: "blur(14px)", duration: 0.45, ease: "power2.in" }, "go")
  .fromTo("#scene6 .result-ui", { scale: 0.92, opacity: 0, filter: "blur(10px)" },
    { scale: 1, opacity: 1, filter: "blur(0px)", duration: 0.5, ease: "power3.out" }, "go+=0.15");
```

Blur belongs on the UI containers here (never on background-clipped text —
invariant 3). Pair with `swoosh-soft` or `riser` resolving into the reveal.

---

## Per-Scene Requirements Summary

| Concern | Requirement |
|---|---|
| Scene Entrances | Choreographed entrance in the video's motion language (staggered type or element reveals — form varies by direction) |
| Continuous Travel | Semantic attention reframes first; restrained camera/stage drift only between focal actions. UI targets must become materially more legible |
| Hold Content | Progressive disclosure + at least 1 mid-scene event (cursor click, counter, chart draw, text swap) |
| Transitions | Boundary ledger marks connected bridge or chapter cut; connected transitions conserve one named property and use relative offsets |
| Product UI | Faithful native, verified-image, or hybrid construction; one measurable focal target per interaction and no unchanged screenshot scene |
| Quality Control | Pre-render motion audit via `node scripts/audit.mjs page.html` |
