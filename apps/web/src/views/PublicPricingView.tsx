import { useClerk } from '@clerk/react'
import { useEffect, useState } from 'react'
import { LandingFooter } from '../components/LandingFooter'
import { LandingNav } from '../components/LandingNav'
import { LandingFaqAccordion } from '../components/landing/LandingFaqAccordion'
import { Seo } from '../components/Seo'
import '../styles/landing.css'
import '../styles/landing-broadcast.css'
import '../styles/public-pricing.css'

type BillingMode = 'monthly' | 'topup'
type PublicPlan = {
  name: string
  price: string
  cadence?: string
  eyebrow: string
  description: string
  features: string[]
  recommended?: boolean
  enterprise?: boolean
}

const monthlyPlans: PublicPlan[] = [
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

const topupPlans: PublicPlan[] = [
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
  const clerk = useClerk()
  const [mode, setMode] = useState<BillingMode>('monthly')
  const plans = mode === 'monthly' ? monthlyPlans : topupPlans

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key === 'g' || e.key === 'G') clerk.openSignIn()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [clerk])

  const startWithPlan = (plan: PublicPlan) => {
    if (plan.enterprise) {
      window.location.href = 'mailto:support@trypitch.co?subject=Pitch%20Enterprise'
      return
    }
    clerk.openSignUp()
  }

  return (
    <div className="lb-root public-pricing">
      <Seo
        title="Pricing | Pitch"
        description="Simple credit-based pricing for AI-generated product demo videos. Starter from $10/month, Pro at $40/month, and one-time top-ups from $12."
        path="/pricing"
      />
      <LandingNav />

      <main>
        <header className="public-pricing-hero">
          <h1>Pricing</h1>
          <div className="public-pricing-toggle" role="tablist" aria-label="Pricing type">
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'monthly'}
              onClick={() => setMode('monthly')}
            >
              Monthly
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'topup'}
              onClick={() => setMode('topup')}
            >
              One-time
            </button>
          </div>
        </header>

        <section className="public-pricing-plans" aria-label="Plans">
          <div className="public-pricing-section-head">
            <p>{mode === 'monthly' ? 'Monthly plans' : 'One-time top-ups'}</p>
            <span>3 credits create one complete AI demo video.</span>
          </div>
          <div className={`public-pricing-grid ${mode === 'topup' ? 'is-topup' : ''}`}>
            {plans.map(plan => (
              <article
                key={plan.name}
                className={`public-pricing-card ${plan.recommended ? 'is-recommended' : ''}`}
              >
                <div>
                  <div className="public-pricing-card-title">
                    <h2>{plan.name}</h2>
                    {plan.recommended && <span>Recommended</span>}
                  </div>
                  <p className="public-pricing-price">
                    {plan.price}
                    {plan.cadence && <small>{plan.cadence}</small>}
                  </p>
                  <p className="public-pricing-eyebrow">{plan.eyebrow}</p>
                  <p className="public-pricing-description">{plan.description}</p>
                </div>
                <ul>
                  {plan.features.map(feature => (
                    <li key={feature}>
                      <span aria-hidden="true">✓</span>
                      {feature}
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  className={plan.recommended ? 'is-primary' : ''}
                  onClick={() => startWithPlan(plan)}
                >
                  {plan.enterprise ? 'Contact us' : `Get ${plan.name}`}
                </button>
              </article>
            ))}
          </div>
          <p className="public-pricing-note">
            Secure payments. Credits never expire. Need a custom volume plan?{' '}
            <a href="mailto:support@trypitch.co">Talk to us</a>.
          </p>
        </section>

        <section className="public-pricing-faq" aria-labelledby="pricing-faq-heading">
          <div className="public-pricing-faq-title">
            <p>Good to know</p>
            <h2 id="pricing-faq-heading">Questions &amp; answers</h2>
          </div>
          <LandingFaqAccordion />
        </section>

        <section className="public-pricing-cta" aria-labelledby="pricing-cta-heading">
          <p>First render is on us</p>
          <h2 id="pricing-cta-heading">Turn your next product story into a film.</h2>
          <div>
            <button type="button" onClick={() => clerk.openSignUp()}>
              Get started
            </button>
            <a href="mailto:support@trypitch.co?subject=Pitch%20demo">Book a demo</a>
          </div>
        </section>
      </main>
      <LandingFooter />
    </div>
  )
}
