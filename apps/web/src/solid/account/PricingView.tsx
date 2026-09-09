import { Check, Zap } from 'lucide-solid'
import { createSignal, For, onMount, Show } from 'solid-js'
import pCoinIcon from '../../assets/pCoin.svg'
import { API_URL } from '../../config'
import { getRefCode } from '../../lib/referral'
import { useAuth } from '../core/auth'

const packs = [
  {
    key: 'starter',
    name: 'Starter',
    price: 10,
    credits: 10,
    desc: 'Perfect for trying AI-powered creation.',
    features: ['10 AI credits per month', 'Up to 1080p exports', 'Priority access'],
  },
  {
    key: 'pro',
    name: 'Pro',
    price: 40,
    credits: 50,
    popular: true,
    desc: 'For creators and professionals.',
    features: [
      '50 AI credits per month',
      '20% savings vs. Starter',
      'Custom agent instructions',
      'Remove watermarks',
    ],
  },
  {
    key: 'enterprise',
    name: 'Enterprise',
    price: null,
    credits: null,
    desc: 'High-volume teams and agencies.',
    features: ['Custom credit volume', 'Volume discounts', 'Dedicated account manager'],
  },
]
const topups = [
  {
    key: 'topup_10',
    name: '10 Credits Top-up',
    price: 12,
    credits: 10,
    desc: 'A few extra credits to finish a project.',
    features: ['10 AI credits', 'One-time payment, no expiry'],
  },
  {
    key: 'topup_50',
    name: '50 Credits Top-up',
    price: 45,
    credits: 50,
    popular: true,
    desc: 'The quickest way to refill your balance.',
    features: ['50 AI credits', 'Better value per credit', 'One-time payment, no expiry'],
  },
]

export function PricingView() {
  const { getToken } = useAuth()
  const [mode, setMode] = createSignal<'subscription' | 'topup'>('subscription')
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
  const checkout = async (key: string) => {
    setLoading(key)
    setError('')
    try {
      const token = await getToken()
      const response = await fetch(`${API_URL}/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(
          mode() === 'topup'
            ? { topup: key, refCode: getRefCode() ?? undefined }
            : { pack: key, refCode: getRefCode() ?? undefined },
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
          <span>credit, generate demos</span>
        </h1>
        <p class="mt-3 text-sm text-gray-500">
          Subscribe for monthly credits, or buy top-ups whenever you need more.
        </p>
        <div role="tablist" class="mt-6 inline-flex rounded-xl bg-gray-100 p-1">
          <button
            role="tab"
            aria-selected={mode() === 'subscription'}
            class={`rounded-lg px-6 py-2.5 text-sm font-semibold ${mode() === 'subscription' ? 'bg-white shadow-sm' : 'text-gray-500'}`}
            onClick={() => setMode('subscription')}
          >
            Monthly Subscriptions
          </button>
          <button
            role="tab"
            aria-selected={mode() === 'topup'}
            class={`rounded-lg px-6 py-2.5 text-sm font-semibold ${mode() === 'topup' ? 'bg-white shadow-sm' : 'text-gray-500'}`}
            onClick={() => setMode('topup')}
          >
            One-time Top-ups
          </button>
        </div>
      </header>
      <Show when={error()}>
        <div
          role="alert"
          class="mb-6 rounded-xl border border-red-200 bg-red-50 p-3 text-center text-sm text-red-700"
        >
          {error()}
        </div>
      </Show>
      <div
        class={`grid grid-cols-1 gap-5 ${mode() === 'subscription' ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}
      >
        <For each={mode() === 'subscription' ? packs : topups}>
          {pack => (
            <article
              class={`relative flex flex-col rounded-2xl bg-white p-6 ${pack.popular ? 'border-2 border-gray-900 shadow-lg' : 'border border-gray-200'}`}
            >
              <Show when={pack.popular}>
                <span class="absolute right-0 top-0 rounded-bl-lg rounded-tr-2xl bg-gray-900 px-3 py-1 text-[10px] font-bold text-white">
                  POPULAR
                </span>
              </Show>
              <h2 class="text-xl font-bold">{pack.name}</h2>
              <div class="mt-3 text-3xl font-bold">
                {pack.price === null ? 'Custom' : `$${pack.price}`}
                <Show when={pack.price !== null}>
                  <span class="text-sm font-medium text-gray-500">
                    /{mode() === 'subscription' ? 'month' : 'one-time'}
                  </span>
                </Show>
              </div>
              <span class="my-3 inline-flex w-fit items-center gap-1 rounded-full bg-gray-100 px-2 py-1 text-xs font-semibold">
                <Zap size={11} />
                {pack.credits ?? 'Volume'} credits
              </span>
              <p class="mb-5 text-xs text-gray-500">{pack.desc}</p>
              <Show
                when={pack.key === 'enterprise'}
                fallback={
                  <button
                    disabled={!!loading() || active() === pack.key}
                    class="mb-5 rounded-xl bg-gray-900 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
                    onClick={() => void checkout(pack.key)}
                  >
                    {active() === pack.key
                      ? 'Current plan'
                      : loading() === pack.key
                        ? 'Redirecting...'
                        : `Buy ${pack.credits} Credits`}
                  </button>
                }
              >
                <a
                  href="mailto:support@trypitch.co"
                  class="mb-5 rounded-xl bg-gray-900 py-2.5 text-center text-sm font-semibold text-white"
                >
                  Book a Meeting
                </a>
              </Show>
              <ul class="space-y-2.5 text-sm text-gray-600">
                <For each={pack.features}>
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
