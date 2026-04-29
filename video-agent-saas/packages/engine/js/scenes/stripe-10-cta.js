export const html = `
<div class="sp-root">
  <div class="sp-bg"></div><div class="sp-grid"></div>
  <div class="sp-title">Start now with Stripe</div>
  <div class="sp-proof-grid">
    <div class="sp-proof">135+ currencies and payment methods supported</div>
    <div class="sp-proof">US$1.9tn in payments volume processed in 2025</div>
    <div class="sp-proof">200M+ active subscriptions managed on Stripe Billing</div>
    <div class="sp-proof">50% of Fortune 100 companies have used Stripe</div>
  </div>
</div>`;

export function buildTimeline() {
  gsap.set('.sp-proof', { autoAlpha: 0, y: 14 });
  const tl = gsap.timeline();
  tl.to('.sp-title', { autoAlpha: 1, y: -6, duration: 0.8 })
    .to('.sp-proof', { autoAlpha: 1, y: 0, stagger: 0.12, duration: 0.45 })
    .to('.sp-proof-grid', { scale: 1.02, duration: 0.6, yoyo: true, repeat: 1 })
    .to({}, { duration: 1.2 });
  return tl;
}
