export const html = `
<div class="sp-root">
  <div class="sp-bg"></div><div class="sp-grid"></div>
  <div class="sp-title">Accept payments everywhere</div>
  <div class="sp-card">
    <div class="sp-card-title">Checkout</div>
    <div class="sp-field"></div><div class="sp-field"></div>
    <div class="sp-btn">Pay now</div>
    <div class="sp-ok">Payment successful</div>
  </div>
</div>`;

export function buildTimeline() {
  gsap.set(['.sp-card', '.sp-ok'], { autoAlpha: 0, y: 20 });
  const tl = gsap.timeline();
  tl.to('.sp-title', { autoAlpha: 1, y: -6, duration: 0.7 })
    .to('.sp-card', { autoAlpha: 1, y: 0, duration: 0.8, ease: 'power3.out' })
    .to('.sp-btn', { scale: 0.96, duration: 0.15, yoyo: true, repeat: 1 })
    .to('.sp-ok', { autoAlpha: 1, y: 0, duration: 0.5 }, '+=0.2')
    .to({}, { duration: 0.7 });
  return tl;
}
