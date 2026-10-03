import { Check, ChevronsRight, CreditCard } from 'lucide-solid'
import { createSignal, createUniqueId, For, onCleanup, onMount, Show } from 'solid-js'
import '../../styles/purchase-receipt.css'

export interface PurchaseDetails {
  credits?: number
  amount?: string
  method?: string
  balance?: number
  date?: string
  receiptId?: string
  email?: string
  name?: string
  label?: string
}

const pixels = [
  [53, 45],
  [86, 45],
  [119, 45],
  [53, 68],
  [119, 68],
  [53, 91],
  [86, 91],
  [119, 91],
  [53, 114],
  [53, 137],
]

function PitchCoin(props: { tile?: boolean }) {
  const id = createUniqueId()
  return (
    <svg viewBox="0 0 200 200" aria-hidden="true" class="purchase-coin">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#3a3a3a" />
          <stop offset="100%" stop-color="#050505" />
        </linearGradient>
      </defs>
      <Show
        when={props.tile}
        fallback={
          <>
            <circle cx="100" cy="100" r="94" fill={`url(#${id})`} />
            <circle
              cx="100"
              cy="100"
              r="91"
              fill="none"
              stroke="#555"
              stroke-width="5"
              stroke-dasharray="5.8 3.1"
            />
            <circle cx="100" cy="100" r="80" fill="#111" stroke="#444" />
          </>
        }
      >
        <rect width="200" height="200" rx="40" fill="#111" />
      </Show>
      <g style={{ filter: 'drop-shadow(0 0 4px #ffffff80)' }}>
        <For each={pixels}>
          {([x, y]) => <rect x={x} y={y} width="28" height="18" rx="3" fill="white" />}
        </For>
      </g>
    </svg>
  )
}

/** The grant is already committed by /checkout/status; claiming is only a celebration. */
export function PurchaseReceipt(props: {
  receipt: PurchaseDetails
  customerName: string
  onContinue: () => void
}) {
  const [ready, setReady] = createSignal(false)
  const [claimed, setClaimed] = createSignal(false)
  const [drag, setDrag] = createSignal(0)
  const [claimedCredits, setClaimedCredits] = createSignal(0)
  const [coins, setCoins] = createSignal<
    { x: number; y: number; dx: number; dy: number; delay: number }[]
  >([])
  let track!: HTMLDivElement
  let bubble!: HTMLSpanElement
  let startX: number | null = null
  let reducedMotion = false
  const timers: number[] = []
  const later = (fn: () => void, delay: number) => timers.push(window.setTimeout(fn, delay))
  const customer = () => props.receipt.name || props.customerName
  const initials = () =>
    customer()
      .split(/\s+/)
      .slice(0, 2)
      .map(part => part[0])
      .join('')
      .toUpperCase()
  const creditLabel = () => props.receipt.credits?.toLocaleString('en-US')

  onMount(() => {
    reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    // Match the CSS badge/feed sequence; reduced motion can claim immediately.
    later(() => setReady(true), reducedMotion ? 0 : 8400)
  })
  onCleanup(() => timers.forEach(clearTimeout))

  function claim() {
    if (!ready() || claimed()) return
    const origin = track.getBoundingClientRect()
    const target = bubble.getBoundingClientRect()
    setClaimed(true)
    setDrag(0)
    setClaimedCredits(props.receipt.credits ?? 0)
    if (!reducedMotion) {
      setCoins(
        Array.from({ length: 18 }, (_, i) => ({
          x: origin.right - 40,
          y: origin.top + origin.height / 2 - 14,
          dx: target.left + target.width / 2 - origin.right + 26,
          dy: target.top + target.height / 2 - origin.top - origin.height / 2,
          delay: i * 48,
        })),
      )
      // Animate only this purchase's count. The wallet pill remains the real
      // server balance, which can also include spending or other credit grants.
      setClaimedCredits(0)
      for (let i = 1; i <= 18; i++) {
        later(
          () => setClaimedCredits(Math.round(((props.receipt.credits ?? 0) * i) / 18)),
          580 + (i - 1) * 48,
        )
      }
      later(() => setCoins([]), 1800)
    }
  }

  function finishDrag(event: PointerEvent) {
    if (startX === null) return
    startX = null
    if (drag() >= (track.clientWidth - 62) * 0.4) claim()
    setDrag(0)
    if ((event.currentTarget as HTMLElement).hasPointerCapture(event.pointerId)) {
      ;(event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId)
    }
  }

  return (
    <main class="purchase-screen">
      <div class="purchase-confetti" aria-hidden="true">
        <For each={Array.from({ length: 40 }, (_, i) => i)}>
          {i => (
            <i
              style={{
                left: `${(i * 7.7) % 100}%`,
                background: ['#34d399', '#6ee7b7', '#10b981', '#a7f3d0', '#fbbf24', '#a855f7'][
                  i % 6
                ],
                '--delay': `${(i % 9) * 0.12}s`,
                '--duration': `${3 + (i % 4) * 0.6}s`,
                '--drift': `${i % 2 ? 70 : -70}px`,
              }}
            />
          )}
        </For>
      </div>

      <header class="purchase-badge">
        <div class="purchase-check">
          <Check size={30} strokeWidth={3} />
        </div>
        <h1>Payment Complete</h1>
      </header>

      <div class="purchase-printer">
        <div class="purchase-lip" aria-hidden="true">
          <div class="purchase-cap purchase-cap-left" />
          <div class="purchase-cap purchase-cap-right" />
          <div class="purchase-bar">
            <div class="purchase-slot">
              <i />
            </div>
          </div>
          <div class="purchase-slot-shadow" />
        </div>
        <div class="purchase-feed">
          <article class="purchase-paper" aria-label="Purchase receipt">
            <div class="purchase-scallops" />
            <div class="purchase-paper-body">
              <div class="purchase-total">{props.receipt.amount || 'Payment confirmed'}</div>
              <Show when={props.receipt.label}>
                <p class="purchase-plan">{props.receipt.label}</p>
              </Show>
              <div class="purchase-divider" />
              <div class="purchase-row">
                <span class="purchase-tile">
                  <PitchCoin tile />
                </span>
                <span>trypitch.co</span>
              </div>
              <div class="purchase-row purchase-customer">
                <span class="purchase-avatar">{initials()}</span>
                <span class="purchase-customer-name" title={customer()}>
                  {customer()}
                </span>
                <span
                  ref={bubble}
                  class="purchase-balance"
                  classList={{ 'is-claiming': claimed() && coins().length > 0 }}
                  title="Current credit balance"
                >
                  <PitchCoin />
                  <span>{props.receipt.balance?.toLocaleString('en-US') ?? '—'}</span>
                </span>
              </div>
              <div class="purchase-row">
                <span class="purchase-payment-tile">
                  <CreditCard size={21} />
                </span>
                <span>{props.receipt.method || 'Dodo Payments'}</span>
              </div>
              <Show when={props.receipt.date}>
                <p class="purchase-date">{props.receipt.date}</p>
              </Show>
              <Show when={creditLabel()}>
                <p class="purchase-credit-note">{creditLabel()} credits added to your account</p>
              </Show>
              <div
                ref={track}
                class="purchase-claim"
                classList={{ 'is-ready': ready(), 'is-claimed': claimed() }}
              >
                <Show
                  when={!claimed()}
                  fallback={
                    <span class="purchase-claimed">
                      <Check size={18} />
                      {creditLabel()
                        ? `+${claimedCredits().toLocaleString('en-US')} credits claimed`
                        : 'Ready to create'}
                    </span>
                  }
                >
                  <div class="purchase-claim-fill" style={{ width: `${drag() + 56}px` }} />
                  <span class="purchase-claim-label" style={{ opacity: 1 - drag() / 120 }}>
                    Peel to claim
                  </span>
                  <button
                    type="button"
                    class="purchase-handle"
                    aria-label="Claim purchased credits"
                    disabled={!ready()}
                    style={{ transform: `translateX(${drag()}px)` }}
                    onClick={claim}
                    onPointerDown={event => {
                      if (!ready() || event.button !== 0) return
                      startX = event.clientX
                      event.currentTarget.setPointerCapture(event.pointerId)
                    }}
                    onPointerMove={event => {
                      if (startX !== null)
                        setDrag(
                          Math.max(0, Math.min(track.clientWidth - 62, event.clientX - startX)),
                        )
                    }}
                    onPointerUp={finishDrag}
                    onPointerCancel={() => {
                      startX = null
                      setDrag(0)
                    }}
                  >
                    <ChevronsRight size={21} />
                  </button>
                </Show>
              </div>
            </div>
            <div class="purchase-teeth" />
          </article>
        </div>
      </div>
      <div class="purchase-actions">
        <button type="button" onClick={props.onContinue}>
          {claimed() ? 'Start creating' : 'Continue to studio'} <span aria-hidden="true">↗</span>
        </button>
        <p>Your credits are ready, even if you skip the animation.</p>
      </div>
      <For each={coins()}>
        {coin => (
          <span
            class="purchase-flying-coin"
            aria-hidden="true"
            style={{
              left: `${coin.x}px`,
              top: `${coin.y}px`,
              '--dx': `${coin.dx}px`,
              '--dy': `${coin.dy}px`,
              '--delay': `${coin.delay}ms`,
            }}
          >
            <PitchCoin />
          </span>
        )}
      </For>
    </main>
  )
}
