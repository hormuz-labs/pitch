# Motion Cookbook

GSAP recipes for the explainer-video pipeline. Every snippet here uses only core GSAP — no paid plugins, no imports.

Read the **Pitfalls** section at the bottom *before* writing any animation code. Most first-build failures come from those, not from missing techniques.

---

## Scene transitions

The default in/out for every scene. Blur + slight scale produces a clean cut without a hard slam:

```js
const hideScene = (id) => gsap.to(id, {
  autoAlpha: 0, scale: 1.04, filter: 'blur(10px)',
  duration: 0.55, ease: 'power2.in'
});
const showScene = (id) => gsap.fromTo(id,
  { autoAlpha: 0, scale: 0.97, filter: 'blur(10px)' },
  { autoAlpha: 1, scale: 1, filter: 'blur(0px)', duration: 0.85, ease: 'expo.out' }
);
```

Wire them into the timeline with labels and a small overlap:

```js
tl.addLabel('s2', '-=0.2')
  .add(showScene('#fv3-s2'), 's2')
  .to('#fv3-s2 .fv3-title', { autoAlpha: 1, y: 0, duration: 0.8, ease: 'expo.out' }, 's2+=0.15')
  // ... scene-specific animations ...
  .add(hideScene('#fv3-s2'), '+=0.4');
```

---

## Counter that ticks up

Animate a dummy object's property; write to the DOM in `onUpdate`. The proxy-object approach works for any number type and any formatting.

```js
// Integer with comma separators
tl.to({ v: 0 }, {
  v: 200,
  duration: 1.6,
  ease: 'power3.out',
  onUpdate: function () {
    const n = Math.floor(this.targets()[0].v);
    document.getElementById('counter').textContent = `${n}M+`;
  }
}, 's4+=0.6');

// Decimal stat (1.9, 2.4, etc.)
tl.to({ v: 0 }, {
  v: 1.9,
  duration: 1.6,
  ease: 'power3.out',
  onUpdate: function () {
    document.getElementById('volume').textContent = this.targets()[0].v.toFixed(1);
  }
}, 's7+=0.7');
```

Use `font-variant-numeric: tabular-nums` on the target element. Without it, the counter visibly jitters as digit widths change.

---

## Drawing an SVG path (without DrawSVG)

GSAP's DrawSVG is a paid plugin and is unavailable. Use stroke-dasharray instead — it's a one-line equivalent:

```js
// For each path you want to draw:
const path = document.querySelector('.my-path');
const len = path.getTotalLength();
path.style.strokeDasharray = `${len}`;
path.style.strokeDashoffset = `${len}`;

// Then animate the offset to 0:
tl.to(path, {
  strokeDashoffset: 0,
  duration: 1.2,
  ease: 'power2.inOut'
}, 's5+=0.4');
```

For multiple paths, do the setup in a `forEach` then animate the whole selector with stagger:

```js
document.querySelectorAll('#fv3-s5 .map-arc').forEach(p => {
  const len = p.getTotalLength();
  p.style.strokeDasharray = `${len}`;
  p.style.strokeDashoffset = `${len}`;
});
tl.to('#fv3-s5 .map-arc', {
  strokeDashoffset: 0,
  duration: 0.7,
  stagger: 0.025,
  ease: 'power2.out'
}, 's5+=0.4');
```

---

## Particle traveling along a curve

For "money flowing into Stripe" or "payouts firing to sellers" — a dot that follows a bezier path. Use `getPointAtLength`:

```js
const path = document.querySelector('#fv3-flowpath-0');
const len = path.getTotalLength();
const proxy = { t: 0 };

tl.to(proxy, {
  t: 1,
  duration: 1.6,
  ease: 'sine.inOut',
  repeat: 1,
  onUpdate: () => {
    const pt = path.getPointAtLength(proxy.t * len);
    particle.setAttribute('cx', pt.x);
    particle.setAttribute('cy', pt.y);
  }
}, 's2+=0.8');
```

The path itself can be invisible (`stroke: transparent`) — it's just a track. To stagger multiple particles on the same path, give each its own proxy with an offset start time.

---

## Typewriter effect on code or text

`clip-path` with a stepped easing is more reliable than character-by-character animation:

```js
tl.fromTo('#fv3-code',
  { clipPath: 'inset(0 100% 0 0)' },
  { clipPath: 'inset(0 0% 0 0)', duration: 1.6, ease: 'steps(40)' },
's9+=0.5');
```

The number of steps roughly equals the character count for a believable typing rhythm. For non-monospaced text, this looks slightly less convincing — prefer it for code blocks.

For typing into a form field (one character at a time), use a per-character proxy:

```js
const text = 'name@company.com';
const obj = { i: 0 };
tl.to(obj, {
  i: text.length,
  duration: 0.4 + text.length * 0.018,
  ease: 'none',
  onUpdate: () => { field.textContent = text.slice(0, Math.floor(obj.i)); }
}, 's3+=0.7');
```

---

## Animating SVG attributes per-element

When you need each element to animate to its own end value (e.g. a hundred dots scattering to unique positions), use the `attr` plugin with **per-property functions**, not a wrapping function:

```js
// CORRECT
tl.to(dotEls, {
  attr: {
    cx: (i, t) => parseFloat(t.dataset.ex),
    cy: (i, t) => parseFloat(t.dataset.ey)
  },
  duration: 1.6,
  stagger: { each: 0.006, from: 'random' },
  ease: 'expo.out'
});

// WRONG — gsap won't unpack this
tl.to(dotEls, {
  attr: function (i) { return { cx: data[i].ex, cy: data[i].ey }; }
});
```

Stash per-element targets in `data-*` attributes during generation so the function can read them with the element reference (`t`).

---

## Confetti / particle burst

For celebration moments (successful payment, completion). Pre-generate the particles in DOM, then explode them outward on cue:

```js
const colors = ['#533AFD', '#FFE0D1', '#061B31', '#8B7CFF'];
const conf = [];
for (let i = 0; i < 28; i++) {
  const d = document.createElement('div');
  d.className = 'conf';
  d.style.left = '50%'; d.style.top = '50%';
  d.style.background = colors[i % colors.length];
  wrap.appendChild(d);
  conf.push(d);
}

conf.forEach((c, i) => {
  const angle = (i / conf.length) * Math.PI * 2;
  const dist = 80 + Math.random() * 110;
  tl.fromTo(c,
    { x: 0, y: 0, opacity: 1, scale: 1 },
    {
      x: Math.cos(angle) * dist,
      y: Math.sin(angle) * dist - 30,
      opacity: 0,
      scale: 0.6,
      duration: 1.2,
      ease: 'power2.out'
    }, 's3+=2.95');
});
```

Vary the distance per particle. Lift slightly upward (the `-30` on `y`) for gravity-defying feel.

---

## Pulse rings expanding outward

For map pings, server activity, or "alive" indicators:

```js
tl.fromTo(ring,
  { opacity: 0.8, attr: { r: 3 } },
  {
    opacity: 0,
    attr: { r: 22 },
    duration: 1.2,
    ease: 'power2.out',
    repeat: 1,
    repeatDelay: 0.3
  },
's8+=0.9');
```

Stagger an array of pulses with different `delay` offsets so they don't fire in unison.

---

## Chart fill + line draw together

For sparklines and area charts. Two SVG paths — a `<path>` for the line, another `<path>` (with `fill`, no stroke) for the area below. Draw the line via stroke-dashoffset, fade the fill in at the same time:

```js
const sparkLine = document.getElementById('spark-line');
const lineLen = sparkLine.getTotalLength();
sparkLine.style.strokeDasharray = `${lineLen}`;
sparkLine.style.strokeDashoffset = `${lineLen}`;

tl.to(sparkLine, { strokeDashoffset: 0, duration: 1.4, ease: 'power2.out' }, 's7+=0.7');
tl.fromTo(sparkFill, { opacity: 0 }, { opacity: 0.4, duration: 1.2, ease: 'power2.out' }, 's7+=0.9');
```

The fill should peak well below 1.0 opacity (0.3–0.5 range) — gradients with stops at `0.4` → `0` opacity work even better.

---

## Ambient (always-running) loops

These run on their own timelines, not the main one. Set them up at the top of `buildTimeline`:

```js
// Slowly drifting grid
gsap.to('.fv3-grid', { backgroundPosition: '64px 64px', duration: 24, ease: 'none', repeat: -1 });

// Breathing grain
gsap.to('.fv3-grain', { opacity: 0.45, duration: 0.9, repeat: -1, yoyo: true, ease: 'sine.inOut' });

// Orbiting ring around a hub
gsap.to('#fv3-s2 .flow-hub-ring', { rotate: 360, duration: 16, ease: 'none', repeat: -1 });
```

Keep ambient loops slow (10s+ periods). Anything faster reads as nervous.

---

## Procedural element generation

Don't hardcode 25 destination pins. Generate them in a loop, push references to an array, and animate the array. Three benefits: scenes become easy to retune (change one number to get 40 pins), positions feel organic (light randomness), and the file stays compact.

```js
const SVG = 'http://www.w3.org/2000/svg';
function svgEl(name, attrs = {}) {
  const el = document.createElementNS(SVG, name);
  for (const k in attrs) el.setAttribute(k, attrs[k]);
  return el;
}

function generateMap() {
  const arcsG = document.querySelector('#fv3-s5 .map-arcs');
  const pinsG = document.querySelector('#fv3-s5 .map-pins');
  arcsG.innerHTML = '';
  pinsG.innerHTML = '';

  const cx = 500, cy = 250;
  const dests = [];
  for (let i = 0; i < 25; i++) {
    const angle = (i / 25) * Math.PI * 2 + (Math.random() - 0.5) * 0.15;
    const radius = 180 + Math.random() * 100;
    const x = cx + Math.cos(angle) * radius * 1.6;
    const y = cy + Math.sin(angle) * radius * 0.85;
    dests.push({ x, y });

    arcsG.appendChild(svgEl('path', {
      class: 'map-arc',
      d: `M ${cx} ${cy} Q ${(cx+x)/2} ${(cy+y)/2 - 40} ${x} ${y}`
    }));
    pinsG.appendChild(svgEl('circle', { class: 'map-pin', cx: x, cy: y, r: 2.5 }));
  }
  return dests;
}
```

Always call generators *inside* `buildTimeline`, not at module top level. That way procedural content is fresh each build.

---

## Pitfalls

These cost the most time on first builds. Read before writing.

- **DrawSVG is paid.** Use `strokeDasharray` + `strokeDashoffset` (recipe above). Same for MorphSVG, SplitText, ScrollTrigger — all unavailable.
- **`gsap` is a global, not an import.** Don't add `import gsap from 'gsap'` — the renderer doesn't bundle it that way and you'll get a build error.
- **Pseudo-elements can't be animated by GSAP.** `::before`, `::after` are invisible to JS. To animate them, toggle a class on the parent and define the transition in CSS:
  ```css
  .stat-card::before { transform: scaleY(0); transition: transform 0.6s ease-out; }
  .stat-card.show::before { transform: scaleY(1); }
  ```
  Then `tl.call(() => el.classList.add('show'), ...)`.
- **`attr` plugin syntax is per-property.** See "Animating SVG attributes per-element" above. The wrapping-function form silently does nothing.
- **Procedural generation must run inside `buildTimeline`.** If you call it at module top, the DOM doesn't exist yet — `document.querySelector` returns null and the scene renders empty.
- **Use `autoAlpha` instead of `opacity`.** `autoAlpha` flips `visibility` too, which prevents off-screen scenes from intercepting clicks or being focusable.
- **Class prefixes must be unique per scene module.** Loading `fv2-` and `fv3-` modules together is fine; loading two `fv3-` modules together breaks both. When iterating, bump the prefix.
- **Counters jitter without `font-variant-numeric: tabular-nums`.** Looks broken. Always set this on the counter element.
- **`getTotalLength()` returns 0 if the path isn't in the DOM yet.** Append to the SVG before measuring.
- **Don't put the timeline-rescale block before adding scenes.** It runs once, on the timeline as it exists at that moment. Always last.
- **`steps()` easing on `clip-path` needs `from: 'inset(0 100% 0 0)'` and `to: 'inset(0 0% 0 0)'`** — explicitly. GSAP can't infer the start state.
- **Use `transformOrigin: 'center'` on SVG `<circle>` scale animations.** Without it, the circle scales from the SVG's origin and flies across the screen.
