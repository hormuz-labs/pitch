import { A } from '@solidjs/router'
import { ArrowUpRight, Gift, Link2, Send } from 'lucide-solid'
import { createResource, createSignal, For, Show } from 'solid-js'
import { api, isApiError } from '../../../lib/api'
import { REFERRAL_REWARDS } from '../../../lib/referral'
import { useAuth } from '../../core/auth'
import { CopyButton } from '../primitives'

interface Affiliate {
  code: string
  status: string
  stats: { clicks: number; signups: number; conversions: number; creditsEarned: number }
}

export function RewardsSection() {
  const { getToken } = useAuth()
  const [promoCode, setPromoCode] = createSignal('')
  const [redeeming, setRedeeming] = createSignal(false)
  const [redeemMessage, setRedeemMessage] = createSignal('')
  const [redeemError, setRedeemError] = createSignal('')

  const [inviteEmail, setInviteEmail] = createSignal('')
  const [inviting, setInviting] = createSignal(false)
  const [inviteMessage, setInviteMessage] = createSignal('')
  const [inviteError, setInviteError] = createSignal('')

  const [affiliate, { refetch }] = createResource(async () => {
    const token = await getToken()
    if (!token) return null
    try {
      return await api.get<Affiliate>('/affiliate/me', token)
    } catch (err) {
      if (isApiError(err) && err.status === 404) {
        await api.post('/affiliate/register', token)
        return api.get<Affiliate>('/affiliate/me', token)
      }
      throw err
    }
  })

  const url = () =>
    affiliate()
      ? `${location.hostname === 'localhost' ? 'http://localhost:5173' : 'https://trypitch.co'}/r/${affiliate()!.code}`
      : ''
  const fmt = (n: number) => n.toLocaleString('en-US')

  const redeem = async (event: SubmitEvent) => {
    event.preventDefault()
    setRedeeming(true)
    setRedeemError('')
    setRedeemMessage('')
    try {
      const token = await getToken()
      if (!token) return
      const result = await api.post<{ credits: number; balance: number }>('/promo/redeem', token, {
        code: promoCode(),
      })
      setRedeemMessage(`+${result.credits} credits added.`)
      setPromoCode('')
      window.dispatchEvent(new Event('credits-changed'))
    } catch (err) {
      setRedeemError(isApiError(err) ? err.message : 'Could not redeem that code.')
    } finally {
      setRedeeming(false)
    }
  }

  const sendInvite = async (event: SubmitEvent) => {
    event.preventDefault()
    if (inviting() || affiliate.loading || affiliate.error || !affiliate()) return
    setInviting(true)
    setInviteError('')
    setInviteMessage('')
    try {
      const token = await getToken()
      if (!token) throw new Error('Sign in again to send an invite.')
      const result = await api.post<{ sent: boolean }>('/affiliate/invite', token, {
        email: inviteEmail().trim(),
      })
      if (!result.sent) throw new Error('The invite was not sent. Please try again.')
      setInviteMessage('Invite sent. Your referral link is on its way.')
      setInviteEmail('')
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : 'Could not send that invite.')
    } finally {
      setInviting(false)
    }
  }

  // Read the resource only once it has loaded: reading it earlier suspends the section.
  const stat = () =>
    ready() ? affiliate()!.stats : { signups: 0, conversions: 0, creditsEarned: 0 }
  const ready = () => !affiliate.loading && !affiliate.error && affiliate()?.status === 'active'

  return (
    <>
      <section class="settings-card settings-referral">
        <div class="settings-card__title">
          <Link2 size={16} />
          Your referral link
        </div>
        <p>
          Earn <strong>{REFERRAL_REWARDS.signup} credits</strong> when someone signs up through your
          link and <strong>{REFERRAL_REWARDS.purchase} more</strong> on their first purchase. No cap
          on referrals.
        </p>
        <Show
          when={ready()}
          fallback={
            <Show
              when={affiliate.error}
              fallback={
                <p class="settings-empty settings-empty--inline" role="status">
                  {affiliate.loading
                    ? 'Loading your link…'
                    : 'Referral links are unavailable for this account.'}
                </p>
              }
            >
              <div class="settings-referral__retry">
                <p class="settings-field__error" role="alert">
                  Could not load your rewards account.
                </p>
                <button type="button" class="settings-secondary" onClick={() => void refetch()}>
                  Try again
                </button>
              </div>
            </Show>
          }
        >
          <div class="settings-referral__link">
            <code title={url()}>{url()}</code>
            <CopyButton value={url()} label="Copy link" />
          </div>
        </Show>
        <A href="/affiliates" class="settings-referral__more">
          Full stats and program details <ArrowUpRight size={13} />
        </A>
      </section>

      <section class="settings-card">
        <div class="settings-card__title">
          <Send size={15} />
          Invite by email
        </div>
        <p>We send them your referral link; the same rewards apply.</p>
        <form class="settings-inline-form" onSubmit={event => void sendInvite(event)}>
          <input
            type="email"
            required
            aria-label="Invite email address"
            placeholder="name@example.com"
            value={inviteEmail()}
            onInput={event => setInviteEmail(event.currentTarget.value)}
          />
          <button
            type="submit"
            class="is-primary"
            disabled={inviting() || !ready() || !inviteEmail().trim()}
          >
            {inviting() ? 'Sending…' : 'Send invite'}
          </button>
        </form>
        <Show when={inviteMessage()}>
          <small class="settings-field__success" role="status">
            {inviteMessage()}
          </small>
        </Show>
        <Show when={inviteError()}>
          <small class="settings-field__error" role="alert">
            {inviteError()}
          </small>
        </Show>
      </section>

      <section class="settings-card">
        <h4>Your referrals</h4>
        <div class="settings-stat-grid">
          <For
            each={[
              ['Signups', fmt(stat().signups ?? 0)],
              ['Purchases', fmt(stat().conversions ?? 0)],
              ['Credits earned', `+${fmt(stat().creditsEarned ?? 0)}`],
            ]}
          >
            {([label, value], i) => (
              <div>
                <span>{label}</span>
                <strong class={i() === 2 && (stat().creditsEarned ?? 0) > 0 ? 'is-positive' : ''}>
                  {ready() ? value : '—'}
                </strong>
              </div>
            )}
          </For>
        </div>
        <Show when={ready() && !affiliate()!.stats.signups && !affiliate()!.stats.conversions}>
          <p class="settings-note">No referrals yet. Share your link to start earning.</p>
        </Show>
      </section>

      <section class="settings-card">
        <div class="settings-card__title">
          <Gift size={16} />
          Promo code
        </div>
        <p>Have a code? Redeem it for credits. Each code works once per account.</p>
        <form class="settings-inline-form" onSubmit={event => void redeem(event)}>
          <input
            type="text"
            aria-label="Promo code"
            placeholder="Enter promo code"
            value={promoCode()}
            onInput={event => setPromoCode(event.currentTarget.value)}
          />
          <button type="submit" disabled={redeeming() || !promoCode().trim()}>
            {redeeming() ? 'Redeeming…' : 'Redeem'}
          </button>
        </form>
        <Show when={redeemMessage()}>
          <small class="settings-field__success">{redeemMessage()}</small>
        </Show>
        <Show when={redeemError()}>
          <small class="settings-field__error">{redeemError()}</small>
        </Show>
      </section>
    </>
  )
}
