import { ExternalLink } from 'lucide-solid'
import { createSignal, For, onMount, Show } from 'solid-js'
import { api, isApiError } from '../../../lib/api'
import {
  annualSavingsPercent,
  type Cadence,
  demoVideos,
  forCadence,
  formatCredits,
  PLANS,
  type Plan,
  pricePerCredit,
} from '../../../lib/plans'
import { useAuth } from '../../core/auth'

interface Summary {
  balance: number
  activeSubscription: null | {
    planKey: string
    creditsPerCycle: number
    currentPeriodEnd?: string
  }
}

export function PlansSection() {
  const { getToken } = useAuth()
  const [summary, setSummary] = createSignal<Summary | null>(null)
  const [loading, setLoading] = createSignal(true)
  const [cadence, setCadence] = createSignal<Cadence>('monthly')
  const [checkoutKey, setCheckoutKey] = createSignal('')
  const [portalLoading, setPortalLoading] = createSignal(false)
  const [error, setError] = createSignal('')

  onMount(async () => {
    try {
      const token = await getToken()
      if (!token) return
      setSummary(await api.get<Summary>('/credits', token))
    } finally {
      setLoading(false)
    }
  })

  const subscriptionPlans = PLANS.filter(
    plan => plan.kind === 'subscription' || plan.kind === 'contact',
  )
  const activeKey = () => summary()?.activeSubscription?.planKey ?? ''
  const isCurrentPlan = (plan: Plan) => activeKey() === plan.key || activeKey() === plan.annual?.key
  const isRecommendedPlan = (plan: Plan) => !activeKey() && !!plan.popular

  const openPortal = async () => {
    const portal = window.open('', '_blank')
    if (portal) portal.opener = null
    setPortalLoading(true)
    setError('')
    try {
      const token = await getToken()
      if (!token) return
      const { url } = await api.get<{ url: string }>('/checkout/billing-portal', token)
      if (portal) portal.location.assign(url)
      else window.location.assign(url)
    } catch (err) {
      portal?.close()
      setError(
        isApiError(err) && err.status === 404
          ? 'No billing history yet.'
          : 'Could not open the billing portal.',
      )
    } finally {
      setPortalLoading(false)
    }
  }

  const subscribe = async (plan: Plan) => {
    const view = forCadence(plan, cadence())
    if (!view) return
    setCheckoutKey(view.key)
    setError('')
    try {
      const token = await getToken()
      if (!token) return
      const { url } = await api.post<{ url: string }>('/checkout', token, { pack: view.key })
      window.location.assign(url)
    } catch (err) {
      setError(isApiError(err) ? err.message : 'Checkout failed')
      setCheckoutKey('')
    }
  }

  return (
    <>
      <section class="settings-card">
        <p class="settings-eyebrow">Current plan</p>
        <Show
          when={!loading()}
          fallback={<strong class="settings-current-plan__value">Loading…</strong>}
        >
          <Show
            when={summary()?.activeSubscription}
            fallback={
              <>
                <strong class="settings-current-plan__value">No active plan</strong>
                <small>
                  You can still use existing credits (including referral rewards). Choose a plan
                  whenever you are ready.
                </small>
              </>
            }
          >
            {sub => (
              <>
                <strong class="settings-current-plan__value">
                  {(
                    PLANS.find(
                      plan => plan.key === sub().planKey || plan.annual?.key === sub().planKey,
                    )?.name ?? sub().planKey
                  ).toUpperCase()}
                </strong>
                <small>{formatCredits(sub().creditsPerCycle)} credits per billing cycle</small>
              </>
            )}
          </Show>
        </Show>
      </section>

      <section class="settings-card settings-billing-portal">
        <div>
          <strong>{activeKey() ? 'Manage subscription' : 'Billing portal'}</strong>
          <small>
            {activeKey()
              ? `Change or cancel your plan in the secure billing portal${summary()?.activeSubscription?.currentPeriodEnd ? `. Plan features continue through ${new Date(summary()!.activeSubscription!.currentPeriodEnd!).toLocaleDateString()}` : ''}. Remaining credits stay in your balance until used.`
              : 'View invoices and manage payment methods from previous purchases.'}
          </small>
        </div>
        <button
          type="button"
          class={
            activeKey() ? 'settings-secondary settings-manage-subscription' : 'settings-secondary'
          }
          disabled={portalLoading()}
          onClick={() => void openPortal()}
        >
          <ExternalLink size={14} />
          {activeKey() ? 'Manage or cancel subscription' : 'Open billing portal'}
        </button>
      </section>

      <Show when={error()}>
        <p class="settings-field__error">{error()}</p>
      </Show>

      <div class="settings-plans-header">
        <span>Plans</span>
        <div class="settings-billing-cycle" role="tablist">
          <button
            type="button"
            class={cadence() === 'monthly' ? 'is-active' : ''}
            onClick={() => setCadence('monthly')}
          >
            Monthly
          </button>
          <button
            type="button"
            class={cadence() === 'annual' ? 'is-active' : ''}
            onClick={() => setCadence('annual')}
          >
            Annual <span>20% OFF</span>
          </button>
        </div>
      </div>

      <div class="settings-plans">
        <For each={subscriptionPlans}>
          {plan => {
            const view = () => forCadence(plan, cadence())
            const savings = annualSavingsPercent(plan)
            return (
              <article
                class={`settings-card ${isCurrentPlan(plan) ? 'is-current' : isRecommendedPlan(plan) ? 'is-popular' : ''}`}
              >
                <div class="settings-plan-name">
                  {plan.name}
                  <Show when={isCurrentPlan(plan) || isRecommendedPlan(plan)}>
                    <em>{isCurrentPlan(plan) ? 'Current plan' : 'Most popular'}</em>
                  </Show>
                </div>
                <Show
                  when={plan.kind !== 'contact'}
                  fallback={<div class="settings-price">Custom</div>}
                >
                  <div class="settings-price">
                    ${view()?.priceUsd}
                    <small>{cadence() === 'annual' ? '/yr' : '/mo'}</small>
                  </div>
                  <Show when={cadence() === 'annual' && savings !== null}>
                    <span class="settings-plan-saving">Save {savings}% vs. monthly</span>
                  </Show>
                </Show>
                <p>{plan.description}</p>
                <Show
                  when={plan.kind === 'contact'}
                  fallback={
                    <button
                      type="button"
                      disabled={!view() || checkoutKey() === view()?.key || portalLoading()}
                      class={isCurrentPlan(plan) ? 'settings-plan-manage' : undefined}
                      onClick={() =>
                        isCurrentPlan(plan) ? void openPortal() : void subscribe(plan)
                      }
                    >
                      {isCurrentPlan(plan)
                        ? 'Manage or cancel'
                        : checkoutKey() === view()?.key
                          ? 'Redirecting…'
                          : `Choose ${plan.name}`}
                    </button>
                  }
                >
                  <a href="mailto:support@trypitch.co?subject=Pitch%20Enterprise">Contact sales</a>
                </Show>
                <Show when={view()?.credits}>
                  <span>
                    {formatCredits(view()?.credits ?? 0)} credits per{' '}
                    {cadence() === 'annual' ? 'year' : 'month'}
                  </span>
                </Show>
                <Show when={pricePerCredit(view() ?? plan)}>
                  {rate => <span>{rate()} / credit</span>}
                </Show>
                <Show when={demoVideos(view() ?? plan)}>
                  {count => <span>About {count()} demo videos</span>}
                </Show>
              </article>
            )
          }}
        </For>
      </div>

      <p class="settings-note">
        Flex is a one-time purchase, no subscription required — see Buy credits. Pro and Max include
        credits for the billing period and auto-renew until cancelled. All purchases are final.
      </p>
    </>
  )
}
