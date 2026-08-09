# Effects Catalog — After Effects-Style Recipes in GSAP

All recipes assume a paused master timeline (see SKILL.md Phase 3). Each `sceneN()`
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

## 4. Camera Dolly (Continuous Active Scale & Pan)

Wrap the scene in a continuous camera tween to eliminate static frames.

```js
// Minimum scale travel MUST be >= 8% (e.g. 1.0 -> 1.08) + pan component
tl.fromTo("#scene4", 
  { scale: 1.0, x: -30, y: -15 }, 
  { scale: 1.08, x: 30, y: 15, duration: sceneDuration, ease: "none" }, 0
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

Fly camera *through* a 3D glass card frame into the next scene.

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

```js
tl.to("#sceneA", { scale: 7, opacity: 0, filter: "blur(20px)", duration: 0.5, ease: "power3.in" })
  .fromTo("#sceneB", { scale: 1.2, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.5, ease: "power3.out" }, "-=0.2");
```

---

## 14. 3D Whip Pan Transition

```js
tl.to("#sceneA", { x: -2200, rotationY: -30, opacity: 0, duration: 0.5, ease: "power4.in" })
  .fromTo("#sceneB", { x: 2200, rotationY: 30, opacity: 0 }, { x: 0, rotationY: 0, opacity: 1, duration: 0.5, ease: "power4.out" }, "-=0.2")
  .fromTo("#viewport", { filter: "blur(0px)" }, { filter: "blur(18px)", duration: 0.2, yoyo: true, repeat: 1, ease: "sine.inOut" }, "<-0.1");
```

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
- Inspect the provided screenshots and faithfully re-create the actual UI
  panels (exact sidebar items, navigation links, header stat badges, hero
  chart paths, and data cards) natively in HTML/CSS, styled with the
  product's own design tokens.
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

## Per-Scene Requirements Summary

| Concern | Requirement |
|---|---|
| Scene Entrances | Choreographed entrance in the video's motion language (staggered type or element reveals — form varies by direction) |
| Continuous Travel | Camera/stage drift across the full scene (scale ≥ 8% or equivalent pan/tilt), expressed in the chosen dimensionality |
| Hold Content | Progressive disclosure + at least 1 mid-scene event (cursor click, counter, chart draw, text swap) |
| Transitions | Relative offsets (`">-0.5"`), style per motion language (3D fly-through, whip pan, flat push, clip-path wipe) |
| Product UI | Faithful native HTML/CSS reconstruction in the product's own design tokens (flat demo or #17 explode — per direction.md) |
| Quality Control | Pre-render motion audit via `node scripts/audit.mjs page.html` |
