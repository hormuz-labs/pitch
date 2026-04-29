export const html = `
<div class="sp-root">
  <div class="sp-bg"></div>
  <div class="sp-grid"></div>
  <div class="sp-title">Growth creates complexity</div>
  <div class="sp-lines">
    <div class="sp-line l1"></div><div class="sp-line l2"></div><div class="sp-line l3"></div><div class="sp-line l4"></div>
  </div>
</div>`;

export function buildTimeline() {
  gsap.set('.sp-line', { scaleX: 0, opacity: 0.1 });
  const tl = gsap.timeline();
  tl.to('.sp-title', { autoAlpha: 1, y: -6, duration: 0.8, ease: 'power3.out' })
    .to('.sp-line', { scaleX: 1, opacity: 1, stagger: 0.12, duration: 0.8, ease: 'expo.out' }, '-=0.4')
    .to('.sp-lines', { scale: 0.94, rotation: -2, duration: 1.1, ease: 'power2.inOut' })
    .to('.sp-lines', { x: 260, duration: 0.9, ease: 'power3.in' })
    .to({}, { duration: 0.5 });
  return tl;
}
