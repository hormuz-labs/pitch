import { useAuth } from '@clerk/react'
import * as Popover from '@radix-ui/react-popover'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import pCoinIcon from '../assets/pCoin.svg'
import { API_URL } from '../config'
import { LoadingCoin } from './LoadingCoin'

const PLAN_LABELS: Record<string, string> = {
  starter: 'Starter',
  pro: 'Pro',
  enterprise: 'Enterprise',
}

const PLAN_COLORS: Record<string, { bg: string; text: string }> = {
  starter: { bg: '#eff6ff', text: '#1d4ed8' },
  pro: { bg: '#f5f3ff', text: '#7c3aed' },
  enterprise: { bg: '#fffbeb', text: '#b45309' },
}

const R = 5.5
const CIRCUMFERENCE = 2 * Math.PI * R

/**
 * A dollar sign and a ring that fills as credit is spent.
 *
 * The number is deliberately absent: a running balance in the corner of every
 * screen is a thing to worry about, and the only moment it is actionable is
 * when you go looking for it — which is a click away, in the popover. The ring
 * carries the one bit that matters at a glance, which is roughly how much is
 * left, and it goes amber near the end.
 */
function UsageGauge({ used, loading }: { used: number; loading: boolean }) {
  const filled = Math.max(0, Math.min(1, used))
  const low = filled >= 0.85
  return (
    <span className="inline-flex items-center gap-[3px]" aria-hidden="true">
      <span className="text-[11px] leading-none">$</span>
      <svg width="14" height="14" viewBox="0 0 14 14" className={low ? 'text-amber-500' : ''}>
        <circle
          cx="7"
          cy="7"
          r={R}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          opacity="0.25"
        />
        {!loading && filled > 0 && (
          <circle
            cx="7"
            cy="7"
            r={R}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={CIRCUMFERENCE * (1 - filled)}
            transform="rotate(-90 7 7)"
            style={{ transition: 'stroke-dashoffset 0.4s ease' }}
          />
        )}
      </svg>
    </span>
  )
}

/**
 * `chip` is the bordered pill the app shell used to keep in its header.
 * `marker` is a quiet inline number for the composer footer — the balance
 * matters where you are about to spend it, and nowhere else, so it sits next
 * to the send button instead of following the user around the app.
 */
export const CreditPopover = ({ variant = 'chip' }: { variant?: 'chip' | 'marker' }) => {
  const navigate = useNavigate()
  const { getToken, userId } = useAuth()
  const [credits, setCredits] = useState<number | null>(null)
  const [plan, setPlan] = useState<string | null>(null)
  /** Share of everything ever granted that has been spent, 0–1. Drives the ring. */
  const [used, setUsed] = useState(0)
  // Credits newly earned from referrals since this user last saw the coin.
  const [referralNudge, setReferralNudge] = useState<number | null>(null)
  const [spinning, setSpinning] = useState(false)
  const isFirstLoad = useRef(true)
  const spinTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const fetchBalance = async () => {
      try {
        const token = await getToken({ skipCache: true })
        if (!token) return
        const res = await fetch(`${API_URL}/credits`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (res.ok) {
          const data = await res.json()
          setCredits(data.balance)
          setPlan(data.activeSubscription?.planKey ?? null)

          // "How much of what I have has gone" — granted is every credit ever
          // added (plan, top-up, referral), spent is every credit taken. A top
          // up grows the denominator, so the ring backs off, which is the
          // behaviour someone watching it expects.
          if (Array.isArray(data.transactions)) {
            let granted = 0
            let spent = 0
            for (const t of data.transactions) {
              const delta = Number(t.delta) || 0
              if (delta > 0) granted += delta
              else spent -= delta
            }
            setUsed(granted > 0 ? Math.min(1, spent / granted) : 0)
          }

          // Surface a one-time nudge when referral earnings have grown since the
          // user last loaded the coin (the reward is granted while they're away,
          // when a friend signs up or upgrades). Tracked per-user in localStorage.
          if (userId && Array.isArray(data.transactions)) {
            const earned = data.transactions
              .filter((t: any) => t.type === 'referral' && t.delta > 0)
              .reduce((s: number, t: any) => s + t.delta, 0)
            const key = `pitch:seenReferralCredits:${userId}`
            const seenRaw = localStorage.getItem(key)
            if (seenRaw !== null) {
              const seen = parseInt(seenRaw, 10) || 0
              if (earned > seen) setReferralNudge(earned - seen)
            }
            localStorage.setItem(key, String(earned))
          }
        }
      } catch {
        // silently fail — UI falls back to dash
      }
    }
    fetchBalance()

    window.addEventListener('credits-changed', fetchBalance)
    return () => window.removeEventListener('credits-changed', fetchBalance)
  }, [getToken, userId])

  // Spin the coin once whenever credits changes (skip very first load).
  // Respects prefers-reduced-motion — skip animation if user prefers it.
  useEffect(() => {
    if (credits === null) return
    if (isFirstLoad.current) {
      isFirstLoad.current = false
      return
    }
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reducedMotion) return
    if (spinTimer.current) clearTimeout(spinTimer.current)
    // Two rAFs ensure the class removal is painted before re-adding.
    // setState here is intentional — coin spin is display-only feedback.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSpinning(false)
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setSpinning(true)
        // eslint-disable-next-line react-hooks/set-state-in-effect
        spinTimer.current = setTimeout(() => setSpinning(false), 650)
      })
    })
  }, [credits])

  // Auto-dismiss the referral nudge after a few seconds.
  useEffect(() => {
    if (referralNudge === null) return
    const t = setTimeout(() => setReferralNudge(null), 9000)
    return () => clearTimeout(t)
  }, [referralNudge])

  const planLabel = plan ? (PLAN_LABELS[plan] ?? plan) : 'Free'
  const triggerLabel =
    credits !== null ? `${credits} credits available — ${planLabel} plan` : 'Credits loading'

  return (
    <div className="relative">
      <Popover.Root>
        <Popover.Trigger asChild>
          <button
            aria-label={triggerLabel}
            className={
              variant === 'marker'
                ? [
                    'inline-flex items-center gap-1 px-0 py-0 border-none bg-transparent',
                    'text-gray-400 hover:text-gray-700 cursor-pointer text-[11px] font-medium',
                    'transition-colors duration-150 focus-visible:outline-none',
                    'focus-visible:ring-1 focus-visible:ring-gray-400 rounded',
                  ].join(' ')
                : [
                    'flex items-center justify-center gap-1 md:gap-1.5 px-2 md:px-3 h-9',
                    'border border-gray-200 text-gray-700 bg-white rounded-lg',
                    'transition-colors duration-150',
                    'hover:bg-gray-50 cursor-pointer font-semibold text-base md:text-sm',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-1',
                    'motion-safe:active:scale-95',
                    'min-w-[56px] shrink-0',
                  ].join(' ')
            }
            id="header-credits-btn"
          >
            {variant === 'marker' ? (
              <UsageGauge used={used} loading={credits === null} />
            ) : (
              <>
                {credits === null ? (
                  <LoadingCoin className="w-[22px] h-[22px] shrink-0" aria-hidden="true" />
                ) : (
                  <img
                    src={pCoinIcon}
                    alt=""
                    aria-hidden="true"
                    width={22}
                    height={22}
                    className={`w-[22px] h-[22px] shrink-0${spinning ? ' pcoin-spin' : ''}`}
                  />
                )}
                {credits !== null && <span className="tabular-nums">{credits}</span>}
              </>
            )}
          </button>
        </Popover.Trigger>

        <Popover.Portal>
          <Popover.Content
            role="dialog"
            aria-label="Credits and plan details"
            className="w-72 sm:w-80 rounded-2xl border border-gray-200 bg-white p-5 shadow-2xl z-50 font-sans"
            align="end"
            sideOffset={8}
            style={{ overscrollBehavior: 'contain' }}
          >
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-0.5 block">
                    Credits
                  </span>
                  <span className="text-lg font-bold text-gray-900 tabular-nums">
                    {credits ?? '—'} available
                  </span>
                </div>
              </div>

              <p className="text-[13px] leading-relaxed text-gray-500">
                You are billed for what the work costs — the agent's thinking, plus the machine time
                spent recording, generating and rendering. Asking for a change is nearly free; a 4K
                export is not. Credits never expire.
              </p>

              {/* Near-miss nudge: only when the user can't yet afford a video
                (< 3 credits, so they're 1–2 short). Above that they already have
                enough for at least one video and the nudge reads as noise. We
                don't call it a "free" video — a video always costs 3 credits;
                we just point at the cheapest paths to the next one (refer → +1,
                or top up). */}
              {/* Running low. There is no fixed per-video price any more, so this
                  is a "top up before you start something big" nudge, not a
                  "you cannot afford one video" one. */}
              {credits !== null && credits > 0 && credits < 5 && (
                <div className="rounded-xl border border-amber-100 bg-amber-50 px-3 py-2.5">
                  <p className="text-[13px] font-semibold text-amber-900 leading-snug">
                    You're down to {credits} credit{credits === 1 ? '' : 's'}.
                  </p>
                  <p className="text-[11px] text-amber-700 mt-0.5 mb-2.5">
                    Refer a friend to earn +1 credit each — or top up below.
                  </p>
                  <button
                    onClick={() => {
                      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
                      navigate('/affiliate')
                    }}
                    className={[
                      'w-full py-2 px-3 bg-gray-900 text-white text-xs font-semibold rounded-lg',
                      'transition-colors duration-150 cursor-pointer hover:bg-gray-800 active:bg-black',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-1',
                    ].join(' ')}
                  >
                    Refer a friend &nbsp;+1 credit
                  </button>
                </div>
              )}

              <div className="flex items-center justify-between rounded-xl border border-gray-100 bg-gray-50 px-3 py-2.5">
                <span className="text-xs text-gray-500 font-medium">Current plan</span>
                {plan ? (
                  <span
                    className="text-[11px] font-bold px-2 py-0.5 rounded-full"
                    style={{
                      background: PLAN_COLORS[plan]?.bg ?? '#f3f4f6',
                      color: PLAN_COLORS[plan]?.text ?? '#374151',
                    }}
                  >
                    {PLAN_LABELS[plan] ?? plan}
                  </span>
                ) : (
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-gray-200 text-gray-600">
                    Free
                  </span>
                )}
              </div>

              <button
                onClick={() => {
                  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
                  navigate('/pricing')
                }}
                className={[
                  'w-full py-2.5 px-4 border border-gray-200 text-gray-900 text-sm font-medium rounded-xl',
                  'transition-colors duration-150 cursor-pointer',
                  'hover:bg-gray-50 active:bg-gray-100',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-1',
                ].join(' ')}
              >
                {plan ? 'Manage Plan' : 'View Pricing Plans'}
              </button>
            </div>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>

      {/* Referral reward nudge — anchored under the coin */}
      {referralNudge !== null && (
        <div
          role="status"
          className="absolute right-0 top-full mt-2 z-50 w-64 rounded-2xl border border-amber-200 bg-white p-3.5 shadow-2xl font-sans animate-in fade-in slide-in-from-top-1"
        >
          <button
            aria-label="Dismiss"
            onClick={() => setReferralNudge(null)}
            className="absolute top-2 right-2 text-gray-300 hover:text-gray-500 cursor-pointer text-sm leading-none"
          >
            ✕
          </button>
          <div className="flex items-start gap-2.5 pr-3">
            <span className="text-xl leading-none mt-0.5">🎉</span>
            <div>
              <p className="text-[13px] font-bold text-gray-900 leading-snug">
                You earned {referralNudge} credit{referralNudge === 1 ? '' : 's'}!
              </p>
              <p className="text-[11px] text-gray-500 mt-0.5 leading-snug">
                A friend joined with your referral link. Added to your balance.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
