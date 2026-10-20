import {
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  ExternalLink,
  Gift,
  Link2,
  MousePointerClick,
  TrendingUp,
  Users,
  WalletCards,
} from 'lucide-solid'
import { createSignal, For, onMount, Show } from 'solid-js'
import { API_URL } from '../../config'
import { CREDITS_PER_VIDEO, REFERRAL_REWARDS } from '../../lib/referral'
import { useAuth } from '../core/auth'
import { CopyButton, Loading, Popover } from './primitives'
import '../../styles/affiliate-portal.css'

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

/** What earned credits amount to, in the unit people think in. */
const runway = (credits: number) => {
  const videos = Math.floor(credits / CREDITS_PER_VIDEO)
  if (videos >= 1) return `About ${videos} free video${videos === 1 ? '' : 's'} earned`
  if (credits > 0) return `${Math.round((credits / CREDITS_PER_VIDEO) * 100)}% of a free video`
  return 'Your first referral starts the count'
}

/**
 * The signed-in half of /affiliates: activate a link, or share it and see what
 * it has earned. The rest of the page (how it works, terms, the calculator)
 * is the same one signed-out visitors read.
 */
export function ReferralPanel() {
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
    setError('')
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
    <div class="referral-panel">
      <Show
        when={!loading()}
        fallback={
          <div class="affiliate-loading">
            <Loading />
          </div>
        }
      >
        <Show
          when={data()}
          fallback={
            <section class="affiliate-link-card referral-activate">
              <div class="affiliate-link-card__content">
                <span class="affiliate-link-card__icon">
                  <Link2 size={21} />
                </span>
                <div>
                  <p class="affiliate-link-card__label">Your referral link</p>
                  <h2>Activate it in one click.</h2>
                  <p class="referral-activate__copy">
                    Earn {REFERRAL_REWARDS.signup} credits for every signup and{' '}
                    {REFERRAL_REWARDS.purchase} more on their first purchase.
                  </p>
                  <div class="affiliate-trust-row">
                    <span>
                      <BadgeCheck size={16} /> Instant access
                    </span>
                    <span>
                      <BadgeCheck size={16} /> No referral cap
                    </span>
                    <span>
                      <BadgeCheck size={16} /> Automatic rewards
                    </span>
                  </div>
                </div>
              </div>
              <div class="affiliate-link-card__controls">
                <button
                  class="affiliate-primary-action"
                  type="button"
                  aria-busy={registering()}
                  disabled={registering()}
                  onClick={() => void register()}
                >
                  {registering() ? 'Creating your link...' : 'Activate my referral link'}
                  <ArrowRight size={17} />
                </button>
              </div>
            </section>
          }
        >
          {affiliate => {
            const stats = () => affiliate().stats
            const cards = () =>
              [
                [MousePointerClick, 'Link clicks', stats().clicks, 'People who opened your link'],
                [Users, 'Signups', stats().signups, 'New creators who joined'],
                [TrendingUp, 'Conversions', stats().conversions, 'Referrals who purchased'],
                [
                  WalletCards,
                  'Credits earned',
                  stats().creditsEarned,
                  'Added directly to your wallet',
                ],
              ] as const
            return (
              <>
                <section class="affiliate-link-card">
                  <div class="affiliate-link-card__content">
                    <span class="affiliate-link-card__icon">
                      <Link2 size={21} />
                    </span>
                    <div>
                      <p class="affiliate-link-card__label">
                        Your unique referral link
                        <span class="affiliate-status">
                          <i /> {affiliate().status || 'Active'}
                        </span>
                      </p>
                      <h2>One link. Every channel.</h2>
                    </div>
                  </div>
                  <div class="affiliate-link-card__controls">
                    <code title={url()}>{url()}</code>
                    <CopyButton value={url()} label="Copy link" />
                    <Popover
                      label="Share referral link"
                      class="affiliate-share-menu"
                      trigger={
                        <span class="affiliate-share-trigger">
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
                          <button class="affiliate-share-option" onClick={() => share(item[1])}>
                            Share on {item[0]}
                          </button>
                        )}
                      </For>
                    </Popover>
                  </div>
                </section>
                <section class="affiliate-stat-grid" aria-label="Referral performance">
                  <For each={cards()}>
                    {(card, index) => {
                      const Icon = card[0]
                      return (
                        <article class="affiliate-stat-card" style={{ '--card-index': index() }}>
                          <div class="affiliate-stat-card__top">
                            <span>
                              <Icon size={18} />
                            </span>
                            <ArrowUpRight size={16} />
                          </div>
                          <p>{card[1]}</p>
                          <strong>{card[2].toLocaleString()}</strong>
                          <small>{card[3]}</small>
                        </article>
                      )
                    }}
                  </For>
                </section>
                <section class="affiliate-progress-card">
                  <div>
                    <div class="affiliate-progress-card__title">
                      <span>
                        <Gift size={19} />
                      </span>
                      <div>
                        <p>Creative runway</p>
                        <h2>{runway(stats().creditsEarned)}</h2>
                      </div>
                    </div>
                    <p class="affiliate-progress-card__copy">
                      Your {stats().creditsEarned.toLocaleString()} earned credits are already in
                      your wallet and ready for the next project. A narrated demo video runs about{' '}
                      {CREDITS_PER_VIDEO} credits.
                    </p>
                  </div>
                  <div class="affiliate-credit-orbit" aria-hidden="true">
                    <span>{stats().creditsEarned.toLocaleString()}</span>
                    <small>credits</small>
                    <i />
                  </div>
                </section>
              </>
            )
          }}
        </Show>
        <Show when={error()}>
          <p class="affiliate-error" role="alert">
            {error()}
          </p>
        </Show>
      </Show>
    </div>
  )
}
