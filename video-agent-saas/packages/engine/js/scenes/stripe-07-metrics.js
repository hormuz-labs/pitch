export const html = `
<div class="sp-root">
  <div class="sp-bg"></div><div class="sp-grid"></div>
  <div class="sp-title">Real-time performance visibility</div>
  <div class="sp-metrics">
    <div class="sp-metric"><div class="v" id="v1">0</div><div class="k">US$ tn processed</div></div>
    <div class="sp-metric"><div class="v" id="v2">0</div><div class="k">Currencies + methods</div></div>
  </div>
</div>`;

export function buildTimeline() {
  const a = { x: 0 };
  const b = { x: 0 };
  gsap.set('.sp-metrics', { autoAlpha: 0, y: 20 });
  const tl = gsap.timeline();
  tl.to('.sp-title', { autoAlpha: 1, y: -6, duration: 0.7 })
    .to('.sp-metrics', { autoAlpha: 1, y: 0, duration: 0.6 })
    .to(a, { x: 1.9, duration: 1.2, onUpdate: () => { document.getElementById('v1').textContent = `${a.x.toFixed(1)}tn`; } })
    .to(b, { x: 135, duration: 1.0, onUpdate: () => { document.getElementById('v2').textContent = `${Math.round(b.x)}+`; } }, '-=1.0')
    .to({}, { duration: 0.6 });
  return tl;
}
