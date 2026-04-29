export const html = `
<div class="sp-root">
  <div class="sp-bg"></div><div class="sp-grid"></div>
  <div class="sp-title">Reliable global infrastructure</div>
  <div class="sp-globe"></div>
  <div class="sp-beam b1"></div><div class="sp-beam b2"></div><div class="sp-beam b3"></div>
  <div class="sp-chip">99.999% historical uptime for Stripe services</div>
</div>`;

export function buildTimeline() {
  gsap.set(['.sp-globe', '.sp-beam', '.sp-chip'], { autoAlpha: 0 });
  const tl = gsap.timeline();
  tl.to('.sp-title', { autoAlpha: 1, y: -6, duration: 0.7 })
    .to('.sp-globe', { autoAlpha: 1, scale: 1, duration: 0.8 })
    .to('.sp-globe', { rotation: 360, duration: 3.0, ease: 'none' }, '-=0.2')
    .to('.sp-beam', { autoAlpha: 1, stagger: 0.1, duration: 0.4 }, '-=2.7')
    .to('.sp-chip', { autoAlpha: 1, y: -6, duration: 0.5 }, '-=2.4')
    .to({}, { duration: 0.5 });
  return tl;
}
