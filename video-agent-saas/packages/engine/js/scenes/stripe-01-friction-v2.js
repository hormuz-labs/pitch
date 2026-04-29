export const html = `
<div class="s1v2-root">
  <div class="s1v2-bg"></div>
  <div class="s1v2-grid"></div>
  <div class="s1v2-vignette"></div>

  <div class="s1v2-topline">Stripe India explainer</div>
  <h1 class="s1v2-title">Growth creates complexity</h1>
  <p class="s1v2-sub">Too many disconnected systems slow down every money movement decision.</p>

  <div class="s1v2-lanes">
    <div class="s1v2-lane lane-a"><span></span></div>
    <div class="s1v2-lane lane-b"><span></span></div>
    <div class="s1v2-lane lane-c"><span></span></div>
    <div class="s1v2-lane lane-d"><span></span></div>
    <div class="s1v2-core">
      <svg viewBox="0 0 80 80" aria-hidden="true">
        <circle cx="40" cy="40" r="34" class="ring"></circle>
        <path d="M24 43h32M40 27v32" class="cross"></path>
      </svg>
    </div>
  </div>

  <div class="s1v2-tags">
    <div>Payments</div>
    <div>Billing</div>
    <div>Payouts</div>
    <div>Risk</div>
  </div>
</div>`;

export function buildTimeline() {
  gsap.set(['.s1v2-title', '.s1v2-sub', '.s1v2-tags div', '.s1v2-topline'], { autoAlpha: 0, y: 16 });
  gsap.set('.s1v2-lane', { autoAlpha: 0, scaleX: 0.25, transformOrigin: 'left center' });
  gsap.set('.s1v2-core', { autoAlpha: 0, scale: 0.7 });

  const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });

  tl.to('.s1v2-topline', { autoAlpha: 1, y: 0, duration: 0.45 })
    .to('.s1v2-title', { autoAlpha: 1, y: 0, duration: 0.7 }, '-=0.2')
    .to('.s1v2-sub', { autoAlpha: 1, y: 0, duration: 0.55 }, '-=0.35')
    .to('.s1v2-lane', { autoAlpha: 1, scaleX: 1, stagger: 0.1, duration: 0.65, ease: 'expo.out' }, '-=0.25')
    .to('.s1v2-lane span', { xPercent: 88, stagger: 0.08, duration: 0.85, ease: 'power2.inOut' }, '-=0.4')
    .to('.s1v2-core', { autoAlpha: 1, scale: 1, duration: 0.6, ease: 'back.out(1.8)' }, '-=0.5')
    .to('.s1v2-tags div', { autoAlpha: 1, y: 0, stagger: 0.08, duration: 0.45 }, '-=0.2')
    .to('.s1v2-lane', { x: 180, duration: 0.85, ease: 'power3.in' }, '+=0.3')
    .to('.s1v2-vignette', { opacity: 0.88, duration: 0.5 }, '-=0.2')
    .to({}, { duration: 0.5 });

  return tl;
}
