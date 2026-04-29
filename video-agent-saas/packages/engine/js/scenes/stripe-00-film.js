export const html = `
<div class="sf-root">
  <div class="sf-bg"></div>
  <div class="sf-grid"></div>
  <div class="sf-noise"></div>

  <section class="sf-scene" id="sf-1">
    <h1 class="sf-title">Growth creates complexity</h1>
    <div class="sf-rail"></div>
  </section>

  <section class="sf-scene" id="sf-2">
    <h2 class="sf-title">One platform for money</h2>
    <div class="sf-network">
      <div class="sf-node n1">Cards</div>
      <div class="sf-node n2">Wallets</div>
      <div class="sf-node n3">Banks</div>
      <div class="sf-node n4">UPI</div>
      <div class="sf-hub">Stripe</div>
    </div>
  </section>

  <section class="sf-scene" id="sf-3">
    <h2 class="sf-title">Accept payments everywhere</h2>
    <div class="sf-card">
      <div class="sf-card-title">Checkout</div>
      <div class="sf-input"></div>
      <div class="sf-input"></div>
      <div class="sf-pay">Pay now</div>
      <div class="sf-ok">Payment successful</div>
    </div>
  </section>

  <section class="sf-scene" id="sf-4">
    <h2 class="sf-title">Automate recurring revenue</h2>
    <div class="sf-ring"><div></div><div></div><div></div></div>
    <div class="sf-chip">200M+ active subscriptions on Stripe Billing</div>
  </section>

  <section class="sf-scene" id="sf-5">
    <h2 class="sf-title">Scale payouts seamlessly</h2>
    <div class="sf-platform">Platform</div>
    <div class="sf-leaf l1">Seller A</div><div class="sf-leaf l2">Seller B</div>
    <div class="sf-leaf l3">Seller C</div><div class="sf-leaf l4">Seller D</div>
    <div class="sf-chip">Get sellers in 25 countries paid</div>
  </section>

  <section class="sf-scene" id="sf-6">
    <h2 class="sf-title">Smarter fraud decisions</h2>
    <div class="sf-radar"><div class="sf-scan"></div><span></span><span class="risk"></span><span></span><span class="risk"></span></div>
  </section>

  <section class="sf-scene" id="sf-7">
    <h2 class="sf-title">Real-time performance visibility</h2>
    <div class="sf-metrics">
      <div class="sf-metric"><b id="sf-v1">0</b><small>US$ tn processed in 2025</small></div>
      <div class="sf-metric"><b id="sf-v2">0</b><small>Currencies + methods</small></div>
    </div>
  </section>

  <section class="sf-scene" id="sf-8">
    <h2 class="sf-title">Reliable global infrastructure</h2>
    <div class="sf-globe"></div>
    <div class="sf-chip">99.999% historical uptime for Stripe services</div>
  </section>

  <section class="sf-scene" id="sf-9">
    <h2 class="sf-title">APIs built for speed</h2>
    <pre class="sf-code" id="sf-code">const session = await stripe.checkout.sessions.create({
  mode: 'payment',
  line_items: [{ price: 'price_xxx', quantity: 1 }],
  success_url: 'https://example.com/success'
});</pre>
  </section>

  <section class="sf-scene" id="sf-10">
    <h2 class="sf-title">Start now with Stripe</h2>
    <div class="sf-proof-grid">
      <div>135+ currencies and payment methods supported</div>
      <div>US$1.9tn in payments volume processed in 2025</div>
      <div>200M+ active subscriptions managed on Stripe Billing</div>
      <div>50% of Fortune 100 companies have used Stripe</div>
    </div>
  </section>
</div>`;

function cut(tl, from, to, at) {
  tl.to(from, { autoAlpha: 0, duration: 0.4 }, at);
  tl.to(to, { autoAlpha: 1, duration: 0.55 }, at + 0.18);
}

export function buildTimeline() {
  gsap.set('.sf-scene', { autoAlpha: 0 });
  gsap.set('#sf-1', { autoAlpha: 1 });
  gsap.set('.sf-title', { autoAlpha: 0, y: 12 });
  gsap.set('.sf-ok, .sf-chip, .sf-proof-grid div', { autoAlpha: 0, y: 10 });

  const n1 = { v: 0 };
  const n2 = { v: 0 };

  const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });

  tl.to('#sf-1 .sf-title', { autoAlpha: 1, y: 0, duration: 0.6 })
    .to('.sf-rail', { width: '82%', duration: 1.2, ease: 'expo.out' })
    .to({}, { duration: 0.8 });

  cut(tl, '#sf-1', '#sf-2', '+=0.1');
  tl.to('#sf-2 .sf-title', { autoAlpha: 1, y: 0, duration: 0.5 })
    .from('.sf-node', { autoAlpha: 0, scale: 0.7, y: 20, stagger: 0.08, duration: 0.4 }, '-=0.1')
    .from('.sf-hub', { autoAlpha: 0, scale: 0.6, duration: 0.5 }, '-=0.2')
    .to({}, { duration: 0.7 });

  cut(tl, '#sf-2', '#sf-3', '+=0.1');
  tl.to('#sf-3 .sf-title', { autoAlpha: 1, y: 0, duration: 0.5 })
    .from('.sf-card', { autoAlpha: 0, y: 18, duration: 0.6 })
    .to('.sf-ok', { autoAlpha: 1, y: 0, duration: 0.35 }, '+=0.6')
    .to({}, { duration: 0.6 });

  cut(tl, '#sf-3', '#sf-4', '+=0.1');
  tl.to('#sf-4 .sf-title', { autoAlpha: 1, y: 0, duration: 0.5 })
    .from('.sf-ring', { autoAlpha: 0, scale: 0.8, duration: 0.6 })
    .to('.sf-ring', { rotation: 140, duration: 1.2, ease: 'none' })
    .to('#sf-4 .sf-chip', { autoAlpha: 1, y: 0, duration: 0.35 }, '-=0.8');

  cut(tl, '#sf-4', '#sf-5', '+=0.1');
  tl.to('#sf-5 .sf-title', { autoAlpha: 1, y: 0, duration: 0.5 })
    .from('.sf-platform', { autoAlpha: 0, scale: 0.8, duration: 0.45 })
    .from('.sf-leaf', { autoAlpha: 0, scale: 0.8, stagger: 0.08, duration: 0.35 }, '-=0.2')
    .to('#sf-5 .sf-chip', { autoAlpha: 1, y: 0, duration: 0.35 }, '+=0.3');

  cut(tl, '#sf-5', '#sf-6', '+=0.1');
  tl.to('#sf-6 .sf-title', { autoAlpha: 1, y: 0, duration: 0.5 })
    .from('.sf-radar', { autoAlpha: 0, duration: 0.5 })
    .to('.sf-scan', { rotation: 360, transformOrigin: '50% 100%', duration: 1.2, ease: 'none' })
    .to('.risk', { background: '#ff627f', scale: 1.35, yoyo: true, repeat: 1, duration: 0.25 }, '-=0.7');

  cut(tl, '#sf-6', '#sf-7', '+=0.1');
  tl.to('#sf-7 .sf-title', { autoAlpha: 1, y: 0, duration: 0.5 })
    .from('.sf-metrics', { autoAlpha: 0, y: 18, duration: 0.45 })
    .to(n1, { v: 1.9, duration: 1.0, onUpdate: () => { document.getElementById('sf-v1').textContent = `${n1.v.toFixed(1)}tn`; } })
    .to(n2, { v: 135, duration: 0.9, onUpdate: () => { document.getElementById('sf-v2').textContent = `${Math.round(n2.v)}+`; } }, '-=0.9');

  cut(tl, '#sf-7', '#sf-8', '+=0.1');
  tl.to('#sf-8 .sf-title', { autoAlpha: 1, y: 0, duration: 0.5 })
    .from('.sf-globe', { autoAlpha: 0, scale: 0.85, duration: 0.6 })
    .to('.sf-globe', { rotation: 120, duration: 1.3, ease: 'none' })
    .to('#sf-8 .sf-chip', { autoAlpha: 1, y: 0, duration: 0.35 }, '-=0.9');

  cut(tl, '#sf-8', '#sf-9', '+=0.1');
  tl.to('#sf-9 .sf-title', { autoAlpha: 1, y: 0, duration: 0.5 })
    .from('.sf-code', { autoAlpha: 0, y: 16, duration: 0.55 })
    .from('#sf-code', { clipPath: 'inset(0 100% 0 0)', duration: 1.0 }, '-=0.2');

  cut(tl, '#sf-9', '#sf-10', '+=0.1');
  tl.to('#sf-10 .sf-title', { autoAlpha: 1, y: 0, duration: 0.5 })
    .to('.sf-proof-grid div', { autoAlpha: 1, y: 0, stagger: 0.1, duration: 0.35 })
    .to({}, { duration: 2.2 });

  return tl;
}
