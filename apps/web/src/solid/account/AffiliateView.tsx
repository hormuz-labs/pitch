import { ArrowUpRight, DollarSign, ExternalLink, TrendingUp, Users, Wallet } from 'lucide-solid'
import { createSignal, For, onMount, Show } from 'solid-js'
import { API_URL } from '../../config'
import { useAuth } from '../core/auth'
import { CopyButton, Loading, Popover } from './primitives'

interface Affiliate {
  code: string
  status: string
  stats: {
    clicks: number
    signups: number
    conversions: number
    creditsEarned: number
    videosEarned: number
  }
}
export function AffiliateView() {
  const { getToken } = useAuth()
  const [data, setData] = createSignal<Affiliate | null>(null)
  const [loading, setLoading] = createSignal(true)
  const [registering, setRegistering] = createSignal(false)
  const [error, setError] = createSignal('')
  const load = async () => {
    try {
      const token = await getToken()
      const response = await fetch(`${API_URL}/affiliate/me`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (response.status === 404) {
        setData(null)
        return
      }
      if (!response.ok) throw new Error('Failed to fetch affiliate data')
      setData(await response.json())
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Request failed')
    } finally {
      setLoading(false)
    }
  }
  onMount(() => void load())
  const register = async () => {
    setRegistering(true)
    try {
      const token = await getToken()
      const response = await fetch(`${API_URL}/affiliate/register`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!response.ok) throw new Error('Registration failed')
      await load()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Registration failed')
    } finally {
      setRegistering(false)
    }
  }
  const url = () =>
    data()
      ? `${location.hostname === 'localhost' ? 'http://localhost:5173' : 'https://trypitch.co'}/r/${data()!.code}`
      : ''
  const share = (target: string) => window.open(target, '_blank', 'noopener,noreferrer')
  return (
    <Show when={!loading()} fallback={<Loading />}>
      <Show
        when={data()}
        fallback={
          <div class="flex h-full flex-col items-center justify-center gap-5 p-8 text-center">
            <h1 class="text-2xl font-bold">Affiliate Program</h1>
            <div>
              <strong class="text-6xl">8</strong>
              <span class="text-xl font-bold"> cr</span>
              <p class="text-xs uppercase text-gray-400">Credits per referral upgrade</p>
            </div>
            <h2 class="text-2xl font-bold">Turn referrals into free videos</h2>
            <p class="max-w-sm text-sm text-gray-500">
              Friends get starter credits, and you earn credits when they sign up or upgrade.
            </p>
            <Show when={error()}>
              <p class="text-sm text-red-600">{error()}</p>
            </Show>
            <button
              class="flex items-center gap-2 rounded-full bg-black px-6 py-2.5 text-sm font-semibold text-white"
              disabled={registering()}
              onClick={() => void register()}
            >
              {registering() ? 'Setting up...' : 'Get started for free'}
              <ArrowUpRight size={14} />
            </button>
          </div>
        }
      >
        {affiliate => {
          const stats = () => affiliate().stats
          const cards = () =>
            [
              [TrendingUp, 'Link Clicks', stats().clicks],
              [Users, 'Signups', stats().signups],
              [DollarSign, 'Conversions', stats().conversions],
              [Wallet, 'Credits Earned', stats().creditsEarned],
            ] as const
          return (
            <div class="mx-auto max-w-5xl space-y-6 p-6">
              <header>
                <p class="text-xs uppercase tracking-widest text-gray-400">Affiliate Portal</p>
                <h1 class="text-xl font-bold">Dashboard</h1>
              </header>
              <section class="rounded-2xl bg-gradient-to-br from-gray-950 to-gray-800 p-6 text-white">
                <p class="text-xs uppercase text-gray-400">Your referral link</p>
                <div class="mt-4 flex gap-3">
                  <code class="min-w-0 flex-1 truncate rounded-xl bg-white/10 p-3">{url()}</code>
                  <CopyButton value={url()} />
                  <Popover
                    label="Share referral link"
                    trigger={
                      <span class="flex items-center gap-1">
                        <ExternalLink size={14} />
                        Share
                      </span>
                    }
                  >
                    <For
                      each={[
                        [
                          'X',
                          `https://twitter.com/intent/tweet?text=${encodeURIComponent(`Try Pitch ${url()}`)}`,
                        ],
                        [
                          'LinkedIn',
                          `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url())}`,
                        ],
                        [
                          'WhatsApp',
                          `https://wa.me/?text=${encodeURIComponent(`Try Pitch ${url()}`)}`,
                        ],
                      ]}
                    >
                      {item => (
                        <button
                          class="block w-full rounded-lg p-2 text-left text-sm"
                          onClick={() => share(item[1])}
                        >
                          Share on {item[0]}
                        </button>
                      )}
                    </For>
                  </Popover>
                </div>
              </section>
              <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <For each={cards()}>
                  {card => {
                    const Icon = card[0]
                    return (
                      <article class="rounded-2xl border bg-white p-5">
                        <Icon class="mb-4 text-gray-500" size={18} />
                        <p class="text-xs uppercase text-gray-400">{card[1]}</p>
                        <strong class="text-2xl">{card[2].toLocaleString()}</strong>
                      </article>
                    )
                  }}
                </For>
              </div>
              <section class="rounded-2xl border bg-white p-5">
                <h2 class="font-semibold">Credits earned</h2>
                <p class="mt-2 text-3xl font-bold">
                  {stats().creditsEarned}{' '}
                  <span class="text-sm font-normal text-gray-400">
                    = {stats().videosEarned} free videos
                  </span>
                </p>
                <p class="mt-2 text-xs text-gray-500">Credits land in your wallet automatically.</p>
              </section>
            </div>
          )
        }}
      </Show>
    </Show>
  )
}
