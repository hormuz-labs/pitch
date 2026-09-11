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
            props.variant === 'marker' ? 'text-[11px] text-gray-500' : 'credit-popover-trigger'
          }
        >
          <img src={pCoinIcon} alt="" class="h-5 w-5" />
          <span>{credits() ?? '—'}</span>
        </span>
      }
      class="credit-popover-menu absolute right-0 top-full z-50 mt-2 w-72"
    >
      <p class="credit-popover-menu__eyebrow">Credits</p>
      <p class="credit-popover-menu__balance">{credits() ?? '—'} available</p>
      <p class="credit-popover-menu__copy">
        Agent model spend and rendering compute draw from the same balance. Unused credits are
        forfeited when your subscription ends.
      </p>
      <div class="credit-popover-menu__plan">
        <span>Current plan</span>
        <b>{plan() ?? 'Free'}</b>
      </div>
      <button class="credit-popover-menu__action" onClick={() => navigate('/pricing')}>
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
