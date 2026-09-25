import { createSignal, For, onCleanup, onMount, Show } from 'solid-js'
import { API_URL } from '../../config'
import {
  type Cadence,
  demoVideos,
  forCadence,
  generationsFor,
  MODEL_CREDIT_RATES,
  nonCreditFeatures,
  PLANS,
  type Plan,
  planIncludesLabel,
  pricePerCredit,
} from '../../lib/plans'
import { getRefCode } from '../../lib/referral'
import { useAuth, useClerk } from '../core/auth'
import { Seo } from '../core/Seo'
import { LandingFaqAccordion } from './LandingFaqAccordion'
import { LandingFooter } from './LandingFooter'
import { LandingNav } from './LandingNav'
import '../../styles/landing.css'
import '../../styles/landing-broadcast.css'
import '../../styles/public-pricing.css'

const eyebrows: Record<Plan['key'], string> = {
  free: 'Start exploring',
  flex: 'For occasional videos',
  pro: 'For regular launches',
  max: 'For teams publishing often',
  enterprise: 'For teams at scale',
}
/**
 * The one pricing page. Signed out it sits in the marketing chrome and every
 * button opens sign-up; signed in it sits in the app shell, marks the current
 * plan and goes straight to checkout. Plans, top-up, model table and FAQ are
 * the same either way.
 */
export const PublicPricingView = () => {
  const clerk = useClerk(),
    auth = useAuth(),
    signed = () => (typeof auth.isSignedIn === 'function' ? auth.isSignedIn() : auth.isSignedIn),
    [cadence, setCadence] = createSignal<Cadence>('monthly'),
    [loading, setLoading] = createSignal(''),
    [error, setError] = createSignal(''),
    [active, setActive] = createSignal('')
  const key = (e: KeyboardEvent) => {
    if (!signed() && e.key.toLowerCase() === 'g') clerk.openSignIn()
  }
  onMount(() => window.addEventListener('keydown', key))
  onCleanup(() => window.removeEventListener('keydown', key))
  onMount(async () => {
    if (!signed()) return
    try {
      const token = await auth.getToken()
      if (!token) return
      const response = await fetch(`${API_URL}/credits`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (response.ok) setActive((await response.json()).activeSubscription?.planKey ?? '')
    } catch {
      // Account status is non-blocking; checkout still works.
    }
  })
  const subscriptionPlans = PLANS.filter(plan => plan.kind !== 'topup')
  const topup = PLANS.find(plan => plan.kind === 'topup')!
  const keyFor = (plan: Plan) =>
    (plan.kind === 'subscription' ? forCadence(plan, cadence())?.key : null) ?? plan.key
  const isCurrent = (plan: Plan) =>
    signed() && (active() ? active() === keyFor(plan) : plan.kind === 'free')
  const start = async (plan: Plan) => {
    if (plan.kind === 'contact') {
      location.href = 'mailto:support@trypitch.co?subject=Pitch%20Enterprise'
      return
    }
    if (!signed()) {
      clerk.openSignUp()
      return
    }
    if (plan.kind === 'free') return
    const checkoutKey = keyFor(plan)
    setLoading(checkoutKey)
    setError('')
    try {
      const token = await auth.getToken()
      const response = await fetch(`${API_URL}/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(
          plan.kind === 'topup'
            ? { topup: plan.key, refCode: getRefCode() ?? undefined }
            : { pack: checkoutKey, refCode: getRefCode() ?? undefined },
        ),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Checkout failed')
      window.location.assign(data.url)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Checkout failed')
      setLoading('')
    }
  }
  const label = (plan: Plan) =>
    isCurrent(plan)
      ? 'Current plan'
      : loading() === keyFor(plan)
        ? 'Redirecting...'
        : plan.kind === 'free'
          ? signed()
            ? 'Free'
            : 'Start for free'
          : plan.kind === 'contact'
            ? 'Contact us'
            : `Get ${plan.name}`
  return (
    <div class={`lb-root public-pricing${signed() ? ' account-pricing' : ''}`}>
      <Seo
        title="Pricing: credit-based plans for AI video and decks | Pitch"
        description="Pay for the launch videos, product demos, slide decks and edits you actually make. Monthly credit plans, add-on top-ups, and no upfront charge per project."
        path="/pricing"
      />
      <Show when={!signed()}>
        <LandingNav />
      </Show>
      <main>
        <header class="public-pricing-hero">
          <h1>Pricing</h1>
          <Show when={signed()}>
            <p class="account-pricing-intro">
              One shared credit balance across every model, edit, render, and export.
            </p>
            <span class="account-pricing-status">
              Current plan: {active() ? active().replace('_annual', '') : 'Free'}
            </span>
          </Show>
          <div class="public-pricing-toggle" role="tablist">
            <button aria-selected={cadence() === 'monthly'} onClick={() => setCadence('monthly')}>
              Monthly
            </button>
            <button aria-selected={cadence() === 'annual'} onClick={() => setCadence('annual')}>
              Annual <span>Save 20%</span>
            </button>
          </div>
        </header>
        <Show when={error()}>
          <p class="account-pricing-error" role="alert">
            {error()}
          </p>
        </Show>
        <section class="public-pricing-plans">
          <div class="public-pricing-section-head">
            <p>{cadence() === 'monthly' ? 'Monthly plans' : 'Annual plans'}</p>
            <span>One shared balance. Each model has its own credit rate.</span>
          </div>
          <div class="public-pricing-grid">
            <For each={subscriptionPlans}>
              {p => {
                const view = () => (p.kind === 'subscription' ? forCadence(p, cadence()) : null)
                return (
                  <article
                    class={`public-pricing-card is-${p.key} ${(signed() && active() ? active() === keyFor(p) : p.popular) ? 'is-recommended' : ''}`}
                  >
                    <div>
                      <div class="public-pricing-card-title">
                        <h2>{p.name}</h2>
                        <Show
                          when={signed() && active() === keyFor(p)}
                          fallback={p.popular && !active() && <span>Recommended</span>}
                        >
                          <span>Current plan</span>
                        </Show>
                      </div>
                      <p class="public-pricing-price">
                        {p.priceUsd === null ? 'Custom' : `$${view()?.priceUsd ?? p.priceUsd}`}
                        <small>
                          {p.kind === 'free'
                            ? '/month'
                            : p.kind === 'subscription'
                              ? cadence() === 'annual'
                                ? '/year'
                                : '/month'
                              : p.kind === 'topup'
                                ? 'one time'
                                : ''}
                        </small>
                      </p>
                      <p class="public-pricing-eyebrow">{eyebrows[p.key]}</p>
                      <p class="public-pricing-description">{p.description}</p>
                    </div>
                    <p class="public-pricing-includes">{planIncludesLabel(p)}</p>
                    <ul>
                      <Show when={pricePerCredit(view() ?? p)}>
                        {rate => (
                          <li>
                            <span>✓</span>
                            {rate()} per credit
                          </li>
                        )}
                      </Show>
                      <Show when={demoVideos(view() ?? p)}>
                        {count => (
                          <li>
                            <span>✓</span>
                            About {count()} demo videos
                          </li>
                        )}
                      </Show>
                      <Show when={view()?.credits}>
                        {credits => (
                          <li>
                            <span>✓</span>
                            {credits().toLocaleString()} credits per{' '}
                            {cadence() === 'annual' ? 'year' : 'month'}
                          </li>
                        )}
                      </Show>
                      <For each={nonCreditFeatures(p)}>
                        {f => (
                          <li>
                            <span>✓</span>
                            {f}
                          </li>
                        )}
                      </For>
                    </ul>
                    <button
                      class={p.popular ? 'is-primary' : ''}
                      disabled={!!loading() || isCurrent(p)}
                      onClick={() => void start(p)}
                    >
                      {label(p)}
                    </button>
                  </article>
                )
              }}
            </For>
          </div>
          <p class="public-pricing-note">
            Secure payments. Credits remain yours until used, including after a subscription ends.{' '}
            <a href="mailto:support@trypitch.co">Talk to us</a>.
          </p>
        </section>
        <section class="public-pricing-topup">
          <div>
            <p>Add-on credits</p>
            <h2>{topup.name}</h2>
            <span>
              {topup.credits?.toLocaleString()} credits · ${topup.priceUsd} one time
            </span>
          </div>
          <p>
            Add credits whenever a project needs more runway. Available only with an active Pro or
            Max plan.
          </p>
          <Show
            when={signed()}
            fallback={<button onClick={() => clerk.openSignUp()}>Choose a paid plan</button>}
          >
            <button disabled={!active() || !!loading()} onClick={() => void start(topup)}>
              {!active()
                ? 'Available on paid plans'
                : loading() === topup.key
                  ? 'Redirecting...'
                  : 'Buy credits'}
            </button>
          </Show>
        </section>
        <section class="public-pricing-usage">
          <div class="public-pricing-usage-head">
            <div>
              <p>One balance, every model</p>
              <h2>What your credits can make</h2>
            </div>
            <p>
              Credits are shared across the studio. Pick a faster model for volume or spend more
              credits when the work needs deeper reasoning and higher-end generation.
            </p>
          </div>
          <div class="public-pricing-usage-table-wrap">
            <table class="public-pricing-usage-table">
              <thead>
                <tr>
                  <th>Model</th>
                  <th>Credit rate</th>
                  <th>Flex · 800</th>
                  <th>Pro · 2,500</th>
                  <th>Max · 5,000</th>
                </tr>
              </thead>
              <tbody>
                <For each={MODEL_CREDIT_RATES}>
                  {(rate, index) => (
                    <tr style={{ '--model-index': index() }}>
                      <th>
                        <span class="model-rate-identity">
                          <i aria-hidden="true">{rate.name.slice(0, 1)}</i>
                          <span>
                            <strong>{rate.name}</strong>
                            <small>{rate.detail}</small>
                          </span>
                        </span>
                      </th>
                      <td data-label="Credit rate">
                        <strong>{rate.credits.toLocaleString()}</strong>
                        <small>credits · {rate.unit}</small>
                      </td>
                      <td data-label="Flex">
                        <strong>{generationsFor(800, rate.credits)}</strong>
                        <small>videos</small>
                      </td>
                      <td class="is-pro" data-label="Pro">
                        <strong>{generationsFor(2500, rate.credits)}</strong>
                        <small>videos</small>
                      </td>
                      <td data-label="Max">
                        <strong>{generationsFor(5000, rate.credits)}</strong>
                        <small>videos</small>
                      </td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </div>
          <p class="public-pricing-note">
            Counts are estimates. Sol and Astra use a 30-second minimum and scale with selected
            duration. Actual metered work may cost more when provider or compute usage spikes.
          </p>
        </section>
        <section class="public-pricing-faq">
          <div class="public-pricing-faq-title">
            <p>Good to know</p>
            <h2>Questions &amp; answers</h2>
          </div>
          <LandingFaqAccordion />
        </section>
        <Show when={!signed()}>
          <section class="public-pricing-cta">
            <p>Choose the credits you need</p>
            <h2>Turn your next product story into a film.</h2>
            <div>
              <button onClick={() => clerk.openSignUp()}>Get started</button>
              <a href="mailto:support@trypitch.co?subject=Pitch%20demo">Book a demo</a>
            </div>
          </section>
        </Show>
      </main>
      <Show when={!signed()}>
        <LandingFooter />
      </Show>
    </div>
  )
}
