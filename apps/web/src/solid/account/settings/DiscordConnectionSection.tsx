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

export function DiscordConnectionSection() {
  const { getToken } = useAuth()
  const clerk = useClerk()
  const { userAccessor: user } = useUser()
  const [connecting, setConnecting] = createSignal(false)
  const [error, setError] = createSignal('')
  const linked = createMemo(() => linkedDiscordAccount(user()?.externalAccounts ?? []))
  const connectionIssue = createMemo(() => discordConnectionIssue(user()?.externalAccounts ?? []))

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
  }

  onMount(() => {
    if (sessionStorage.getItem('pitch_discord_link_pending')) {
      sessionStorage.removeItem('pitch_discord_link_pending')
      void reloadAndSync().catch(reason => {
        setError(reason instanceof Error ? reason.message : 'Could not refresh Discord')
      })
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
          <small>Use /video in Discord and find the result in your Pitch chats.</small>
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
      <Show when={error() || connectionIssue()}>
        {message => <p class="settings-error">{message()}</p>}
      </Show>
    </section>
  )
}
