import { createResource, createSignal, For, Show } from 'solid-js'
import pCoinIcon from '../../../assets/pCoin.svg'
import { api, isApiError } from '../../../lib/api'
import { formatCredits, PLANS, type Plan, pricePerCredit } from '../../../lib/plans'
import { useAuth } from '../../core/auth'

interface Summary {
  balance: number
  activeSubscription: null | { planKey: string; currentPeriodEnd?: string }
  usage?: { credits: number }
}

export function BuyCreditsSection(props: { openUsage?: () => void }) {
  const { getToken } = useAuth()
  const [buying, setBuying] = createSignal(false)
  const [error, setError] = createSignal('')
  const [checkoutKey, setCheckoutKey] = createSignal('')

  const [summary] = createResource(async () => {
    const token = await getToken()
    if (!token) return null
    return api.get<Summary>('/credits', token)
  })

  const flex = PLANS.find(plan => plan.key === 'flex')!
  const upsells = PLANS.filter(plan => plan.kind === 'subscription' || plan.kind === 'contact')
  const activeKey = () => summary()?.activeSubscription?.planKey ?? ''
  const isCurrentPlan = (plan: Plan) => activeKey() === plan.key || activeKey() === plan.annual?.key
  const isRecommendedPlan = (plan: Plan) => !activeKey() && !!plan.popular
  // Checkout refuses Flex without a plan; say so here instead of after the click.
  const needsPlan = () => summary() !== undefined && !summary()?.activeSubscription

  const buyFlex = async () => {
    setBuying(true)
    setError('')
    try {
      const token = await getToken()
      if (!token) return
      const { url } = await api.post<{ url: string }>('/checkout', token, { topup: 'flex' })
      window.location.assign(url)
    } catch (err) {
      setError(isApiError(err) ? err.message : 'Checkout failed')
      setBuying(false)
    }
  }

  const subscribe = async (plan: Plan) => {
    setCheckoutKey(plan.key)
    setError('')
    try {
      const token = await getToken()
      if (!token) return
      const { url } = await api.post<{ url: string }>('/checkout', token, { pack: plan.key })
      window.location.assign(url)
    } catch (err) {
      setError(isApiError(err) ? err.message : 'Checkout failed')
      setCheckoutKey('')
    }
  }

  return (
    <>
      <section class="settings-card settings-credit-purchase">
        <div class="settings-credit-purchase__header">
          <div class="settings-balance">
            <img src={pCoinIcon} alt="" />
            <div>
              <span>Available credits</span>
              <strong>{summary()?.balance ?? 0}</strong>
            </div>
          </div>
          <small>{summary()?.activeSubscription?.planKey.toUpperCase() ?? 'No plan'}</small>
        </div>
        <div class="settings-credit-meta">
          <span>Usage to date: {summary()?.usage?.credits ?? 0}</span>
          <span>
            Next reset:{' '}
            {summary()?.activeSubscription?.currentPeriodEnd
              ? new Date(summary()!.activeSubscription!.currentPeriodEnd!).toLocaleDateString()
              : 'N/A'}
          </span>
        </div>
        <div class="settings-buy-heading">Buy more credits</div>
        <div class="settings-buy-row">
          <div>
            <span class="settings-buy-row__amount">
              <strong>{formatCredits(flex.credits ?? 0)} credits</strong>
              <b>${flex.priceUsd}</b>
            </span>
            <span>
              {flex.name} one-time purchase · {pricePerCredit(flex)} per credit
            </span>
          </div>
          <button
            type="button"
            disabled={buying() || needsPlan()}
            title={needsPlan() ? 'Flex needs an active Pro or Max plan' : undefined}
            onClick={() => void buyFlex()}
          >
            {buying() ? 'Redirecting…' : 'Buy credits'}
          </button>
        </div>
        <div class="settings-buy-detail">
          <strong>One-time payment of ${flex.priceUsd}</strong>
          <span>
            {needsPlan()
              ? 'Flex is an add-on for Pro and Max. Choose a plan below to buy extra credits.'
              : `${formatCredits(flex.credits ?? 0)} credits are added immediately after checkout.`}
          </span>
        </div>
        <small class="settings-purchase-final">All purchases are final.</small>
      </section>

      <Show when={error()}>
        <p class="settings-field__error">{error()}</p>
      </Show>

      <section class="settings-card settings-credit-usage-card">
        <div class="settings-credit-usage-card__header">
          <div>
            <span>Credit usage</span>
            <small>Day-by-day usage and exact charges.</small>
          </div>
          <Show when={props.openUsage}>
            <button type="button" class="settings-secondary" onClick={props.openUsage}>
              Open usage
            </button>
          </Show>
        </div>
        <div class="settings-credit-usage-row">
          <strong>This period</strong>
          <span>{summary()?.usage?.credits ?? 0} used</span>
          <i
            style={{
              width: `${Math.min(100, ((summary()?.usage?.credits ?? 0) / Math.max(1, summary()?.balance ?? 0)) * 100)}%`,
            }}
          />
        </div>
        <div class="settings-credit-stats">
          <div>
            <span>Available</span>
            <strong>{summary()?.balance ?? 0}</strong>
          </div>
          <div>
            <span>Next reset</span>
            <strong>
              {summary()?.activeSubscription?.currentPeriodEnd
                ? new Date(summary()!.activeSubscription!.currentPeriodEnd!).toLocaleDateString()
                : 'N/A'}
            </strong>
          </div>
        </div>
      </section>

      <div class="settings-subscriptions-heading">
        <span>Subscription options</span>
        <small>Pro and Max include monthly credits.</small>
      </div>
      <div class="settings-plans">
        <For each={upsells}>
          {plan => (
            <article
              class={`settings-card ${isCurrentPlan(plan) ? 'is-current' : isRecommendedPlan(plan) ? 'is-popular' : ''}`}
            >
              <div class="settings-plan-name">
                {plan.name}
                <Show when={isCurrentPlan(plan) || isRecommendedPlan(plan)}>
                  <em>{isCurrentPlan(plan) ? 'Current plan' : 'Most popular'}</em>
                </Show>
              </div>
              <div class="settings-price">
                {plan.priceUsd === null ? 'Custom' : `$${plan.priceUsd}`}
                <Show when={plan.priceUsd !== null}>
                  <small>/mo</small>
                </Show>
              </div>
              <p>{plan.description}</p>
              <Show
                when={plan.kind === 'contact'}
                fallback={
                  <button
                    type="button"
                    disabled={checkoutKey() === plan.key || activeKey() === plan.key}
                    onClick={() => void subscribe(plan)}
                  >
                    {activeKey() === plan.key
                      ? 'Current plan'
                      : checkoutKey() === plan.key
                        ? 'Redirecting…'
                        : `Choose ${plan.name}`}
                  </button>
                }
              >
                <a href="mailto:support@trypitch.co?subject=Pitch%20Enterprise">Contact sales</a>
              </Show>
              <Show when={plan.credits}>
                <span>{formatCredits(plan.credits ?? 0)} credits per month</span>
              </Show>
            </article>
          )}
        </For>
      </div>
    </>
  )
}
