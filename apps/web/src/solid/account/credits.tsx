import { useNavigate } from '@solidjs/router'
import { createSignal, onCleanup, onMount } from 'solid-js'
import pCoinIcon from '../../assets/pCoin.svg'
import { API_URL } from '../../config'
import { useAuth } from '../core/auth'
import { Popover } from './primitives'

export function CreditChip(props: { amount: number; class?: string }) {
  return (
    <span
      class={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${props.class ?? 'bg-gray-100 text-gray-700'}`}
    >
      <img src={pCoinIcon} alt="" class="h-3.5 w-3.5" />
      {props.amount}
    </span>
  )
}

export function CreditPopover(props: { variant?: 'chip' | 'marker' }) {
  const { getToken } = useAuth()
  const navigate = useNavigate()
  const [credits, setCredits] = createSignal<number | null>(null)
  const [plan, setPlan] = createSignal<string | null>(null)
  const load = async () => {
    const token = await getToken({ skipCache: true })
    if (!token) return
    const response = await fetch(`${API_URL}/credits`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (response.ok) {
      const data = await response.json()
      setCredits(data.balance)
      setPlan(data.activeSubscription?.planKey ?? null)
    }
  }
  onMount(() => {
    void load()
    window.addEventListener('credits-changed', load)
    onCleanup(() => window.removeEventListener('credits-changed', load))
  })
  return (
    <Popover
      label={`${credits() ?? 0} credits available`}
      trigger={
        <span
          class={
            props.variant === 'marker'
              ? 'text-[11px] text-gray-500'
              : 'inline-flex h-9 items-center gap-1 rounded-lg border border-gray-200 px-3 text-sm font-semibold'
          }
        >
          <img src={pCoinIcon} alt="" class="h-5 w-5" />
          <span>{credits() ?? '—'}</span>
        </span>
      }
      class="absolute right-0 top-full z-50 mt-2 w-72 rounded-2xl border border-gray-200 bg-white p-5 shadow-2xl"
    >
      <p class="text-xs font-bold uppercase tracking-widest text-gray-400">Credits</p>
      <p class="mt-1 text-lg font-bold text-gray-900">{credits() ?? '—'} available</p>
      <p class="mt-3 text-sm leading-relaxed text-gray-500">
        Agent model spend and rendering compute draw from the same balance. Unused credits are
        forfeited when your subscription ends.
      </p>
      <div class="mt-4 flex items-center justify-between rounded-xl bg-gray-50 px-3 py-2 text-xs">
        <span>Current plan</span>
        <b>{plan() ?? 'Free'}</b>
      </div>
      <button
        class="mt-3 w-full rounded-xl border border-gray-200 py-2.5 text-sm font-medium"
        onClick={() => navigate('/pricing')}
      >
        View pricing plans
      </button>
    </Popover>
  )
}

export function SettingsCreditButton(props: { onClick: () => void }) {
  const { getToken } = useAuth()
  const [credits, setCredits] = createSignal<number | null>(null)
  const load = async () => {
    const token = await getToken()
    if (!token) return
    const response = await fetch(`${API_URL}/credits`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (response.ok) setCredits((await response.json()).balance)
  }
  onMount(() => {
    void load()
    window.addEventListener('credits-changed', load)
    onCleanup(() => window.removeEventListener('credits-changed', load))
  })
  return (
    <button
      type="button"
      class="settings-credit-trigger"
      onClick={props.onClick}
      aria-label={`${credits() ?? 0} credits - open billing`}
    >
      <img src={pCoinIcon} alt="" />
      <span>{credits() ?? '—'}</span>
    </button>
  )
}
