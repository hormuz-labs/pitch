import { A } from '@solidjs/router'
import { createEffect, createSignal, onCleanup, onMount } from 'solid-js'
import pCoinIcon from '../../assets/pCoin.svg'
import { API_URL } from '../../config'
import { SlidingNumber } from '../common/SlidingNumber'
import { createCreditBalanceState } from './credit-balance'
import type { ProjectStore } from './useProject'

export function CreditMarker(props: { store: ProjectStore }) {
  const [credits, setCredits] = createSignal<number | null>(null)
  const balanceState = createCreditBalanceState(setCredits)
  const refresh = async (event?: Event) => {
    const detail = (event as CustomEvent<{ balance?: number; pending?: boolean }>)?.detail
    if (balanceState.applyLive(detail ?? {})) return
    if (!balanceState.shouldPoll() || document.hidden) return
    const request = balanceState.beginRequest()
    try {
      const token = await props.store.getToken()
      if (request.signal.aborted) return
      const response = await fetch(`${API_URL}/credits`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
        signal: request.signal,
      })
      if (!response.ok) return
      const data = await response.json()
      if (!request.signal.aborted && typeof data.balance === 'number')
        balanceState.applyRequest(data.balance, request.revision)
    } catch {
      // Keep the last confirmed balance through transient connection failures.
    }
  }
  createEffect(() => {
    props.store.busy
    props.store.project?.creditsCharged
    void refresh()
    if (props.store.busy) {
      const timer = window.setInterval(() => void refresh(), 5000)
      onCleanup(() => clearInterval(timer))
    }
  })
  onMount(() => {
    window.addEventListener('credits-changed', refresh)
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    onCleanup(() => {
      window.removeEventListener('credits-changed', refresh)
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', refresh)
    })
  })
  onCleanup(() => balanceState.dispose())
  const balance = () => credits()?.toLocaleString() ?? '—'
  const label = () =>
    credits() === null
      ? 'Loading credit balance'
      : `${balance()} credits remaining — manage credits`
  return (
    <A class="composer-credits" href="/pricing" aria-label={label()} title={label()}>
      <img src={pCoinIcon} alt="" width={18} height={18} />
      <SlidingNumber class="composer-credits__balance" number={credits() ?? 0} />
      <span class="composer-credits__label">credits</span>
    </A>
  )
}
