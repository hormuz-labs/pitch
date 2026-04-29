export const html = `
<div class="sp-root">
  <div class="sp-bg"></div><div class="sp-grid"></div>
  <div class="sp-title">Automate recurring revenue</div>
  <div class="sp-ring"><div class="sp-orb o1"></div><div class="sp-orb o2"></div><div class="sp-orb o3"></div></div>
  <div class="sp-chip">200M+ subscriptions on Billing</div>
</div>`;

export function buildTimeline() {
  gsap.set(['.sp-ring', '.sp-chip'], { autoAlpha: 0, scale: 0.85 });
  const tl = gsap.timeline();
  tl.to('.sp-title', { autoAlpha: 1, y: -6, duration: 0.7 })
    .to('.sp-ring', { autoAlpha: 1, scale: 1, duration: 0.7 })
    .to('.sp-orb', { rotate: 360, transformOrigin: '170px 170px', duration: 1.4, stagger: 0.08, ease: 'none' })
    .to('.sp-chip', { autoAlpha: 1, scale: 1, duration: 0.5 }, '-=0.8')
    .to({}, { duration: 0.6 });
  return tl;
}
