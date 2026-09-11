import { createSignal, For, onCleanup, onMount, Show } from 'solid-js'
import { demoVideos, PLANS, type Plan, pricePerCredit } from '../../lib/plans'
import { useClerk } from '../core/auth'
import { Seo } from '../core/Seo'
import { LandingFaqAccordion } from './LandingFaqAccordion'
import { LandingFooter } from './LandingFooter'
import { LandingNav } from './LandingNav'
import '../../styles/landing.css'
import '../../styles/landing-broadcast.css'
import '../../styles/public-pricing.css'

const eyebrows: Record<Plan['key'], string> = {
  flex: 'For occasional videos',
  pro: 'For regular launches',
  max: 'For teams publishing often',
  enterprise: 'For teams at scale',
}
export const PublicPricingView = () => {
  const clerk = useClerk(),
    [mode, setMode] = createSignal<'monthly' | 'topup'>('monthly')
  const key = (e: KeyboardEvent) => {
    if (e.key.toLowerCase() === 'g') clerk.openSignIn()
  }
  onMount(() => window.addEventListener('keydown', key))
  onCleanup(() => window.removeEventListener('keydown', key))
  const shown = () =>
    PLANS.filter(plan => (mode() === 'topup' ? plan.kind === 'topup' : plan.kind !== 'topup'))
  const start = (p: Plan) => {
    if (p.kind === 'contact') {
      location.href = 'mailto:support@trypitch.co?subject=Pitch%20Enterprise'
      return
    }
    clerk.openSignUp()
  }
  return (
    <div class="lb-root public-pricing">
      <Seo
        title="Pricing | Pitch"
        description="Simple credit-based pricing for AI-generated product demo videos."
        path="/pricing"
      />
      <LandingNav />
      <main>
        <header class="public-pricing-hero">
          <h1>Pricing</h1>
          <div class="public-pricing-toggle" role="tablist">
            <button aria-selected={mode() === 'monthly'} onClick={() => setMode('monthly')}>
              Monthly
            </button>
            <button aria-selected={mode() === 'topup'} onClick={() => setMode('topup')}>
              One-time
            </button>
          </div>
        </header>
        <section class="public-pricing-plans">
          <div class="public-pricing-section-head">
            <p>{mode() === 'monthly' ? 'Monthly plans' : 'One-time credits'}</p>
            <span>About 120 credits make one complete AI demo video.</span>
          </div>
          <div class={`public-pricing-grid ${mode() === 'topup' ? 'is-topup' : ''}`}>
            <For each={shown()}>
              {p => (
                <article class={`public-pricing-card ${p.popular ? 'is-recommended' : ''}`}>
                  <div>
                    <div class="public-pricing-card-title">
                      <h2>{p.name}</h2>
                      {p.popular && <span>Recommended</span>}
                    </div>
                    <p class="public-pricing-price">
                      {p.priceUsd === null ? 'Custom' : `$${p.priceUsd}`}
                      <small>
                        {p.kind === 'subscription'
                          ? '/month'
                          : p.kind === 'topup'
                            ? 'one time'
                            : ''}
                      </small>
                    </p>
                    <p class="public-pricing-eyebrow">{eyebrows[p.key]}</p>
                    <p class="public-pricing-description">{p.description}</p>
                  </div>
                  <ul>
                    <Show when={pricePerCredit(p)}>
                      {rate => (
                        <li>
                          <span>✓</span>
                          {rate()} per credit
                        </li>
                      )}
                    </Show>
                    <Show when={demoVideos(p)}>
                      {count => (
                        <li>
                          <span>✓</span>
                          About {count()} demo videos
                        </li>
                      )}
                    </Show>
                    <For each={p.features}>
                      {f => (
                        <li>
                          <span>✓</span>
                          {f}
                        </li>
                      )}
                    </For>
                  </ul>
                  <button class={p.popular ? 'is-primary' : ''} onClick={() => start(p)}>
                    {p.kind === 'contact' ? 'Contact us' : `Get ${p.name}`}
                  </button>
                </article>
              )}
            </For>
          </div>
          <p class="public-pricing-note">
            Secure payments. Credits you buy are yours to keep; monthly plan credits are forfeited
            when the plan ends. <a href="mailto:support@trypitch.co">Talk to us</a>.
          </p>
        </section>
        <section class="public-pricing-faq">
          <div class="public-pricing-faq-title">
            <p>Good to know</p>
            <h2>Questions &amp; answers</h2>
          </div>
          <LandingFaqAccordion />
        </section>
        <section class="public-pricing-cta">
          <p>Choose the credits you need</p>
          <h2>Turn your next product story into a film.</h2>
          <div>
            <button onClick={() => clerk.openSignUp()}>Get started</button>
            <a href="mailto:support@trypitch.co?subject=Pitch%20demo">Book a demo</a>
          </div>
        </section>
      </main>
      <LandingFooter />
    </div>
  )
}
