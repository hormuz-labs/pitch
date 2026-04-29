export const html = `
<div class="sp-root">
  <div class="sp-bg"></div><div class="sp-grid"></div>
  <div class="sp-title">One platform for money</div>
  <div class="sp-node n1">Cards</div><div class="sp-node n2">Wallets</div>
  <div class="sp-node n3">Banks</div><div class="sp-node n4">UPI</div>
  <div class="sp-hub">Stripe</div>
</div>`;

export function buildTimeline() {
  gsap.set(['.sp-node', '.sp-hub'], { autoAlpha: 0, scale: 0.7 });
  const tl = gsap.timeline();
  tl.to('.sp-title', { autoAlpha: 1, y: -6, duration: 0.7 })
    .to('.sp-hub', { autoAlpha: 1, scale: 1, duration: 0.7, ease: 'back.out(1.8)' })
    .to('.sp-node', { autoAlpha: 1, scale: 1, stagger: 0.08, duration: 0.5 }, '-=0.2')
    .to('.sp-node', { x: 0, y: 0, duration: 1.1, ease: 'power3.inOut' })
    .to({}, { duration: 0.6 });
  return tl;
}
