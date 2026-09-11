import { Check, Zap } from 'lucide-solid'
import { createSignal, For, onMount, Show } from 'solid-js'
import pCoinIcon from '../../assets/pCoin.svg'
import { API_URL } from '../../config'
import { demoVideos, formatCredits, PLANS, type Plan, pricePerCredit } from '../../lib/plans'
import { getRefCode } from '../../lib/referral'
import { useAuth } from '../core/auth'

export function PricingView() {
  const { getToken } = useAuth()
  const [loading, setLoading] = createSignal('')
  const [error, setError] = createSignal('')
  const [active, setActive] = createSignal('')
  onMount(async () => {
    try {
      const token = await getToken()
      if (!token) return
      const response = await fetch(`${API_URL}/credits`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (response.ok) setActive((await response.json()).activeSubscription?.planKey ?? '')
    } catch {
      /* non-blocking */
    }
  })
  const checkout = async (plan: Plan) => {
    setLoading(plan.key)
    setError('')
    try {
      const token = await getToken()
      const response = await fetch(`${API_URL}/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(
          plan.kind === 'topup'
            ? { topup: plan.key, refCode: getRefCode() ?? undefined }
            : { pack: plan.key, refCode: getRefCode() ?? undefined },
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
    <div class="mx-auto w-full max-w-5xl px-4 pb-16 pt-6">
      <header class="mb-10 text-center">
        <h1 class="flex items-center justify-center gap-3 text-4xl font-bold">
          <span>Buy</span>
          <img src={pCoinIcon} alt="Credits coin" class="h-12 w-12" />
          <span>credits, generate demos</span>
        </h1>
        <p class="mt-3 text-sm text-gray-500">
          The studio meters what the work costs and draws it from your balance. A demo video runs
          about 120 credits. Credits you buy are yours to keep; monthly plan credits are forfeited
          when the plan ends.
        </p>
      </header>
      <Show when={error()}>
        <div
          role="alert"
          class="mb-6 rounded-xl border border-red-200 bg-red-50 p-3 text-center text-sm text-red-700"
        >
          {error()}
        </div>
      </Show>
      <div class="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <For each={PLANS}>
          {plan => (
            <article
              class={`relative flex flex-col rounded-2xl bg-white p-6 ${plan.popular ? 'border-2 border-gray-900 shadow-lg' : 'border border-gray-200'}`}
            >
              <Show when={plan.popular}>
                <span class="absolute right-0 top-0 rounded-bl-lg rounded-tr-2xl bg-gray-900 px-3 py-1 text-[10px] font-bold text-white">
                  POPULAR
                </span>
              </Show>
              <h2 class="text-xl font-bold">{plan.name}</h2>
              <div class="mt-3 text-3xl font-bold">
                {plan.priceUsd === null ? 'Custom' : `$${plan.priceUsd}`}
                <Show when={plan.priceUsd !== null}>
                  <span class="text-sm font-medium text-gray-500">
                    /{plan.kind === 'subscription' ? 'month' : 'one-time'}
                  </span>
                </Show>
              </div>
              <Show when={pricePerCredit(plan)}>
                {rate => <p class="mt-1 text-xs text-gray-500">{rate()} per credit</p>}
              </Show>
              <span class="my-3 inline-flex w-fit items-center gap-1 rounded-full bg-gray-100 px-2 py-1 text-xs font-semibold">
                <Zap size={11} />
                {plan.credits ? `${formatCredits(plan.credits)} credits` : 'Volume'}
              </span>
              <p class="mb-5 text-xs text-gray-500">{plan.description}</p>
              <Show
                when={plan.kind === 'contact'}
                fallback={
                  <button
                    disabled={!!loading() || active() === plan.key}
                    class="mb-5 rounded-xl bg-gray-900 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
                    onClick={() => void checkout(plan)}
                  >
                    {active() === plan.key
                      ? 'Current plan'
                      : loading() === plan.key
                        ? 'Redirecting...'
                        : `Get ${plan.name}`}
                  </button>
                }
              >
                <a
                  href="mailto:support@trypitch.co?subject=Pitch%20Enterprise"
                  class="mb-5 rounded-xl bg-gray-900 py-2.5 text-center text-sm font-semibold text-white"
                >
                  Contact sales
                </a>
              </Show>
              <ul class="space-y-2.5 text-sm text-gray-600">
                <Show when={demoVideos(plan)}>
                  {count => (
                    <li class="flex gap-2">
                      <Check size={15} />
                      About {count()} demo videos
                    </li>
                  )}
                </Show>
                <For each={plan.features}>
                  {feature => (
                    <li class="flex gap-2">
                      <Check size={15} />
                      {feature}
                    </li>
                  )}
                </For>
              </ul>
            </article>
          )}
        </For>
      </div>
    </div>
  )
}
