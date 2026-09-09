import { createSignal, For, onCleanup, onMount } from 'solid-js'
import { useClerk } from '../core/auth'
import { Seo } from '../core/Seo'
import { LandingFaqAccordion } from './LandingFaqAccordion'
import { LandingFooter } from './LandingFooter'
import { LandingNav } from './LandingNav'
import '../../styles/landing.css'
import '../../styles/landing-broadcast.css'
import '../../styles/public-pricing.css'

type Plan = {
  name: string
  price: string
  cadence?: string
  eyebrow: string
  description: string
  features: string[]
  recommended?: boolean
  enterprise?: boolean
}
const monthly: Plan[] = [
  {
    name: 'Starter',
    price: '$10',
    cadence: '/month',
    eyebrow: 'For first projects',
    description: 'A focused starting point for making polished product demos.',
    features: [
      '10 AI credits every month',
      '3 complete demo videos',
      'Up to 1080p exports',
      'Priority queue access',
    ],
  },
  {
    name: 'Pro',
    price: '$40',
    cadence: '/month',
    eyebrow: 'For regular launches',
    description: 'More room to create, refine, and publish without slowing down.',
    features: [
      '50 AI credits every month',
      '20% lower cost per credit',
      'Custom agent instructions',
      'Watermark-free exports',
    ],
    recommended: true,
  },
  {
    name: 'Enterprise',
    price: 'Custom',
    eyebrow: 'For teams at scale',
    description: 'Flexible volume, tailored agents, and support for larger teams.',
    features: [
      'Custom credit volume',
      'Volume pricing',
      'Custom agent fine-tuning',
      'Dedicated account manager',
    ],
    enterprise: true,
  },
]
const topups: Plan[] = [
  {
    name: '10 credits',
    price: '$12',
    cadence: 'one time',
    eyebrow: 'For a quick refill',
    description: 'Finish a launch or make a few more demos without a subscription change.',
    features: ['10 AI credits', 'Credits never expire', 'One-time payment', 'Up to 1080p exports'],
  },
  {
    name: '50 credits',
    price: '$45',
    cadence: 'one time',
    eyebrow: 'For a bigger production run',
    description: 'The best-value top-up when you have several videos ready to make.',
    features: [
      '50 AI credits',
      'Lower cost per credit',
      'Credits never expire',
      'Up to 1080p exports',
    ],
    recommended: true,
  },
]
export const PublicPricingView = () => {
  const clerk = useClerk(),
    [mode, setMode] = createSignal<'monthly' | 'topup'>('monthly')
  const key = (e: KeyboardEvent) => {
    if (e.key.toLowerCase() === 'g') clerk.openSignIn()
  }
  onMount(() => window.addEventListener('keydown', key))
  onCleanup(() => window.removeEventListener('keydown', key))
  const start = (p: Plan) => {
    if (p.enterprise) {
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
            <p>{mode() === 'monthly' ? 'Monthly plans' : 'One-time top-ups'}</p>
            <span>3 credits create one complete AI demo video.</span>
          </div>
          <div class={`public-pricing-grid ${mode() === 'topup' ? 'is-topup' : ''}`}>
            <For each={mode() === 'monthly' ? monthly : topups}>
              {p => (
                <article class={`public-pricing-card ${p.recommended ? 'is-recommended' : ''}`}>
                  <div>
                    <div class="public-pricing-card-title">
                      <h2>{p.name}</h2>
                      {p.recommended && <span>Recommended</span>}
                    </div>
                    <p class="public-pricing-price">
                      {p.price}
                      <small>{p.cadence}</small>
                    </p>
                    <p class="public-pricing-eyebrow">{p.eyebrow}</p>
                    <p class="public-pricing-description">{p.description}</p>
                  </div>
                  <ul>
                    <For each={p.features}>
                      {f => (
                        <li>
                          <span>✓</span>
                          {f}
                        </li>
                      )}
                    </For>
                  </ul>
                  <button class={p.recommended ? 'is-primary' : ''} onClick={() => start(p)}>
                    {p.enterprise ? 'Contact us' : `Get ${p.name}`}
                  </button>
                </article>
              )}
            </For>
          </div>
          <p class="public-pricing-note">
            Secure payments. Credits never expire.{' '}
            <a href="mailto:support@trypitch.co">Talk to us</a>.
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
          <p>First render is on us</p>
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
