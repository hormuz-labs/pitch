export const html = `
<div class="sp-root">
  <div class="sp-bg"></div><div class="sp-grid"></div>
  <div class="sp-title">Smarter fraud decisions</div>
  <div class="sp-radar">
    <div class="sp-scan"></div>
    <div class="sp-dot d1"></div><div class="sp-dot d2 risk"></div>
    <div class="sp-dot d3"></div><div class="sp-dot d4 risk"></div>
  </div>
</div>`;

export function buildTimeline() {
  gsap.set(['.sp-radar', '.sp-dot'], { autoAlpha: 0 });
  const tl = gsap.timeline();
  tl.to('.sp-title', { autoAlpha: 1, y: -6, duration: 0.7 })
    .to('.sp-radar', { autoAlpha: 1, duration: 0.7 })
    .to('.sp-dot', { autoAlpha: 1, stagger: 0.08, duration: 0.2 }, '-=0.3')
    .to('.sp-scan', { rotation: 360, transformOrigin: '50% 100%', duration: 1.5, ease: 'none' })
    .to('.risk', { backgroundColor: '#ff5c78', scale: 1.4, yoyo: true, repeat: 1, duration: 0.25 }, '-=0.9')
    .to({}, { duration: 0.6 });
  return tl;
}
