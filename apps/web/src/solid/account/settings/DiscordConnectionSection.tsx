import { createMemo, createSignal, onCleanup, onMount, Show } from 'solid-js'
import { API_URL } from '../../../config'
import { useAuth, useClerk, useUser } from '../../core/auth'
import { DiscordIcon } from '../../public/brand'
import { DISCORD_INVITE_URL } from '../../public/socials'
import {
  DISCORD_LINK_PENDING_KEY,
  discordConnectionIssue,
  isClerkReverificationRequired,
  linkedDiscordAccount,
  startDiscordLink,
} from './discord-connection'

interface DiscordReward {
  state: 'unlinked' | 'available' | 'claimed' | 'discord-claimed'
  credits: number
  configured: boolean
  claimedAt: string | null
  granted: boolean
  blocker: string | null
}

// A linked account that still has to join: keep asking while the tab is
// open, so joining in the Discord app pays out here without another click.
const POLL_MS = 5_000
const POLL_FOR_MS = 15 * 60_000

export function DiscordConnectionSection() {
  const { getToken } = useAuth()
  const clerk = useClerk()
  const { userAccessor: user } = useUser()
  const [connecting, setConnecting] = createSignal(false)
  const [error, setError] = createSignal('')
  const [reward, setReward] = createSignal<DiscordReward | null>(null)
  const [loadingReward, setLoadingReward] = createSignal(true)
  const [justGranted, setJustGranted] = createSignal(false)
  const linked = createMemo(() => linkedDiscordAccount(user()?.externalAccounts ?? []))
  const connectionIssue = createMemo(() => discordConnectionIssue(user()?.externalAccounts ?? []))
  const waitingToJoin = () => reward()?.state === 'available' && reward()?.configured

  const loadReward = async () => {
    setError('')
    try {
      const token = await getToken()
      if (!token) throw new Error('Sign in to get your Discord welcome credits.')
      // A Discord outage should stay local to this card, not open ConnectionGate.
      const response = await fetch(`${API_URL}/credits/discord`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || 'Could not check your Discord reward.')
      setReward(body)
      if (body.granted) {
        setJustGranted(true)
        window.dispatchEvent(new Event('credits-changed'))
      }
    } catch (reason) {
      setReward(null)
      setError(reason instanceof Error ? reason.message : 'Could not check your Discord reward.')
    } finally {
      setLoadingReward(false)
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
    if (sessionStorage.getItem(DISCORD_LINK_PENDING_KEY)) {
      sessionStorage.removeItem(DISCORD_LINK_PENDING_KEY)
      void reloadAndSync().catch(reason => {
        setLoadingReward(false)
        setError(reason instanceof Error ? reason.message : 'Could not refresh Discord')
      })
    } else {
      void loadReward()
    }
    const started = Date.now()
    const poll = () => {
      if (!waitingToJoin() || document.hidden || Date.now() - started > POLL_FOR_MS) return
      void loadReward()
    }
    const timer = window.setInterval(poll, POLL_MS)
    window.addEventListener('focus', poll)
    onCleanup(() => {
      window.clearInterval(timer)
      window.removeEventListener('focus', poll)
    })
  })

  const connect = async () => {
    const current = user()
    if (!current || connecting()) return
    setConnecting(true)
    setError('')
    try {
      if ((await startDiscordLink(current)) === 'linked') await reloadAndSync()
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
          <small>
            Connect your Discord and join the Pitch server: {reward()?.credits ?? 250} welcome
            credits land in your balance on their own.
          </small>
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
        <Show when={reward()?.state === 'claimed'}>
          <p class="settings-field__success" role="status">
            {justGranted()
              ? `${reward()!.credits} credits added to your Pitch balance. You’re ready to create.`
              : 'Your Discord welcome credits are in your regular Pitch balance.'}
          </p>
          <a href={DISCORD_INVITE_URL} target="_blank" rel="noreferrer">
            Open the Pitch community
          </a>
        </Show>
        <Show when={waitingToJoin()}>
          <p>{reward()!.blocker ?? 'Join the Pitch Discord server to receive your credits.'}</p>
          <div class="settings-discord-reward__actions">
            <a class="settings-primary" href={DISCORD_INVITE_URL} target="_blank" rel="noreferrer">
              Join the Pitch server
            </a>
            <small>
              Come back to this tab afterwards; the credits arrive within a few seconds.
            </small>
          </div>
        </Show>
        <Show when={reward()?.state === 'unlinked' || (loadingReward() && !reward())}>
          <small>
            One-time reward per Pitch and Discord account. These are regular Pitch credits, with no
            daily reset.
          </small>
        </Show>
        <Show when={reward()?.state === 'discord-claimed'}>
          <p>This Discord account has already claimed the welcome reward.</p>
        </Show>
        <Show when={reward() && !reward()!.configured}>
          <p>Discord rewards are not available yet. Please check back soon.</p>
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
