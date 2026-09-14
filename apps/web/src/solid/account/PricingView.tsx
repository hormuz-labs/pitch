import { createSignal, For, onMount, Show } from 'solid-js'
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
import { useAuth } from '../core/auth'
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

export function PricingView() {
  const { getToken } = useAuth()
  const [cadence, setCadence] = createSignal<Cadence>('monthly')
  const [loading, setLoading] = createSignal('')
  const [error, setError] = createSignal('')
  const [active, setActive] = createSignal('')
  const subscriptionPlans = PLANS.filter(plan => plan.kind !== 'topup')
  const topup = PLANS.find(plan => plan.kind === 'topup')!

  onMount(async () => {
    try {
      const token = await getToken()
      if (!token) return
      const response = await fetch(`${API_URL}/credits`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (response.ok) setActive((await response.json()).activeSubscription?.planKey ?? '')
    } catch {
      // Account status is non-blocking; checkout still works.
    }
  })

  const checkout = async (plan: Plan) => {
    if (plan.kind === 'free') return
    if (plan.kind === 'contact') {
      location.href = 'mailto:support@trypitch.co?subject=Pitch%20Enterprise'
      return
    }
    const view = plan.kind === 'subscription' ? forCadence(plan, cadence()) : null
    const checkoutKey = view?.key ?? plan.key
    setLoading(checkoutKey)
    setError('')
    try {
      const token = await getToken()
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

  return (
    <div class="lb-root public-pricing account-pricing">
      <main>
        <header class="public-pricing-hero">
          <h1>Pricing</h1>
          <p class="account-pricing-intro">
            One shared credit balance across every model, edit, render, and export.
          </p>
          <span class="account-pricing-status">
            Current plan: {active() ? active().replace('_annual', '') : 'Free'}
          </span>
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
            <span>Use credits across Luna, Terra, GPT-5.5, Sol, and Astra.</span>
          </div>
          <div class="public-pricing-grid">
            <For each={subscriptionPlans}>
              {plan => {
                const view = () =>
                  plan.kind === 'subscription' ? forCadence(plan, cadence()) : null
                const key = () => view()?.key ?? plan.key
                return (
                  <article
                    class={`public-pricing-card is-${plan.key} ${active() === key() || (plan.popular && !active()) ? 'is-recommended' : ''}`}
                  >
                    <div>
                      <div class="public-pricing-card-title">
                        <h2>{plan.name}</h2>
                        <Show
                          when={active() === key()}
                          fallback={plan.popular && !active() && <span>Recommended</span>}
                        >
                          <span>Current plan</span>
                        </Show>
                      </div>
                      <p class="public-pricing-price">
                        {plan.priceUsd === null
                          ? 'Custom'
                          : `$${view()?.priceUsd ?? plan.priceUsd}`}
                        <small>
                          {plan.kind === 'free'
                            ? '/month'
                            : plan.kind === 'subscription'
                              ? cadence() === 'annual'
                                ? '/year'
                                : '/month'
                              : plan.kind === 'topup'
                                ? 'one time'
                                : ''}
                        </small>
                      </p>
                      <p class="public-pricing-eyebrow">{eyebrows[plan.key]}</p>
                      <p class="public-pricing-description">{plan.description}</p>
                    </div>
                    <p class="public-pricing-includes">{planIncludesLabel(plan)}</p>
                    <ul>
                      <Show when={pricePerCredit(view() ?? plan)}>
                        {rate => (
                          <li>
                            <span>✓</span>
                            {rate()} per credit
                          </li>
                        )}
                      </Show>
                      <Show when={demoVideos(view() ?? plan)}>
                        {count => (
                          <li>
                            <span>✓</span>About {count()} standard demos
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
                      <For each={nonCreditFeatures(plan)}>
                        {feature => (
                          <li>
                            <span>✓</span>
                            {feature}
                          </li>
                        )}
                      </For>
                    </ul>
                    <button
                      class={plan.popular ? 'is-primary' : ''}
                      disabled={
                        !!loading() || active() === key() || (!active() && plan.kind === 'free')
                      }
                      onClick={() => void checkout(plan)}
                    >
                      {!active() && plan.kind === 'free'
                        ? 'Current plan'
                        : active() === key()
                          ? 'Current plan'
                          : loading() === key()
                            ? 'Redirecting...'
                            : plan.kind === 'free'
                              ? 'Free'
                              : plan.kind === 'contact'
                                ? 'Contact us'
                                : `Get ${plan.name}`}
                    </button>
                  </article>
                )
              }}
            </For>
          </div>
          <p class="public-pricing-note">
            Purchased credits do not expire. Monthly credits are available while your plan is
            active.
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
            Top up your shared balance whenever you need more. Requires an active Pro or Max plan.
          </p>
          <button disabled={!active() || !!loading()} onClick={() => void checkout(topup)}>
            {!active()
              ? 'Available on paid plans'
              : loading() === topup.key
                ? 'Redirecting...'
                : 'Buy credits'}
          </button>
        </section>
        <section class="public-pricing-usage">
          <div class="public-pricing-usage-head">
            <div>
              <p>Model pricing</p>
              <h2>What your plan can make</h2>
            </div>
            <p>
              Lower-cost models stretch the same balance further. Sol and Astra include up to 30
              seconds; longer videos scale with duration.
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
            Counts are estimates. Actual metered work can vary with reasoning, tool use, and render
            time.
          </p>
        </section>
      </main>
    </div>
  )
}
