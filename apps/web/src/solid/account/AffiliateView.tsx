import {
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  CircleDollarSign,
  ExternalLink,
  Gift,
  Link2,
  MousePointerClick,
  Sparkles,
  TrendingUp,
  UserPlus,
  Users,
  WalletCards,
} from 'lucide-solid'
import { createSignal, For, onMount, Show } from 'solid-js'
import { API_URL } from '../../config'
import { useAuth } from '../core/auth'
import { CopyButton, Loading, Popover } from './primitives'
import type { SettingsSection } from './SettingsView.tsx'
import { TopNav } from './TopNav.tsx'
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
export function AffiliateView(props?: { openSettings?: (section?: SettingsSection) => void }) {
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
  const ReferralArtwork = () => (
    <svg
      class="affiliate-artwork"
      viewBox="0 0 620 500"
      role="img"
      aria-label="A referral link connecting creators and earning credits"
    >
      <defs>
        <linearGradient id="affiliate-card" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#fff" stop-opacity=".96" />
          <stop offset="1" stop-color="#f0ede5" stop-opacity=".88" />
        </linearGradient>
        <linearGradient id="affiliate-line" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#ff6b3d" />
          <stop offset="1" stop-color="#7c5cff" />
        </linearGradient>
        <filter id="affiliate-shadow" x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow
            dx="0"
            dy="18"
            stdDeviation="18"
            flood-color="#251b16"
            flood-opacity=".12"
          />
        </filter>
      </defs>
      <circle class="affiliate-artwork__orbit orbit-one" cx="310" cy="250" r="174" />
      <circle class="affiliate-artwork__orbit orbit-two" cx="310" cy="250" r="125" />
      <path class="affiliate-artwork__route" d="M130 308C206 186 262 185 310 250s111 84 184-57" />
      <g class="affiliate-artwork__person person-one" transform="translate(76 265)">
        <circle cx="42" cy="42" r="42" fill="#171713" />
        <circle cx="42" cy="31" r="12" fill="#f8f5ee" />
        <path d="M20 67c3-14 12-21 22-21s19 7 22 21" fill="#f8f5ee" />
      </g>
      <g class="affiliate-artwork__person person-two" transform="translate(456 105)">
        <circle cx="42" cy="42" r="42" fill="#7c5cff" />
        <circle cx="42" cy="31" r="12" fill="#fff" />
        <path d="M20 67c3-14 12-21 22-21s19 7 22 21" fill="#fff" />
      </g>
      <g
        class="affiliate-artwork__card"
        filter="url(#affiliate-shadow)"
        transform="translate(190 172)"
      >
        <rect width="240" height="156" rx="26" fill="url(#affiliate-card)" />
        <rect x="24" y="25" width="78" height="9" rx="4.5" fill="#171713" opacity=".18" />
        <rect x="24" y="45" width="154" height="11" rx="5.5" fill="#171713" opacity=".78" />
        <rect x="24" y="78" width="192" height="48" rx="14" fill="#171713" />
        <path d="M48 102h116" stroke="#fff" stroke-width="5" stroke-linecap="round" opacity=".76" />
        <path
          d="m183 94 8 8-8 8"
          fill="none"
          stroke="#ff7851"
          stroke-width="5"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </g>
      <g class="affiliate-artwork__coin coin-one" transform="translate(425 310)">
        <circle cx="36" cy="36" r="34" fill="#ff7043" />
        <path
          d="M36 19v34M27 26h14c9 0 9 10 0 10H31c-9 0-9 10 0 10h15"
          fill="none"
          stroke="#fff"
          stroke-width="5"
          stroke-linecap="round"
        />
      </g>
      <g class="affiliate-artwork__coin coin-two" transform="translate(138 125)">
        <circle cx="24" cy="24" r="22" fill="#f4c95d" />
        <path
          d="m17 25 5 5 10-12"
          fill="none"
          stroke="#171713"
          stroke-width="4"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </g>
      <circle class="affiliate-artwork__spark spark-one" cx="494" cy="379" r="6" fill="#7c5cff" />
      <circle class="affiliate-artwork__spark spark-two" cx="112" cy="208" r="5" fill="#ff7043" />
    </svg>
  )
  return (
    <div class="affiliate-page-wrap">
      <TopNav openSettings={props?.openSettings} class="affiliate-topnav" />
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
            <main class="affiliate-portal affiliate-portal--welcome">
              <section class="affiliate-welcome">
                <div class="affiliate-welcome__copy">
                  <div class="affiliate-eyebrow">
                    <Sparkles size={14} />
                    Pitch partner program
                  </div>
                  <h1>
                    Share great work.
                    <br />
                    Make more of it.
                  </h1>
                  <p class="affiliate-lede">
                    Invite creators to Pitch. They get extra credits to start, and you earn credits
                    every time a referral signs up or upgrades.
                  </p>
                  <div class="affiliate-welcome__actions">
                    <button
                      class="affiliate-primary-action"
                      disabled={registering()}
                      onClick={() => void register()}
                    >
                      {registering() ? 'Creating your link...' : 'Activate my referral link'}
                      <ArrowRight size={17} />
                    </button>
                    <a
                      class="affiliate-text-link"
                      href="/affiliates"
                      target="_blank"
                      rel="noopener"
                    >
                      Program details <ArrowUpRight size={15} />
                    </a>
                  </div>
                  <Show when={error()}>
                    <p class="affiliate-error" role="alert">
                      {error()}
                    </p>
                  </Show>
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
                <div class="affiliate-welcome__visual">
                  <ReferralArtwork />
                </div>
              </section>
              <section class="affiliate-reward-strip" aria-label="Program rewards">
                <div>
                  <span class="affiliate-reward-strip__icon">
                    <UserPlus size={19} />
                  </span>
                  <p>
                    <strong>+1 credit</strong>
                    <span>when a friend signs up</span>
                  </p>
                </div>
                <ArrowRight class="affiliate-reward-strip__arrow" size={18} />
                <div>
                  <span class="affiliate-reward-strip__icon">
                    <CircleDollarSign size={19} />
                  </span>
                  <p>
                    <strong>+8 credits</strong>
                    <span>when they first purchase</span>
                  </p>
                </div>
                <ArrowRight class="affiliate-reward-strip__arrow" size={18} />
                <div>
                  <span class="affiliate-reward-strip__icon">
                    <Gift size={19} />
                  </span>
                  <p>
                    <strong>More videos</strong>
                    <span>credited to your wallet</span>
                  </p>
                </div>
              </section>
            </main>
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
              <main class="affiliate-portal affiliate-dashboard">
                <header class="affiliate-dashboard__header">
                  <div>
                    <div class="affiliate-eyebrow">
                      <Sparkles size={14} /> Affiliate portal
                    </div>
                    <h1>Your referrals</h1>
                    <p>Track your reach, share your link, and turn recommendations into credits.</p>
                  </div>
                  <span class="affiliate-status">
                    <i /> {affiliate().status || 'Active'}
                  </span>
                </header>
                <section class="affiliate-link-card">
                  <div class="affiliate-link-card__content">
                    <span class="affiliate-link-card__icon">
                      <Link2 size={21} />
                    </span>
                    <div>
                      <p class="affiliate-link-card__label">Your unique referral link</p>
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
                        <h2>{stats().videosEarned} free videos earned</h2>
                      </div>
                    </div>
                    <p class="affiliate-progress-card__copy">
                      Your {stats().creditsEarned.toLocaleString()} earned credits are already in
                      your wallet and ready for the next project.
                    </p>
                  </div>
                  <div class="affiliate-credit-orbit" aria-hidden="true">
                    <span>{stats().creditsEarned.toLocaleString()}</span>
                    <small>credits</small>
                    <i />
                  </div>
                </section>
                <Show when={error()}>
                  <p class="affiliate-error" role="alert">
                    {error()}
                  </p>
                </Show>
              </main>
            )
          }}
        </Show>
      </Show>
    </div>
  )
}
