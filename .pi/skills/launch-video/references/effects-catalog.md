# Effects catalog — GSAP recipes for project types

`effects-vocabulary.md` decides **which** moves a film owns. This file is
the plumbing for the ones the engine lacks: each recipe is the `animate`
body of a project type in `js/shots.custom.js`. Colours, sizes and eases
are placeholders — direction.md's values replace them. Nothing here is a
style; a recipe used because it is here, not because the beat asked for
it, is a template.

## 0. The shape of a project type

```js
// js/shots.custom.js — loaded by motion_scaffold after factories.js, before compiler.js
(function () {
  const { h, qs, splitChars, mixedLine, rng, EASE, revealWords, scatterWords, three, frameHook, ready, coverMap } = window.ShotKit;
  window.ProjectShotFactories = {
    "my-move": {
      mount(el, shot) {            // build DOM once; images from assets/ only
        el.dataset.bg = shot.bg || "bg";
        el.appendChild(h("div", { class: "mm-word" }, shot.text));
      },
      animate(el, shot, D) {       // return one timeline ≤ D; everything on it
        const tl = gsap.timeline();
        tl.from(qs(el, ".mm-word"), { y: 80, opacity: 0, duration: 0.3 * D, ease: "expo.out" }, 0);
        return tl;
      },
    },
  };
})();
```

Rules the compiler enforces or the audit catches: every tween on the
returned timeline (no CSS animations, no bare `gsap.to`, no
`requestAnimationFrame`, no `Math.random` — `rng(seed)`); selectors scoped
to `el`; times as fractions of `D`; no infinite opacity or glow loops;
`filter: blur()` never on background-clipped text; optional targets
guarded. Named eases the compiler registers: `whip` (violent in, long
settle), `slamHard`, `settle` (one overshoot), `shake`, `shakeSoft`, plus
every GSAP plugin (`window.__PLUGINS`). Text swaps go through `tl.set`.
The shot's own `beats`, `cut`, `exit` and actors still apply on top.

## 1. Type

### 1a. Word camera (a field, not a recipe)

```js
{ type: "line", size: 150, parts: [{ text: "Find " }, { text: "anything", tone: "accent" }, { text: " first" }],
  beats: [
    { kind: "zoom", sel: ".lw:nth-child(1)", fill: 0.5, dur: 0.25, release: 0.4, at: 0.3 },
    { kind: "zoom", sel: ".lw:nth-child(2)", fill: 0.62, dur: 0.25, release: 0.5, at: 1.0 },
    { kind: "zoom", sel: ".lw:nth-child(3)", fill: 0.5, dur: 0.25, release: 0.4, at: 1.9 },
  ] }
```

The noun gets the largest `fill`. `dof: false` keeps the other words sharp
when the line is short.

### 1b. Mask line reveal (sliding text reveal)

```js
const split = SplitText.create(qs(el, ".headline"), { type: "lines", linesClass: "line", mask: "lines", autoSplit: true });
tl.from(split.lines, { yPercent: 110, duration: 0.8, ease: "power4.out", stagger: 0.12 }, 0);
```

### 1c. Snap (bold text snap, tilted snap)

```js
const lines = SplitText.create(qs(el, ".headline"), { type: "lines" }).lines;
tl.from(lines, { yPercent: (i) => (i % 2 ? 140 : -140), duration: 0.42, ease: "expo.out", stagger: 0.07 }, 0);   // collide and settle
// tilted variant: rotation from -5, transformOrigin "0% 100%", ease "settle"
```

### 1d. Inflate

Wants a variable font (recon self-hosts it and `brand.fonts` declares the
axis); otherwise scale alone.

```js
const chars = splitChars(qs(el, ".word"));
tl.fromTo(chars, { scale: 0.72, filter: "blur(6px)", fontVariationSettings: '"wght" 300' },
  { scale: 1.06, filter: "blur(0px)", fontVariationSettings: '"wght" 800', duration: 0.5, ease: "power3.out", stagger: 0.03 }, 0)
  .to(chars, { scale: 1, duration: 0.25, ease: "settle", stagger: 0.03 }, 0.35);
```

### 1e. Stretch-snap (elastic text)

```js
tl.fromTo(qs(el, ".word"), { scaleX: 1.7, transformOrigin: "0% 50%" }, { scaleX: 1, duration: 0.7, ease: "elastic.out(1, 0.5)" }, 0);
```

### 1f. Scramble, glitch, trail

```js
tl.to(qs(el, ".date"), { scrambleText: { text: "OCT 14", chars: "0123456789", speed: 0.4 }, duration: 0.9, ease: "none" }, 0);   // once per film

// glitch: three clones in the brand's channels, one burst of 4 frames
const g = qs(el, ".glitch");
["r", "g", "b"].forEach((c, i) => { const k = g.cloneNode(true); k.classList.add(`gl-${c}`); g.parentNode.appendChild(k);
  tl.fromTo(k, { x: 0, clipPath: "inset(0 0 0 0)" }, { x: (i - 1) * 8, clipPath: `inset(${20 * i}% 0 ${40 - 20 * i}% 0)`, duration: 0.07, repeat: 1, yoyo: true, ease: "none" }, 0.2); });

// trail: 6 ghosts a frame behind, fading
for (let i = 1; i <= 6; i++) { const k = word.cloneNode(true); k.style.opacity = String(0.5 - i * 0.07); el.appendChild(k);
  tl.fromTo(k, { x: -900 }, { x: 0, duration: 0.45, ease: "whip" }, i / 60); }
```

### 1g. Blur scroller

```js
tl.fromTo(qs(el, ".column"), { y: 600 }, { y: -420, duration: 2.6, ease: "power3.out" }, 0)
  .fromTo(qs(el, ".column-wrap"), { filter: "blur(5px)" }, { filter: "blur(0px)", duration: 0.9 }, 1.7);   // blur on the wrapper, never on clipped text
```

### 1h. Countdown, counter, ring

```js
// countdown at poster scale: a `line` with replace steps is enough —
{ type: "line", size: 340, parts: [{ text: "3" }], steps: [{ at: 0.6, replace: [{ text: "2" }] }, { at: 1.2, replace: [{ text: "1" }] }, { at: 1.8, replace: [{ text: "Now", tone: "accent" }] }] }

// counter from a blur (the number from recon):
const o = { v: 0 }; const num = qs(el, ".num");
tl.to(o, { v: 700, duration: 1.6, ease: "expo.out", onUpdate: () => { num.textContent = Math.round(o.v) + "M"; } }, 0)
  .fromTo(num, { filter: "blur(12px)" }, { filter: "blur(0px)", duration: 1.2, ease: "power2.out" }, 0);

// progress ring:
tl.from(qs(el, ".ring"), { drawSVG: "0%", duration: 1.4, ease: "power2.inOut" }, 0);
```

### 1i. Shape → text, dots → text

```js
tl.to(qs(el, "#blob"), { morphSVG: qs(el, "#word-outline"), duration: 0.9, ease: "power2.inOut" }, 0);   // an SVG text path traced from the brand font
```

## 2. Imagery (plates and photos, never a captured UI)

### 2a. Ripple

```js
// mount: <svg class="fx"><filter id="rip"><feTurbulence type="fractalNoise" baseFrequency="0.012" numOctaves="2" seed="7"/><feDisplacementMap in="SourceGraphic" scale="0"/></filter></svg>
// the plate: style="filter: url(#rip)"
const disp = qs(el, "feDisplacementMap"), turb = qs(el, "feTurbulence");
tl.to(disp, { attr: { scale: 90 }, duration: 0.35, ease: "power2.out" }, 0.2)
  .to(turb, { attr: { baseFrequency: "0.03" }, duration: 0.9, ease: "sine.inOut" }, 0.2)
  .to(disp, { attr: { scale: 0 }, duration: 0.6, ease: "power3.inOut" }, 0.55);
```

### 2b. Dither, pixelate (canvas)

```js
// mount: a <canvas> the plate's size; the image via ShotKit.ready(load)
const st = { block: 48, bias: 1 };
tl.to(st, { block: 1, bias: 0, duration: 1.1, ease: "power3.in" }, 0.2);
frameHook(el, () => {              // runs after every timeline render while the shot is on
  const b = Math.max(1, Math.round(st.block));
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, 0, 0, W / b, H / b);
  ctx.drawImage(canvas, 0, 0, W / b, H / b, 0, 0, W, H);      // pixelate; for dither, threshold pixels against a Bayer matrix scaled by st.bias
});
```

### 2c. Halftone, threshold, colour clamp

```js
// mount: <filter id="tone"><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncR type="discrete" tableValues="0 1"/>…</feComponentTransfer></filter>
tl.to(qs(el, ".plate"), { filter: "url(#tone)", duration: 0 }, 0).to(qs(el, ".plate"), { filter: "none", duration: 0 }, 0.9);
// an animated halftone is the `halftone` ambient under the plate, or a canvas on frameHook
```

### 2d. Stretch cut (image stretch transition)

```js
tl.to(qs(el, ".out"), { scaleX: 14, filter: "blur(18px)", opacity: 0, duration: 0.32, ease: "power3.in", transformOrigin: "50% 50%" }, 0)
  .fromTo(qs(el, ".in"), { scaleX: 14, filter: "blur(18px)" }, { scaleX: 1, filter: "blur(0px)", duration: 0.38, ease: "power3.out" }, 0.22);
// with render.shutter 0.5 the smear is real motion blur
```

### 2e. Nested images, image mask parallax, split reveal

```js
// nested: .f1 > .f2 > .f3, each overflow hidden; inner drifts at its own rate
tl.fromTo(qs(el, ".f2"), { scale: 1.12, x: -30 }, { scale: 1, x: 30, duration: D, ease: "sine.inOut" }, 0)
  .fromTo(qs(el, ".f3 img"), { scale: 1.2, y: 40 }, { scale: 1.05, y: -40, duration: D, ease: "sine.inOut" }, 0);
// mask parallax: the mask one way, the image the other
tl.fromTo(qs(el, ".mask"), { clipPath: "inset(20% 30% 20% 30%)" }, { clipPath: "inset(0% 0% 0% 0%)", duration: 1.1, ease: "power4.inOut" }, 0)
  .fromTo(qs(el, ".mask img"), { x: 60 }, { x: -60, duration: 1.1, ease: "power4.inOut" }, 0);
// split reveal: two halves part, the reveal already moving beneath
tl.to(qs(el, ".half-l"), { xPercent: -100, duration: 0.6, ease: "power4.inOut" }, 0.4)
  .to(qs(el, ".half-r"), { xPercent: 100, duration: 0.6, ease: "power4.inOut" }, 0.4);
```

### 2f. Card flip

```js
// mount: .card (preserve-3d, perspective on the parent) > .face.front + .face.back (backface-visibility: hidden; back rotated 180) + .edge (4px)
tl.to(qs(el, ".card"), { rotationY: 180, duration: 0.62, ease: "power3.inOut" }, 0.5)
  .to(qs(el, ".card"), { y: -18, scale: 1.04, duration: 0.31, ease: "power2.out", yoyo: true, repeat: 1 }, 0.5);
```

### 2g. Gooey

```js
// mount: <filter id="goo"><feGaussianBlur stdDeviation="14"/><feColorMatrix values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 24 -12"/></filter> on a group of discs
tl.to(qs(el, ".d1"), { x: 120, duration: 0.8, ease: "power2.inOut" }, 0).to(qs(el, ".d2"), { x: -120, duration: 0.8, ease: "power2.inOut" }, 0);
```

## 3. The product, rebuilt

A `ui-frame` with `html` gives you the frame, the tilt, the aura, the focus
camera, the cursor and `beats` on any element inside (`show`, `hide`,
`swap`, `nudge`, `pulse`, `zoom`, `blurout`). Use it for rows landing
(`show` beats in sequence), a label changing (`swap`), a card lifting
(`pulse`), the result appearing (`cursor.then` or `show`). Write a project
type only when a part needs a real tween — a field expanding, a button
splitting, a toggle snapping — and mount your own frame with the classes
`ui-frame` / `ui-screen` from `engine/css/shots.css` so it looks like the
built-in.

```js
// the html of a rebuilt screen: the product's real hierarchy, the film's type and palette
html: `<div class="scr">
  <aside class="nav"><b>Home</b><span>Files</span><span>Shared</span><span>Requests</span></aside>
  <main><div class="field"><span class="q"></span></div>
    <div class="row" style="opacity:0">Q3 launch deck.key</div><div class="row" style="opacity:0">Brand book.pdf</div><div class="row" style="opacity:0">Fall samples</div></main></div>`,
// rows start hidden inline: a `show` beat animates from opacity 0 at its `at`, it does not hide before it
beats: [
  { kind: "swap", sel: ".q", text: "fall samples", at: 0.6 },
  { kind: "show", sel: ".row:nth-child(2)", at: 1.1 }, { kind: "show", sel: ".row:nth-child(3)", at: 1.25 }, { kind: "show", sel: ".row:nth-child(4)", at: 1.4 },
  { kind: "zoom", sel: ".row:nth-child(4)", fill: 0.5, at: 2.2, release: 0.8 },
]
```

### 3a. Search bar reveal

```js
tl.fromTo(qs(el, ".field"), { width: 88, borderRadius: 44 }, { width: 900, borderRadius: 18, duration: 0.55, ease: "expo.out" }, 0.2)
  .from(qs(el, ".field .icon"), { x: 20, duration: 0.3 }, 0.2)
  .to(qs(el, ".field .q"), { text: shot.query, duration: 0.7, ease: "none" }, 0.6)             // typing at UI scale is fine
  .from(qs(el, ".results").children, { y: 14, opacity: 0, duration: 0.3, stagger: 0.07, ease: "expo.out" }, 1.3);
```

### 3b. Button split, toggle snap, generate button

```js
// split: a flex pill; on press the two halves part
tl.to(qs(el, ".btn"), { scale: 0.96, duration: 0.08 }, "press").to(qs(el, ".btn"), { scale: 1, duration: 0.2, ease: "settle" }, "press+=0.08")
  .to(qs(el, ".btn"), { gap: 14, duration: 0.35, ease: "expo.out" }, "press+=0.1")
  .from(qs(el, ".btn .count"), { width: 0, opacity: 0, duration: 0.35, ease: "expo.out" }, "press+=0.1");
// toggle: knob crosses with a squash, track fills
tl.to(qs(el, ".knob"), { x: 44, scaleX: 1.25, duration: 0.18, ease: "power2.in" }, 0.4).to(qs(el, ".knob"), { scaleX: 1, duration: 0.2, ease: "settle" }, 0.58)
  .to(qs(el, ".track"), { backgroundColor: ACCENT, duration: 0.25 }, 0.4);
// generate: press → progress rule draws → label swaps → result rises
tl.to(qs(el, ".gen"), { scale: 0.96, duration: 0.08 }, 0.3).from(qs(el, ".gen .rule"), { drawSVG: "0%", duration: 1.0, ease: "power1.inOut" }, 0.4)
  .set(qs(el, ".gen .label"), { textContent: "Done" }, 1.4).from(qs(el, ".result"), { y: 30, opacity: 0, filter: "blur(8px)", duration: 0.5, ease: "expo.out" }, 1.45);
```

### 3c. Charts

```js
tl.from(qs(el, "#line"), { drawSVG: "0%", duration: 1.6, ease: "power2.inOut" }, 0)
  .to(qs(el, "#dot"), { motionPath: { path: "#line", align: "#line", alignOrigin: [0.5, 0.5] }, duration: 1.6, ease: "power2.inOut" }, 0);
tl.from(el.querySelectorAll(".bar"), { scaleY: 0, transformOrigin: "50% 100%", duration: 0.6, stagger: 0.06, ease: "expo.out" }, 0);
tl.to(qs(el, "#line"), { morphSVG: "#radar", duration: 0.8, ease: "power2.inOut" }, 2.0);
```

### 3d. Departures board (split-flap)

```js
el.querySelectorAll(".flap").forEach((f, i) => {
  tl.to(f.querySelector(".old"), { rotationX: -90, duration: 0.09, ease: "power1.in" }, 0.2 + i * 0.035)
    .fromTo(f.querySelector(".new"), { rotationX: 90 }, { rotationX: 0, duration: 0.11, ease: "settle" }, 0.29 + i * 0.035);
});
```

### 3e. Callout anchored to the UI

```js
tl.from(qs(el, "#callout-line"), { drawSVG: "0%", duration: 0.8, ease: "power3.inOut" }, 0)
  .from(qs(el, "#callout"), { y: 20, opacity: 0, filter: "blur(10px)", duration: 0.5, ease: "power3.out" }, 0.6);
```

## 4. Reveals

### 4a. Project teaser (tile grid)

```js
const tiles = el.querySelectorAll(".tile");          // 3×3: brand-colour blocks and harvested photos
tiles.forEach((t, i) => tl.fromTo(t, { rotationY: -90, opacity: 0 }, { rotationY: 0, opacity: 1, duration: 0.5, ease: "expo.out" }, 0.1 + (i % 3) * 0.08 + Math.floor(i / 3) * 0.12));
tl.to(tiles, { rotationY: 90, opacity: 0, duration: 0.4, ease: "power3.in", stagger: { each: 0.04, from: "random" } }, D - 0.9)
  .from(qs(el, ".reveal"), { scale: 0.9, filter: "blur(12px)", opacity: 0, duration: 0.5, ease: "expo.out" }, D - 0.6);
```

### 4b. Confetti with depth (one shot, seeded)

```js
const rand = rng(1234);
el.querySelectorAll(".spark").forEach((s) => {
  const size = 6 + rand() * 14;
  gsap.set(s, { width: size, height: size, filter: `blur(${size > 14 ? 3 : 0}px)` });
  tl.to(s, { physics2D: { velocity: 340 + rand() * 260, angle: -90 + (rand() - 0.5) * 70, gravity: 620 }, opacity: 0, duration: 1.4, ease: "none" }, "cta+=0.05");
});
```

### 4c. Logo: mask reveal + one specular sweep, gradient surface, foil

```js
tl.fromTo(qs(el, ".logo-wrap"), { clipPath: "inset(0 100% 0 0)" }, { clipPath: "inset(0 0% 0 0)", duration: 0.7, ease: "power3.inOut" }, 0)
  .to(qs(el, ".sweep"), { xPercent: 280, duration: 0.6, ease: "power2.inOut" }, 0.55);              // one sweep, no glow loop
tl.to(qs(el, ".grad"), { backgroundPosition: "100% 0", duration: 1.4, ease: "sine.inOut" }, 0);   // gradient layers surfacing the mark
tl.to(qs(el, ".foil"), { backgroundPosition: "200% 0", duration: 1.1, ease: "power2.inOut" }, 0.3); // a conic sheen under mix-blend-mode: overlay
```

### 4d. Odometer, cascade deal, marquee, edge wipe

```js
tl.to(qs(el, ".digits"), { y: -rowH * target, duration: 1.2, ease: "power4.out" }, 0);                                  // digits in a clipped window
tl.from(el.querySelectorAll(".card"), { y: 90, rotation: (i) => (i - 2) * 3.5, transformOrigin: "50% 120%", opacity: 0, duration: 0.6, stagger: 0.12, ease: "expo.out" }, 0.4);
tl.to(qs(el, ".ticker"), { xPercent: -50, duration: 18, ease: "none" }, 0);                                              // one of the few `none` eases
tl.fromTo(qs(el, ".panel"), { clipPath: "inset(0 100% 0 0)" }, { clipPath: "inset(0 0% 0 0)", duration: 0.7, ease: "power3.inOut" }, 0)
  .fromTo(qs(el, ".wipe-edge"), { x: 0 }, { x: panelW, duration: 0.7, ease: "power3.inOut" }, 0);                       // a 2px rule rides the wipe
```

## 5. Real 3D

`{ type: "device-3d", device: "laptop" | "phone" | "slab" | "card", src,
turn: { from: [12, -62], to: [4, 16] } }` is built in, and `ring` for five
screens. `ShotKit.three(el, { shadows, fov })` gives a factory a lit WebGL
stage in CSS pixels for what that does not do; build in `mount`, tween
`mesh.rotation` / `mesh.position` in `animate`, never render yourself.

```js
const stages = new WeakMap();
"device-turn": {
  mount(el, shot) {
    el.dataset.bg = shot.bg || "ink";
    const st = three(el, { shadows: true, fov: 30 }); const { THREE, scene } = st;
    scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const key = new THREE.DirectionalLight(0xffffff, 2.4); key.position.set(700, 900, 1400); key.castShadow = true; scene.add(key);
    const rim = new THREE.DirectionalLight(ACCENT_HEX, 1.2); rim.position.set(-900, 200, -600); scene.add(rim);
    const face = new THREE.MeshStandardMaterial({ map: st.texture(shot.src), roughness: 0.28 });
    const side = new THREE.MeshStandardMaterial({ color: 0x2a2d34, metalness: 0.7, roughness: 0.3 });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1180, 740, 26), [side, side, side, side, face, side]); mesh.castShadow = true; scene.add(mesh);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(8000, 8000), new THREE.ShadowMaterial({ opacity: 0.5 })); floor.rotation.x = -Math.PI / 2; floor.position.y = -430; floor.receiveShadow = true; scene.add(floor);
    stages.set(el, { mesh });
  },
  animate(el, shot, D) {
    const tl = gsap.timeline(); const { mesh } = stages.get(el);
    tl.fromTo(mesh.rotation, { y: -1.15, x: 0.22 }, { y: 0.32, x: 0.04, duration: D, ease: "power2.inOut" }, 0)
      .fromTo(mesh.position, { z: -1100, y: -140 }, { z: 0, y: 0, duration: D * 0.6, ease: "power3.out" }, 0);
    return tl;
  },
}
```

An extruded glyph (a countdown digit, the mark) is `TextGeometry` +
`ExtrudeGeometry` in the brand font on the same stage; a stack of the
product's cards is one `PlaneGeometry` per rebuilt card fanned in `z`.
Keep the camera still and move the object.

## 6. Transitions, shutter, grade — fields

`cut: "dissolve" | "wipe-*" | "push-*" | "iris" | "zoom" | "zoom-out" |
"flip" | "flood"` with `cutDur`; `carry: { from, to }` for the match cut;
actors for anything that crosses more than one boundary. `render: {
shutter: 0.5, samples: 4, depth: 10 }` is real motion blur; `grade` is the
finish. All decided in direction.md, none on by default.
