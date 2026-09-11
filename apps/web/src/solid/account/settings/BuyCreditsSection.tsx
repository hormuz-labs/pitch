import { createResource, createSignal, For, Show } from 'solid-js'
import pCoinIcon from '../../../assets/pCoin.svg'
import { api, isApiError } from '../../../lib/api'
import { formatCredits, PLANS, type Plan, pricePerCredit } from '../../../lib/plans'
import { useAuth } from '../../core/auth'

interface Summary {
  balance: number
  activeSubscription: null | { planKey: string }
}

export function BuyCreditsSection() {
  const { getToken } = useAuth()
  const [buying, setBuying] = createSignal(false)
  const [error, setError] = createSignal('')
  const [checkoutKey, setCheckoutKey] = createSignal('')

  const [summary, { refetch }] = createResource(async () => {
    const token = await getToken()
    if (!token) return null
    return api.get<Summary>('/credits', token)
  })

  const flex = PLANS.find(plan => plan.key === 'flex')!
  const upsells = PLANS.filter(plan => plan.kind === 'subscription' || plan.kind === 'contact')
  const activeKey = () => summary()?.activeSubscription?.planKey ?? ''

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
      <section class="settings-card settings-balance">
        <img src={pCoinIcon} alt="" />
        <div>
          <span>Available credits</span>
          <strong>{summary()?.balance ?? 0}</strong>
        </div>
        <button type="button" class="settings-credit-trigger" onClick={() => void refetch()}>
          Refresh
        </button>
      </section>

      <section class="settings-card settings-buy">
        <div>
          <strong>{flex.name}</strong>
          <span>
            ${flex.priceUsd} for {formatCredits(flex.credits ?? 0)} credits — {pricePerCredit(flex)}{' '}
            / credit
          </span>
        </div>
        <button type="button" disabled={buying()} onClick={() => void buyFlex()}>
          {buying() ? 'Redirecting…' : 'Buy credits'}
        </button>
      </section>
      <p class="settings-note">No subscription required. Purchases are final.</p>

      <Show when={error()}>
        <p class="settings-field__error">{error()}</p>
      </Show>

      <div class="settings-plans">
        <For each={upsells}>
          {plan => (
            <article class={`settings-card ${plan.popular ? 'is-popular' : ''}`}>
              <div class="settings-plan-name">
                {plan.name}
                <Show when={plan.popular}>
                  <em>Most popular</em>
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
