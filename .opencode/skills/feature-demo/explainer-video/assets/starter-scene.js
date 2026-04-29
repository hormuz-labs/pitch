/**
 * Starter scene module.
 *
 * Replace `fvN-` with a unique prefix (e.g. `fv3-`, `fvAcme-`).
 * Every scene module that may load in the same page needs its own prefix.
 *
 * `gsap` is provided as a global by the renderer — do NOT import it.
 * The renderer will inject `html` into the DOM, then call `buildTimeline(data)`.
 */

export const html = `
<div class="fvN-root">
  <style>
    .fvN-root {
      position: relative;
      width: 100%;
      height: 100%;
      overflow: hidden;
      background: #FFFFFF;
      color: #0A0E1A;
      font-family: 'Inter', -apple-system, system-ui, sans-serif;
      letter-spacing: -0.01em;
      --ink: #0A0E1A;
      --ink-2: rgba(10,14,26,0.55);
      --line: rgba(10,14,26,0.08);
      --bg: #FFFFFF;
      --accent: #533AFD; /* swap for brand primary */
    }

    .fvN-scene {
      position: absolute; inset: 0;
      display: flex; flex-direction: column;
      align-items: center; justify-content: center;
      padding: 8vh 7vw; box-sizing: border-box;
    }
    .fvN-head {
      position: absolute; top: 9vh; left: 0; right: 0;
      display: flex; flex-direction: column; align-items: center;
      padding: 0 7vw;
    }
    .fvN-stage {
      position: absolute; inset: 28vh 7vw 14vh 7vw;
      display: flex; align-items: center; justify-content: center;
    }

    .fvN-kicker {
      font-size: 12px; letter-spacing: 0.2em;
      text-transform: uppercase; color: var(--accent);
      margin: 0 0 20px 0;
    }
    .fvN-title {
      font-size: clamp(40px, 5.4vw, 80px);
      line-height: 0.98; letter-spacing: -0.035em;
      font-weight: 600; color: var(--ink);
      margin: 0 0 18px 0; text-align: center; max-width: 17ch;
    }
    .fvN-sub {
      font-size: clamp(15px, 1.3vw, 21px);
      color: var(--ink-2); max-width: 56ch;
      text-align: center; margin: 0;
    }
  </style>

  <!-- One scene per <section>. Add more as needed. -->
  <section class="fvN-scene" id="fvN-s1">
    <div class="fvN-head">
      <p class="fvN-kicker">Section label</p>
      <h1 class="fvN-title">Scene title from storyboard</h1>
      <p class="fvN-sub">Optional subtitle, also from storyboard.</p>
    </div>
    <div class="fvN-stage">
      <!-- The visualization goes here. Generate procedurally in buildTimeline. -->
    </div>
  </section>
</div>`;

/* ---------- procedural element generators ----------
 * Define one generator per scene that needs procedural content.
 * Always call them inside buildTimeline, never at module top level
 * (the DOM doesn't exist yet at import time).
 */

const SVG = 'http://www.w3.org/2000/svg';
function svgEl(name, attrs = {}) {
  const el = document.createElementNS(SVG, name);
  for (const k in attrs) el.setAttribute(k, attrs[k]);
  return el;
}

// Example: generate a scatter of dots inside a stage SVG.
// function generateScene1() { ... }

/* ---------- scene transitions ---------- */

const hideScene = (id) => gsap.to(id, {
  autoAlpha: 0, scale: 1.04, filter: 'blur(10px)',
  duration: 0.55, ease: 'power2.in'
});
const showScene = (id) => gsap.fromTo(id,
  { autoAlpha: 0, scale: 0.97, filter: 'blur(10px)' },
  { autoAlpha: 1, scale: 1, filter: 'blur(0px)', duration: 0.85, ease: 'expo.out' }
);

/* ---------- timeline ---------- */

export function buildTimeline(data = {}) {
  // 1. Generate procedural content fresh on each build.
  // generateScene1();

  // 2. Set initial states for every scene and every animatable element.
  gsap.set('.fvN-scene', {
    autoAlpha: 0, position: 'absolute',
    width: '100%', height: '100%', top: 0, left: 0
  });
  gsap.set('.fvN-title, .fvN-sub, .fvN-kicker', {
    autoAlpha: 0, y: 24
  });

  // 3. Optional: ambient loops (slow, long-period).
  // gsap.to('.fvN-grid', { backgroundPosition: '64px 64px', duration: 24, ease: 'none', repeat: -1 });

  // 4. Build the main timeline. Use labels with small overlaps.
  const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });

  // Scene 1
  tl.addLabel('s1')
    .call(() => gsap.set('#fvN-s1', { autoAlpha: 1, scale: 1, filter: 'blur(0px)' }))
    .to('#fvN-s1 .fvN-kicker', { autoAlpha: 1, y: 0, duration: 0.7, ease: 'expo.out' }, 's1')
    .to('#fvN-s1 .fvN-title', { autoAlpha: 1, y: 0, duration: 0.9, ease: 'expo.out' }, 's1+=0.08')
    .to('#fvN-s1 .fvN-sub', { autoAlpha: 1, y: 0, duration: 0.9, ease: 'expo.out' }, 's1+=0.18')
    // ... scene-specific motion ...
    .add(hideScene('#fvN-s1'), '+=1.5');

  // Scene 2 — pattern repeats:
  // tl.addLabel('s2', '-=0.2')
  //   .add(showScene('#fvN-s2'), 's2')
  //   .to('#fvN-s2 .fvN-title', { autoAlpha: 1, y: 0, duration: 0.8, ease: 'expo.out' }, 's2+=0.15')
  //   ...
  //   .add(hideScene('#fvN-s2'), '+=0.5');

  // 5. Tail breath, then rescale to target duration.
  tl.to({}, { duration: 1.0 });

  const targetDuration = Number(data.duration || 45);
  if (Number.isFinite(targetDuration) && targetDuration > 0) {
    const baseDuration = tl.duration();
    if (baseDuration > 0) tl.timeScale(baseDuration / targetDuration);
  }

  return tl;
}
