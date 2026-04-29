export const html = `
<div class="sp-root">
  <div class="sp-bg"></div><div class="sp-grid"></div>
  <div class="sp-title">Scale payouts seamlessly</div>
  <div class="sp-payout-center">Platform</div>
  <div class="sp-leaf a">Seller A</div><div class="sp-leaf b">Seller B</div>
  <div class="sp-leaf c">Seller C</div><div class="sp-leaf d">Seller D</div>
  <div class="sp-chip">Get sellers in 25 countries paid</div>
</div>`;

export function buildTimeline() {
  gsap.set(['.sp-payout-center', '.sp-leaf', '.sp-chip'], { autoAlpha: 0, scale: 0.8 });
  const tl = gsap.timeline();
  tl.to('.sp-title', { autoAlpha: 1, y: -6, duration: 0.7 })
    .to('.sp-payout-center', { autoAlpha: 1, scale: 1, duration: 0.6 })
    .to('.sp-leaf', { autoAlpha: 1, scale: 1, stagger: 0.1, duration: 0.5 })
    .to('.sp-leaf', { x: '+=8', yoyo: true, repeat: 1, stagger: 0.06, duration: 0.2 })
    .to('.sp-chip', { autoAlpha: 1, scale: 1, duration: 0.5 })
    .to({}, { duration: 0.6 });
  return tl;
}
