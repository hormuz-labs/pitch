export const html = `
<div class="sp-root">
  <div class="sp-bg"></div><div class="sp-grid"></div>
  <div class="sp-title">APIs built for speed</div>
  <div class="sp-code"><pre id="sp-code-pre">const session = await stripe.checkout.sessions.create({
  mode: 'payment',
  line_items: [{ price: 'price_xxx', quantity: 1 }],
  success_url: 'https://example.com/success'
});</pre></div>
</div>`;

export function buildTimeline() {
  gsap.set('.sp-code', { autoAlpha: 0, y: 20 });
  const tl = gsap.timeline();
  tl.to('.sp-title', { autoAlpha: 1, y: -6, duration: 0.7 })
    .to('.sp-code', { autoAlpha: 1, y: 0, duration: 0.7 })
    .from('#sp-code-pre', { clipPath: 'inset(0 100% 0 0)', duration: 1.4, ease: 'power2.out' })
    .to({}, { duration: 0.7 });
  return tl;
}
