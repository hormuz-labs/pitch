import { createMemo, createSignal, onMount, Show } from 'solid-js'
import { API_URL } from '../../../config'
import { useAuth, useClerk, useUser } from '../../core/auth'
import { DiscordIcon } from '../../public/brand'
import {
  discordConnectionIssue,
  isClerkReverificationRequired,
  linkedDiscordAccount,
  resumableDiscordVerificationUrl,
} from './discord-connection'

interface DiscordReward {
  state: 'unlinked' | 'available' | 'claimed' | 'discord-claimed'
  credits: number
  configured: boolean
  claimedAt: string | null
}

export function DiscordConnectionSection() {
  const { getToken } = useAuth()
  const clerk = useClerk()
  const { userAccessor: user } = useUser()
  const [connecting, setConnecting] = createSignal(false)
  const [error, setError] = createSignal('')
  const [reward, setReward] = createSignal<DiscordReward | null>(null)
  const [loadingReward, setLoadingReward] = createSignal(true)
  const [claiming, setClaiming] = createSignal(false)
  const [message, setMessage] = createSignal('')
  const linked = createMemo(() => linkedDiscordAccount(user()?.externalAccounts ?? []))
  const connectionIssue = createMemo(() => discordConnectionIssue(user()?.externalAccounts ?? []))

  const requestReward = async <T,>(method: 'GET' | 'POST'): Promise<T> => {
    const token = await getToken()
    if (!token) throw new Error('Sign in to claim your Discord reward.')
    // A Discord outage should stay local to this card, not open ConnectionGate.
    const response = await fetch(`${API_URL}/credits/discord${method === 'POST' ? '/claim' : ''}`, {
      method,
      headers: { Authorization: `Bearer ${token}` },
    })
    const body = await response.json()
    if (!response.ok) throw new Error(body.error || 'Could not check your Discord reward.')
    return body
  }

  const loadReward = async () => {
    setLoadingReward(true)
    setError('')
    try {
      setReward(await requestReward<DiscordReward>('GET'))
    } catch (reason) {
      setReward(null)
      setError(reason instanceof Error ? reason.message : 'Could not check your Discord reward.')
    } finally {
      setLoadingReward(false)
    }
  }

  const claim = async () => {
    if (claiming() || reward()?.state !== 'available') return
    setClaiming(true)
    setError('')
    try {
      const result = await requestReward<{ granted: boolean; credits: number }>('POST')
      setReward(current => current && { ...current, state: 'claimed' })
      setMessage(
        result.granted
          ? `${result.credits} credits added to your Pitch balance. You’re ready to create.`
          : 'Your Discord welcome credits have already been added to your Pitch balance.',
      )
      window.dispatchEvent(new Event('credits-changed'))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not claim your Discord reward.')
    } finally {
      setClaiming(false)
    }
  }

  const reloadAndSync = async () => {
    const current = user()
    if (!current) return
    await current.reload()
    const token = await getToken({ skipCache: true })
    if (!token) throw new Error('Could not authenticate the Discord connection')
    const response = await fetch(`${API_URL}/users/sync`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: '{}',
    })
    if (!response.ok)
      throw new Error('Discord was linked, but Pitch could not refresh your profile')
    await loadReward()
  }

  onMount(() => {
    if (sessionStorage.getItem('pitch_discord_link_pending')) {
      sessionStorage.removeItem('pitch_discord_link_pending')
      void reloadAndSync().catch(reason => {
        setLoadingReward(false)
        setError(reason instanceof Error ? reason.message : 'Could not refresh Discord')
      })
    } else {
      void loadReward()
    }
  })

  const connect = async () => {
    const current = user()
    if (!current || connecting()) return
    setConnecting(true)
    setError('')
    try {
      const pendingVerificationUrl = resumableDiscordVerificationUrl(current.externalAccounts)
      if (pendingVerificationUrl) {
        sessionStorage.setItem('pitch_discord_link_pending', '1')
        window.location.assign(pendingVerificationUrl.href)
        return
      }

      const account = await current.createExternalAccount({
        strategy: 'oauth_discord',
        redirectUrl: `${window.location.origin}/sso-callback`,
      })
      const verificationUrl = account.verification?.externalVerificationRedirectURL
      if (verificationUrl) {
        sessionStorage.setItem('pitch_discord_link_pending', '1')
        window.location.assign(verificationUrl.href)
        return
      }
      await reloadAndSync()
    } catch (reason) {
      if (isClerkReverificationRequired(reason)) {
        clerk.__internal_openReverification({
          afterVerification: () => void connect(),
          afterVerificationCancelled: () =>
            setError('Verification is required to connect Discord.'),
        })
        return
      }
      setError(reason instanceof Error ? reason.message : 'Could not connect Discord')
    } finally {
      setConnecting(false)
    }
  }

  return (
    <section class="settings-card settings-connection">
      <div class="settings-connection__provider">
        <i aria-hidden="true">
          <DiscordIcon size={20} />
        </i>
        <span>
          <strong>Discord</strong>
          <small>Join the community and get 120 welcome credits to use in Pitch.</small>
        </span>
        <Show
          when={linked()}
          fallback={
            <button class="settings-primary" disabled={connecting()} onClick={() => void connect()}>
              {connecting() ? 'Connecting…' : 'Connect'}
            </button>
          }
        >
          {account => (
            <span class="settings-connection__linked">
              <b>Linked</b>
              <small>{account().handle}</small>
            </span>
          )}
        </Show>
      </div>
      <div class="settings-discord-reward">
        <Show
          when={reward()?.state === 'claimed'}
          fallback={
            <>
              <ol>
                <li>Connect the Discord account you use in our server.</li>
                <li>Join the Pitch community and accept the server rules.</li>
                <li>Come back here and claim your {reward()?.credits ?? 120} credits.</li>
              </ol>
              <div class="settings-discord-reward__actions">
                <a
                  class="settings-secondary"
                  href="https://discord.gg/a4SBW36mD"
                  target="_blank"
                  rel="noreferrer"
                >
                  Join Discord server
                </a>
                <button
                  class="settings-primary"
                  disabled={
                    loadingReward() ||
                    connecting() ||
                    claiming() ||
                    !reward()?.configured ||
                    reward()?.state !== 'available'
                  }
                  onClick={() => void claim()}
                >
                  {claiming()
                    ? 'Checking membership…'
                    : loadingReward()
                      ? 'Loading…'
                      : 'Claim welcome credits'}
                </button>
              </div>
              <Show when={reward()?.state === 'discord-claimed'}>
                <p>This Discord account has already claimed the welcome reward.</p>
              </Show>
              <Show when={reward() && !reward()!.configured}>
                <p>Discord rewards are not available yet. Please check back soon.</p>
              </Show>
              <small>
                One-time reward per Pitch and Discord account. These are regular Pitch credits, with
                no daily reset.
              </small>
            </>
          }
        >
          <p class="settings-field__success" role="status">
            {message() ||
              'Your Discord welcome reward has been claimed. The credits were added to your regular Pitch balance.'}
          </p>
          <a href="https://discord.gg/a4SBW36mD" target="_blank" rel="noreferrer">
            Open the Pitch community
          </a>
        </Show>
      </div>
      <Show when={error() || connectionIssue()}>
        {message => (
          <p class="settings-error" role="alert">
            {message()}
          </p>
        )}
      </Show>
      <Show when={error() && !reward() && !loadingReward()}>
        <button class="settings-secondary" onClick={() => void loadReward()}>
          Try again
        </button>
      </Show>
    </section>
  )
}
