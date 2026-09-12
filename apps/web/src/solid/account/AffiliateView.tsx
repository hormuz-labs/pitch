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
              <section class="affiliate-welcome" aria-labelledby="affiliate-welcome-title">
                <div class="affiliate-welcome__copy">
                  <div class="affiliate-eyebrow">
                    <Sparkles size={14} />
                    Pitch partner program
                  </div>
                  <h1 id="affiliate-welcome-title">
                    <span>Share great work.</span>
                    <span>Make more of it.</span>
                  </h1>
                  <p class="affiliate-lede">
                    Invite creators to Pitch. They get extra credits to start, and you earn credits
                    every time a referral signs up or upgrades.
                  </p>
                  <div class="affiliate-welcome__actions">
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
                <aside class="affiliate-welcome__visual" aria-label="How your referral link works">
                  <div class="affiliate-preview-heading">
                    <span class="affiliate-eyebrow">A little word of mouth.</span>
                    <ArrowUpRight size={18} aria-hidden="true" />
                  </div>
                  <div class="affiliate-pass">
                    <div class="affiliate-pass__header">
                      <span class="affiliate-pass__symbol">
                        <Link2 size={22} />
                      </span>
                      <span>Creator to creator</span>
                      <Sparkles size={16} aria-hidden="true" />
                    </div>
                    <p class="affiliate-pass__title">Good work travels.</p>
                    <p class="affiliate-pass__copy">Your next project starts with a connection.</p>
                    <div class="affiliate-pass__link">
                      <span>
                        trypitch.co/r/<strong>you</strong>
                      </span>
                      <ArrowUpRight size={17} aria-hidden="true" />
                    </div>
                    <div class="affiliate-pass__footer">
                      <span>Your personal referral link</span>
                      <span>Preview</span>
                    </div>
                  </div>
                  <div class="affiliate-connection" aria-hidden="true">
                    <span />
                    <ArrowRight size={16} />
                    <span />
                  </div>
                  <div class="affiliate-preview-reward">
                    <span class="affiliate-preview-reward__icon">
                      <Gift size={20} />
                    </span>
                    <div>
                      <strong>They create. You earn.</strong>
                      <p>Rewards go straight to your wallet.</p>
                    </div>
                    <BadgeCheck size={19} aria-hidden="true" />
                  </div>
                  <p class="affiliate-preview-caption">
                    More connections. More creative possibilities.
                  </p>
                </aside>
              </section>
              <div class="affiliate-section-heading">
                <h2>A good recommendation goes further.</h2>
                <span>Share. Earn. Create.</span>
              </div>
              <section class="affiliate-reward-strip" aria-label="Program rewards">
                <div>
                  <span class="affiliate-reward-strip__icon">
                    <UserPlus size={19} />
                  </span>
                  <div class="affiliate-reward-strip__content">
                    <span class="affiliate-reward-strip__label">01 / The introduction</span>
                    <strong>+1 credit</strong>
                    <p>For every friend who signs up through your link.</p>
                  </div>
                </div>
                <div>
                  <span class="affiliate-reward-strip__icon">
                    <CircleDollarSign size={19} />
                  </span>
                  <div class="affiliate-reward-strip__content">
                    <span class="affiliate-reward-strip__label">02 / Their next step</span>
                    <strong>+8 credits</strong>
                    <p>When your referral makes their first purchase.</p>
                  </div>
                </div>
                <div>
                  <span class="affiliate-reward-strip__icon">
                    <Gift size={19} />
                  </span>
                  <div class="affiliate-reward-strip__content">
                    <span class="affiliate-reward-strip__label">03 / Your next idea</span>
                    <strong>More room to create</strong>
                    <p>Put your earned credits toward your next project.</p>
                  </div>
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
