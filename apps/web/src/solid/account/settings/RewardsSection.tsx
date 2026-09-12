import { Gift } from 'lucide-solid'
import { createResource, createSignal, Show } from 'solid-js'
import { api, isApiError } from '../../../lib/api'
import { useAuth } from '../../core/auth'

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

  return (
    <>
      <section class="settings-card">
        <div class="settings-card__title">
          <Gift size={16} />
          Have a promo code?
        </div>
        <p>
          Enter a promo code to add free credits to your account. Each code can be redeemed once per
          account.
        </p>
        <form class="settings-inline-form" onSubmit={event => void redeem(event)}>
          <input
            type="text"
            placeholder="Enter promo code"
            value={promoCode()}
            onInput={event => setPromoCode(event.currentTarget.value)}
          />
          <button type="submit" disabled={redeeming() || !promoCode().trim()}>
            Redeem
          </button>
        </form>
        <Show when={redeemMessage()}>
          <small class="settings-field__success">{redeemMessage()}</small>
        </Show>
        <Show when={redeemError()}>
          <small class="settings-field__error">{redeemError()}</small>
        </Show>
      </section>

      <p class="settings-note">
        Invite as many people as you want — there's no limit. You earn 40 reward credits each time
        someone you invited makes their first purchase.
      </p>

      <section class="settings-card">
        <div class="settings-card__title">Send reward invite</div>
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
            disabled={
              inviting() ||
              affiliate.loading ||
              !!affiliate.error ||
              !affiliate() ||
              affiliate()?.status !== 'active' ||
              !inviteEmail().trim()
            }
          >
            {inviting() ? 'Sending…' : affiliate.loading ? 'Loading…' : 'Send invite'}
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
        <small>
          Each invite email contains your referral link. You earn credits once they make their first
          purchase.
        </small>
      </section>

      <section class="settings-card settings-activity">
        <h4>Recent reward activity</h4>
        <Show
          when={!affiliate.loading}
          fallback={
            <p class="settings-empty" role="status">
              Loading rewards…
            </p>
          }
        >
          <Show
            when={!affiliate.error}
            fallback={
              <div>
                <p class="settings-field__error" role="alert">
                  Could not load your rewards account.
                </p>
                <button type="button" class="settings-secondary" onClick={() => void refetch()}>
                  Try again
                </button>
              </div>
            }
          >
            <Show
              when={affiliate()?.status === 'active'}
              fallback={
                <p class="settings-empty">Reward invitations are unavailable for this account.</p>
              }
            >
              <Show
                when={
                  affiliate() &&
                  (affiliate()!.stats.signups > 0 || affiliate()!.stats.conversions > 0)
                }
                fallback={
                  <p class="settings-empty">
                    No referrals yet. Invite friends — you earn credits when they make their first
                    purchase.
                  </p>
                }
              >
                <div>
                  <span>
                    <strong>Signups</strong>
                  </span>
                  <b>{affiliate()!.stats.signups}</b>
                </div>
                <div>
                  <span>
                    <strong>Purchases</strong>
                  </span>
                  <b>{affiliate()!.stats.conversions}</b>
                </div>
                <div>
                  <span>
                    <strong>Credits earned</strong>
                  </span>
                  <b class="is-positive">+{affiliate()!.stats.creditsEarned}</b>
                </div>
              </Show>
            </Show>
          </Show>
        </Show>
      </section>
    </>
  )
}
