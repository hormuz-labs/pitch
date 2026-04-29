export const html = `
  <div class="stripe-root" id="scene-08-root">
    <div class="stripe-bg-gradient"></div>
    <div class="stripe-bg-grid"></div>
    <div class="stripe-bg-noise"></div>

    <div class="stripe-topline">Financial infrastructure for growth</div>

    <div class="stripe-scenes">
      <section class="stripe-scene" id="s1">
        <h1 class="stripe-head">Growth creates complexity</h1>
        <div class="stripe-rail" id="hero-rail"></div>
      </section>

      <section class="stripe-scene" id="s2">
        <h2 class="stripe-head">One platform for money</h2>
        <div class="node-wrap">
          <div class="node">Cards</div>
          <div class="node">Wallets</div>
          <div class="node">Banks</div>
          <div class="node">UPI</div>
          <div class="hub">Stripe</div>
        </div>
      </section>

      <section class="stripe-scene" id="s3">
        <h2 class="stripe-head">Accept payments everywhere</h2>
        <div class="card checkout-card">
          <div class="card-title">Checkout</div>
          <div class="field"></div>
          <div class="field"></div>
          <div class="pay-btn">Pay now</div>
          <div class="success" id="checkout-success">Payment successful</div>
        </div>
      </section>

      <section class="stripe-scene" id="s4">
        <h2 class="stripe-head">Automate recurring revenue</h2>
        <div class="loop-ring">
          <div class="pulse p1"></div>
          <div class="pulse p2"></div>
          <div class="pulse p3"></div>
        </div>
      </section>

      <section class="stripe-scene" id="s5">
        <h2 class="stripe-head">Scale payouts seamlessly</h2>
        <div class="payout-hub">
          <div class="center">Platform</div>
          <div class="leaf l1">Seller A</div>
          <div class="leaf l2">Seller B</div>
          <div class="leaf l3">Seller C</div>
          <div class="leaf l4">Seller D</div>
        </div>
      </section>

      <section class="stripe-scene" id="s6">
        <h2 class="stripe-head">Smarter fraud decisions</h2>
        <div class="radar">
          <div class="scan"></div>
          <div class="dot d1"></div>
          <div class="dot d2 risk"></div>
          <div class="dot d3"></div>
          <div class="dot d4 risk"></div>
        </div>
      </section>

      <section class="stripe-scene" id="s7">
        <h2 class="stripe-head">Real-time performance visibility</h2>
        <div class="metrics">
          <div class="metric">
            <div class="metric-value" id="m-volume">0</div>
            <div class="metric-label">US$ tn processed</div>
          </div>
          <div class="metric">
            <div class="metric-value" id="m-subs">0</div>
            <div class="metric-label">Active subscriptions</div>
          </div>
        </div>
      </section>

      <section class="stripe-scene" id="s8">
        <h2 class="stripe-head">Reliable global infrastructure</h2>
        <div class="globe-wrap">
          <div class="globe"></div>
          <div class="beam b1"></div>
          <div class="beam b2"></div>
          <div class="beam b3"></div>
        </div>
        <div class="uptime">99.999% historical uptime</div>
      </section>

      <section class="stripe-scene" id="s9">
        <h2 class="stripe-head">APIs built for speed</h2>
        <div class="code-card">
          <pre id="code-block">const session = await stripe.checkout.sessions.create({
  mode: 'payment',
  line_items: [{ price: 'price_xxx', quantity: 1 }],
  success_url: 'https://example.com/success'
});</pre>
        </div>
      </section>

      <section class="stripe-scene" id="s10">
        <h2 class="stripe-head final">Start now with Stripe</h2>
        <div class="proof-grid">
          <div class="proof">135+ currencies and payment methods</div>
          <div class="proof">US$1.9tn processed in 2025</div>
          <div class="proof">200M+ subscriptions on Billing</div>
          <div class="proof">50% of Fortune 100 used Stripe</div>
        </div>
      </section>
    </div>
  </div>
`;

function setInitialState() {
  gsap.set('.stripe-scene', { autoAlpha: 0 });
  gsap.set('#s1', { autoAlpha: 1 });
  gsap.set('.node', { scale: 0.7, autoAlpha: 0, y: 40 });
  gsap.set('.hub', { scale: 0.6, autoAlpha: 0 });
  gsap.set('.checkout-card', { y: 30, autoAlpha: 0 });
  gsap.set('#checkout-success', { autoAlpha: 0, y: 10 });
  gsap.set('.loop-ring', { scale: 0.8, autoAlpha: 0 });
  gsap.set('.pulse', { scale: 0.6, autoAlpha: 0 });
  gsap.set('.payout-hub .center', { scale: 0.7, autoAlpha: 0 });
  gsap.set('.leaf', { autoAlpha: 0, x: -20 });
  gsap.set('.radar', { autoAlpha: 0, scale: 0.9 });
  gsap.set('.dot', { autoAlpha: 0 });
  gsap.set('.metrics', { autoAlpha: 0, y: 20 });
  gsap.set('.globe-wrap, .uptime', { autoAlpha: 0 });
  gsap.set('.code-card', { autoAlpha: 0, y: 20 });
  gsap.set('.proof', { autoAlpha: 0, y: 16 });
}

function switchScene(tl, current, next, at) {
  tl.to(current, { autoAlpha: 0, duration: 0.5 }, at);
  tl.to(next, { autoAlpha: 1, duration: 0.6 }, at + 0.2);
}

export function buildTimeline() {
  setInitialState();

  const volume = { value: 0 };
  const subs = { value: 0 };

  const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });

  tl.to('#hero-rail', { width: '86%', duration: 2.2, ease: 'expo.out' })
    .to('#hero-rail', { opacity: 0.5, duration: 0.8 }, '+=0.4');

  switchScene(tl, '#s1', '#s2', '+=0.2');
  tl.to('.hub', { autoAlpha: 1, scale: 1, duration: 0.7 })
    .to('.node', { autoAlpha: 1, y: 0, scale: 1, stagger: 0.08, duration: 0.5 }, '-=0.2')
    .to('.node-wrap', { scale: 1.03, duration: 1.0, yoyo: true, repeat: 1 }, '+=0.3');

  switchScene(tl, '#s2', '#s3', '+=0.1');
  tl.to('.checkout-card', { autoAlpha: 1, y: 0, duration: 0.7 })
    .to('#checkout-success', { autoAlpha: 1, y: 0, duration: 0.5 }, '+=0.8');

  switchScene(tl, '#s3', '#s4', '+=0.2');
  tl.to('.loop-ring', { autoAlpha: 1, scale: 1, duration: 0.8 })
    .to('.pulse', { autoAlpha: 1, scale: 1.2, stagger: 0.2, duration: 0.8 }, '-=0.3')
    .to('.pulse', { scale: 0.95, duration: 0.6, yoyo: true, repeat: 1 });

  switchScene(tl, '#s4', '#s5', '+=0.1');
  tl.to('.payout-hub .center', { autoAlpha: 1, scale: 1, duration: 0.6 })
    .to('.leaf', { autoAlpha: 1, x: 0, stagger: 0.12, duration: 0.5 }, '-=0.2')
    .to('.leaf', { x: '+=8', stagger: 0.08, duration: 0.25, yoyo: true, repeat: 1 }, '+=0.4');

  switchScene(tl, '#s5', '#s6', '+=0.2');
  tl.to('.radar', { autoAlpha: 1, scale: 1, duration: 0.7 })
    .to('.dot', { autoAlpha: 1, stagger: 0.1, duration: 0.3 }, '-=0.4')
    .to('.scan', { rotation: 360, transformOrigin: '50% 100%', duration: 1.6, ease: 'none' })
    .to('.risk', { background: '#ff627f', scale: 1.4, duration: 0.4, yoyo: true, repeat: 1 }, '-=1.0');

  switchScene(tl, '#s6', '#s7', '+=0.1');
  tl.to('.metrics', { autoAlpha: 1, y: 0, duration: 0.6 })
    .to(volume, {
      value: 1.9,
      duration: 1.2,
      onUpdate: () => {
        document.getElementById('m-volume').textContent = `${volume.value.toFixed(1)}tn`;
      }
    })
    .to(subs, {
      value: 200,
      duration: 1.2,
      onUpdate: () => {
        document.getElementById('m-subs').textContent = `${Math.round(subs.value)}M+`;
      }
    }, '-=1.0');

  switchScene(tl, '#s7', '#s8', '+=0.2');
  tl.to('.globe-wrap', { autoAlpha: 1, duration: 0.7 })
    .to('.globe', { rotation: 360, duration: 4, ease: 'none' }, '-=0.2')
    .to('.beam', { autoAlpha: 1, stagger: 0.12, duration: 0.5 }, '-=3.4')
    .to('.uptime', { autoAlpha: 1, y: -4, duration: 0.5 }, '-=3.0');

  switchScene(tl, '#s8', '#s9', '+=0.2');
  tl.to('.code-card', { autoAlpha: 1, y: 0, duration: 0.7 })
    .from('#code-block', { clipPath: 'inset(0 100% 0 0)', duration: 1.2, ease: 'power2.out' }, '-=0.3');

  switchScene(tl, '#s9', '#s10', '+=0.2');
  tl.to('.proof', { autoAlpha: 1, y: 0, stagger: 0.14, duration: 0.5 })
    .to('#s10 .final', { scale: 1.03, duration: 0.8, yoyo: true, repeat: 1 }, '+=0.3')
    .to({}, { duration: 2.6 });

  return tl;
}
