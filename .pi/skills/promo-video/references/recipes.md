# Recipes: shots the ads keep needing

Four project shot types in a 9:16 film (`signal`, `exploded` and `float`
tested seek-exact and audit-clean; `strobe` follows the same pattern).
Copy one into `js/shots/<type>.js` (and its CSS into `css/shots/<type>.css`)
only when the film uses it; `pitch motion check` links the files. Change the
look freely; keep the rules they follow — every value driven from the
returned timeline, canvas drawn by `frameHook`, sizes from `ShotKit.stage`.

## `signal` — a sound wave with an RGB fringe

The reference's motif for "hearing": a sine line on black whose three colour
channels separate slightly. Tween `amp` down to say "losing", `freq` up for
noise or stress; swap the maths for a pulse (health), a price line (money) or
a tide (water). Vertical by default in a portrait frame.

```js
{ id: "losing", type: "signal", dur: 1.4, amp: [0.34, 0.1], freq: [1.3, 2.4], speed: 0.8, bg: "#000" }
```

```js
// A sound wave with an RGB fringe, drawn on a canvas from timeline state.
// { type: "signal", dur, amp: [0.32, 0.02], freq: [1.4, 3], speed: 0.8, axis: "vertical", fringe: 7, width: 5 }
(function () {
  const { frameHook, stage } = window.ShotKit;
  const pair = (v, d) => (Array.isArray(v) ? v : [v ?? d, v ?? d]);
  window.ProjectShotFactories = Object.assign(window.ProjectShotFactories || {}, {
    signal: {
      mount(el, shot) {
        el.dataset.bg = shot.bg || "#000";
        const dpr = window.devicePixelRatio || 1;
        const c = document.createElement("canvas");
        c.width = Math.round(stage.w * dpr);
        c.height = Math.round(stage.h * dpr);
        c.style.cssText = `position:absolute;left:0;top:0;width:${stage.w}px;height:${stage.h}px`;
        el.appendChild(c);
        const ctx = c.getContext("2d");
        const [a0] = pair(shot.amp, 0.3), [f0] = pair(shot.freq, 1.4);
        const st = (el.__signal = { amp: a0, freq: f0, phase: 0 });
        const vertical = (shot.axis || (stage.h > stage.w ? "vertical" : "horizontal")) === "vertical";
        const len = vertical ? stage.h : stage.w, across = vertical ? stage.w : stage.h;
        const fringe = shot.fringe ?? 7;
        const lanes = [["rgb(255,40,90)", -fringe], ["rgb(40,255,140)", 0], ["rgb(60,110,255)", fringe]];
        frameHook(el, () => {
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          ctx.clearRect(0, 0, stage.w, stage.h);
          ctx.globalCompositeOperation = "lighter";
          ctx.lineWidth = shot.width ?? 5;
          ctx.lineJoin = "round";
          for (const [color, off] of lanes) {
            ctx.strokeStyle = color;
            ctx.beginPath();
            for (let s = -10; s <= len + 10; s += 4) {
              const v = across / 2 + off + Math.sin((s / len) * Math.PI * 2 * st.freq + st.phase) * st.amp * across;
              if (vertical) (s === -10 ? ctx.moveTo(v, s) : ctx.lineTo(v, s));
              else (s === -10 ? ctx.moveTo(s, v) : ctx.lineTo(s, v));
            }
            ctx.stroke();
          }
          ctx.globalCompositeOperation = "source-over";
        });
      },
      animate(el, shot, D) {
        const st = el.__signal;
        const [a0, a1] = pair(shot.amp, 0.3), [f0, f1] = pair(shot.freq, 1.4);
        const tl = gsap.timeline();
        tl.fromTo(st, { amp: a0, freq: f0, phase: 0 },
          { amp: a1, freq: f1, phase: (shot.speed ?? 0.8) * D * Math.PI * 2, duration: D, ease: shot.ease || "power1.inOut" }, 0);
        return tl;
      },
    },
  });
})();
```

## `exploded` — the product taken apart

Transparent PNGs of the product's parts, top to bottom, spread along one
axis while the voice names the mechanism, then close again. Parts must be
the brand's own renders or photos; the order is the physical order.

```js
{ id: "inside", type: "exploded", dur: 3.2, bg: "#E9ECF1", gap: 160,
  parts: [{ src: "uploads/parts/tip.png", w: 300 }, { src: "uploads/parts/filter.png", w: 170 }, { src: "uploads/parts/body.png", w: 320 }] }
```

```js
// A product taken apart: its parts (cut-out PNGs, top to bottom) spread along one
// axis, hold while the narration names them, and close up again.
// { type: "exploded", dur, parts: [{ src, w }], gap: 150, open: [0.12, 0.45], close: [0.8, 0.97], tilt: -8, bg: "#E9ECF1" }
(function () {
  const { h, qsa, stage } = window.ShotKit;
  window.ProjectShotFactories = Object.assign(window.ProjectShotFactories || {}, {
    exploded: {
      mount(el, shot) {
        el.dataset.bg = shot.bg || "#E9ECF1";
        const rig = h(`<div class="xp-rig"></div>`);
        (shot.parts || []).forEach((p, i) => {
          const img = h(`<img class="xp-part" alt="" draggable="false" src="${p.src}">`);
          img.style.width = `${p.w || 320}px`;
          img.dataset.i = String(i);
          rig.appendChild(img);
        });
        el.appendChild(rig);
      },
      animate(el, shot, D) {
        const parts = qsa(el, ".xp-part");
        const n = parts.length;
        const gap = shot.gap ?? Math.min(stage.w, stage.h) * 0.14;
        const [o0, o1] = shot.open || [0.12, 0.45];
        const [c0, c1] = shot.close || [0.8, 0.97];
        const tl = gsap.timeline();
        // Assembled: every part at the centre, a hair apart. Open: spaced along the axis.
        parts.forEach((p, i) => {
          const k = i - (n - 1) / 2;
          tl.fromTo(p, { xPercent: -50, yPercent: -50, x: 0, y: k * 6, rotation: 0 },
            { y: k * gap, x: k * gap * 0.12, rotation: (shot.tilt ?? -8) * (k / Math.max(1, n / 2)), duration: D * (o1 - o0), ease: "expo.inOut" }, D * o0 + Math.abs(k) * 0.03);
          if (shot.close !== false) tl.to(p, { y: k * 6, x: 0, rotation: 0, duration: D * (c1 - c0), ease: "expo.inOut" }, D * c0);
        });
        tl.fromTo(el.querySelector(".xp-rig"), { scale: 0.96 }, { scale: 1.04, duration: D, ease: "none" }, 0);
        return tl;
      },
    },
  });
})();
```

```css
.xp-rig { position: absolute; inset: 0; }
.xp-part { position: absolute; left: 50%; top: 50%; filter: drop-shadow(0 24px 30px rgba(0,0,0,0.18)); }
```

## `float` — the product in the air

The payoff stage: product cut-outs floating on a clean ground, each bobbing
and turning a little with a soft shadow, the camera easing in. Put the payoff
captions in the empty half of the frame, dark `color` on a light `bg`.

```js
{ id: "payoff", type: "float", dur: 5, bg: "#EEF0F3", push: [1, 1.05],
  items: [{ src: "uploads/product-left.png", w: 340, x: 0.34, y: 0.62, rot: -14 },
          { src: "uploads/product-right.png", w: 300, x: 0.66, y: 0.56, rot: 10, depth: 0.7 }] }
```

```js
// Product cut-outs floating on a clean stage: each bobs and turns a little,
// its soft shadow breathing with it; the camera drifts in. The payoff shot.
// { type: "float", dur, items: [{ src, w, x: 0.35, y: 0.5, rot: -12, depth: 1 }], bob: 18, turn: 6, push: [1, 1.05], bg: "#EEF0F3" }
(function () {
  const { h, qsa, stage } = window.ShotKit;
  window.ProjectShotFactories = Object.assign(window.ProjectShotFactories || {}, {
    float: {
      mount(el, shot) {
        el.dataset.bg = shot.bg || "#EEF0F3";
        const rig = h(`<div class="fl-rig"></div>`);
        (shot.items || []).forEach((it, i) => {
          const wrap = h(`<div class="fl-item"><div class="fl-shadow"></div><img alt="" draggable="false" src="${it.src}"></div>`);
          wrap.style.left = `${(it.x ?? 0.5) * stage.w}px`;
          wrap.style.top = `${(it.y ?? 0.5) * stage.h}px`;
          const w = it.w || 360;
          wrap.querySelector("img").style.width = `${w}px`;
          const sh = wrap.querySelector(".fl-shadow");
          sh.style.width = `${Math.round(w * 0.75)}px`;
          sh.style.height = `${Math.round(w * 0.12)}px`;
          sh.style.top = `${Math.round(w * 0.55)}px`;
          wrap.dataset.i = String(i);
          rig.appendChild(wrap);
        });
        el.appendChild(rig);
      },
      animate(el, shot, D) {
        const items = qsa(el, ".fl-item");
        const specs = shot.items || [];
        const bob = shot.bob ?? 18, turn = shot.turn ?? 6;
        const st = { t: 0 };
        // Positions are a function of shot time, so every seek lands exactly.
        const apply = () => items.forEach((w, i) => {
          const s = specs[i] || {};
          const depth = s.depth ?? 1;
          const phase = i * 1.7;
          const y = Math.sin(st.t * 1.6 + phase) * bob * depth;
          const r = (s.rot ?? 0) + Math.sin(st.t * 0.9 + phase) * turn;
          const img = w.firstElementChild.nextElementSibling;
          img.style.transform = `translate(-50%, -50%) translateY(${y.toFixed(2)}px) rotate(${r.toFixed(2)}deg)`;
          const sh = w.firstElementChild;
          sh.style.transform = `translate(-50%, 0) scale(${(1 - y / (bob * 6 || 1)).toFixed(3)})`;
          sh.style.opacity = String((0.35 - y / (bob * 12 || 1)).toFixed(3));
        });
        apply();
        const tl = gsap.timeline();
        tl.to(st, { t: D, duration: D, ease: "none", onUpdate: apply }, 0);
        const push = Array.isArray(shot.push) ? shot.push : [1, shot.push ?? 1.05];
        tl.fromTo(el.querySelector(".fl-rig"), { scale: push[0] }, { scale: push[1], duration: D, ease: "none", transformOrigin: "50% 50%" }, 0);
        tl.from(items, { autoAlpha: 0, y: 40, duration: 0.5, ease: "expo.out", stagger: 0.08 }, 0);
        return tl;
      },
    },
  });
})();
```

```css
.fl-rig { position: absolute; inset: 0; }
.fl-item { position: absolute; width: 0; height: 0; }
.fl-item img { position: absolute; left: 0; top: 0; filter: drop-shadow(0 18px 24px rgba(0, 0, 0, 0.16)); }
.fl-shadow { position: absolute; left: 0; border-radius: 50%;
  background: radial-gradient(closest-side, rgba(0, 0, 0, 0.35), transparent); filter: blur(6px); }
```

## `strobe` — one word, cycling dressings

The flicker from the studies' closes and loud lists: a single word holds its
spot while its dressing — typeface, colour, fill, outline, glow — swaps every
0.08–0.2s, then lands on the final (usually the clean, brand) treatment. The
eye reads the word once; the flicker is pure energy. Keep the cycling under a
second, then land — strobing longer breaks the flash rule. For the *text*
swapping in one spot, use a `line` shot's `rotate` instead.

```js
{ id: "dont", type: "strobe", dur: 2.4, bg: "#000", text: "DON'T MISS OUT",
  every: 0.11, land: 0,
  treatments: [
    { font: "Georgia, serif", italic: true, color: "#FFFFFF" },   // the landing face
    { font: "'Arial Black', 'Helvetica Neue', sans-serif", color: "#C8FF3D", weight: 900 },
    { font: "'Courier New', monospace", color: "#FF4D6D", outline: "#FFFFFF" },
    { font: "'Times New Roman', serif", color: "#0B0B0C", highlight: "#C8FF3D" },
    { font: "'Helvetica Neue', sans-serif", color: "#FFFFFF", glow: "#7CF2C8", weight: 800 },
  ] }
```

```js
// One word holding its spot while its dressing cycles (font, colour, fill,
// outline, glow), then landing on one treatment for the rest of the shot.
// The index is a function of shot time, so every seek lands exactly.
// { type: "strobe", dur, text, every: 0.11, land: <index, default last>,
//   treatments: [{ font?, color?, weight?, italic?, case?, outline?: <colour>,
//   glow?: <colour>, highlight?: <colour>, scale?: <multiplier> }] }
(function () {
  window.ProjectShotFactories = Object.assign(window.ProjectShotFactories || {}, {
    strobe: {
      mount(el, shot) {
        el.dataset.bg = shot.bg || "#000";
        const word = document.createElement("div");
        word.className = "st-word";
        word.textContent = shot.text || "";
        word.style.fontSize = `${Math.round(window.ShotKit.stage.w * (shot.size || 0.13))}px`;
        el.appendChild(word);
        el.__strobe = { word, i: -1 };
      },
      animate(el, shot, D) {
        const st = el.__strobe;
        const ts = shot.treatments && shot.treatments.length ? shot.treatments : [{}];
        const every = shot.every ?? 0.11;
        const land = shot.land ?? ts.length - 1;
        const flicker = Math.min(D, every * ts.length);
        const apply = () => {
          const t = state.t;
          const i = t >= flicker ? land : Math.floor(t / every) % ts.length;
          if (i === st.i) return;
          st.i = i;
          const tr = ts[i];
          const w = st.word.style;
          w.fontFamily = tr.font || "";
          w.fontWeight = String(tr.weight ?? 800);
          w.fontStyle = tr.italic ? "italic" : "normal";
          w.textTransform = tr.case || "uppercase";
          w.color = tr.color || "#FFFFFF";
          w.background = tr.highlight || "transparent";
          w.webkitTextStroke = tr.outline ? `2px ${tr.outline}` : "0px transparent";
          w.textShadow = tr.glow ? `0 0 30px ${tr.glow}, 0 0 90px ${tr.glow}` : "none";
          w.transform = `translate(-50%, -50%) scale(${tr.scale || 1})`;
        };
        const state = { t: 0 };
        const tl = gsap.timeline();
        tl.to(state, { t: D, duration: D, ease: "none", onUpdate: apply }, 0);
        apply();
        return tl;
      },
    },
  });
})();
```

```css
.st-word { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%);
  white-space: nowrap; text-align: center; padding: 0 0.12em; }
```

## Built in, not a recipe

- Black cards: a `card` shot (`bg`, optional `gradient`) with the `captions`
  track doing the talking — the hook and the objection.
- The source: `evidence` (`pitch motion schema --types evidence`), or a real
  page screenshot as a `footage` still with `push`.
- Bursts, holds, stills: `footage` with `clips`, `push`, `look`, `flash`.
- Act changes: `cut: "glitch"`; a tear inside one shot: the `glitch` beat.
- The brand card: `logo-sting` / `logo-cta` with the brand's logo file.
- Anything else: a custom shot type in the project
  (`pitch motion schema --section "custom shot types"`).
