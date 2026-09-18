import { useNavigate, useSearchParams } from '@solidjs/router'
import { ArrowUpRight, Check, Globe, Lock, Maximize, Plus, RefreshCw, Trash2 } from 'lucide-solid'
import { createSignal, For, onCleanup, onMount, Show } from 'solid-js'
import { API_URL } from '../../config'
import { api } from '../../lib/api'
import { useAuth } from '../core/auth'
import { CreditChip } from './credits'
import { Dialog, Loading } from './primitives'
import '../../styles/sessions.css'

interface Profile {
  loggedInOrigins: string[]
  lastSyncedAt: string | null
}
interface Session {
  id?: string
  sessionId?: string
  status: string
  startUrl?: string | null
  noVncUrl?: string | null
  expiresAt: string
}
interface ProfileResponse {
  profile: Profile
  activeSessions: Session[]
}

function BrowserViewer(props: { profileId: string }) {
  const { getToken } = useAuth()
  const [status, setStatus] = createSignal('Authenticating...')
  let container!: HTMLDivElement
  let wrapper!: HTMLDivElement
  let rfb: any
  onMount(() => {
    let active = true
    void (async () => {
      try {
        const token = await getToken()
        if (!token) throw new Error('Not authenticated')
        setStatus('Connecting...')
        const module = await import('@novnc/novnc')
        if (!active) return
        const path = `/browser/profiles/${props.profileId}/vnc?token=${encodeURIComponent(token)}`
        const ws = API_URL.startsWith('http')
          ? API_URL.replace(/^http/, 'ws') + path
          : `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}${API_URL}${path}`
        rfb = new module.default(container, ws, { wsProtocols: ['binary'] })
        rfb.scaleViewport = true
        rfb.showDotCursor = true
        rfb.addEventListener('connect', () => setStatus(''))
        rfb.addEventListener('disconnect', () => setStatus('Disconnected'))
      } catch {
        setStatus('Connection failed')
      }
    })()
    onCleanup(() => {
      active = false
      rfb?.disconnect()
    })
  })
  return (
    <div ref={wrapper} class="group relative h-full w-full bg-black">
      <div ref={container} class="h-full w-full" />
      <Show when={status()}>
        <div class="absolute inset-0 flex items-center justify-center bg-gray-900/80 text-xs text-white">
          {status()}
        </div>
      </Show>
      <button
        aria-label="Fullscreen browser"
        class="absolute bottom-4 right-4 rounded-lg bg-black/50 p-2 text-white opacity-0 group-hover:opacity-100"
        onClick={() => void wrapper.requestFullscreen?.()}
      >
        <Maximize size={15} />
      </button>
    </div>
  )
}

export function SessionsView() {
  const { getToken } = useAuth()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [profile, setProfile] = createSignal<Profile | null>(null)
  const [session, setSession] = createSignal<Session | null>(null)
  const [loading, setLoading] = createSignal(true)
  const [modal, setModal] = createSignal(false)
  const [url, setUrl] = createSignal('')
  const [urlError, setUrlError] = createSignal('')
  const [starting, setStarting] = createSignal(false)
  const [closing, setClosing] = createSignal(false)
  const [error, setError] = createSignal('')
  const [deleting, setDeleting] = createSignal('')
  const returnPath =
    params.from === 'project' && params.project
      ? `/p/${params.project}`
      : params.from === 'new'
        ? '/new'
        : null
  const load = async () => {
    try {
      const token = await getToken()
      if (!token) return
      const data = await api.get<ProfileResponse>('/browser/profile', token)
      setProfile(data.profile)
      setSession(data.activeSessions[0] ?? null)
      setError('')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Failed to load profile')
    } finally {
      setLoading(false)
    }
  }
  onMount(() => {
    if (params.url) {
      setUrl(typeof params.url === 'string' ? params.url : (params.url[0] ?? ''))
      setModal(true)
      setParams({})
    }
    void load()
    const timer = window.setInterval(() => session() && void load(), 5000)
    onCleanup(() => clearInterval(timer))
  })
  const start = async () => {
    let value = url().trim()
    if (!/^https?:\/\//i.test(value)) value = `https://${value}`
    try {
      const parsed = new URL(value)
      if (
        !['http:', 'https:'].includes(parsed.protocol) ||
        !parsed.hostname ||
        /\s|%20/i.test(value)
      )
        throw new Error('Invalid URL')
    } catch {
      setUrlError("That doesn't look like a valid URL.")
      return
    }
    setUrlError('')
    setStarting(true)
    try {
      const token = await getToken()
      if (!token) throw new Error('Not authenticated')
      setSession(await api.post<Session>('/browser/sessions', token, { startUrl: value }))
      setModal(false)
      window.dispatchEvent(new Event('credits-changed'))
    } catch (reason) {
      setUrlError(reason instanceof Error ? reason.message : 'Failed to start session')
    } finally {
      setStarting(false)
    }
  }
  const close = async () => {
    const active = session()
    if (!active) return
    setClosing(true)
    try {
      const token = await getToken()
      if (!token) return
      await api.post(`/browser/sessions/${active.sessionId ?? active.id}/close`, token, {})
      setSession(null)
      await load()
      if (returnPath) navigate(returnPath)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not save the session')
    } finally {
      setClosing(false)
    }
  }
  const remove = async (origin: string) => {
    setDeleting(origin)
    try {
      const token = await getToken()
      if (!token) return
      await api.delete(`/browser/origins?origin=${encodeURIComponent(origin)}`, token)
      setProfile(current =>
        current
          ? { ...current, loggedInOrigins: current.loggedInOrigins.filter(item => item !== origin) }
          : null,
      )
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not remove the login')
    } finally {
      setDeleting('')
    }
  }
  return (
    <div class="sessions-page">
      <div class="sessions-topbar">
        <Globe size={15} />
        <span>Browser sessions</span>
      </div>
      <div class="sessions-content">
        <header class="sessions-header">
          <div>
            <p class="sessions-eyebrow">Your connected workspace</p>
            <h1>Pick up where you signed in.</h1>
            <p class="sessions-description">
              Connect your sites once. Pitch can use your saved logins whenever your work needs
              them.
            </p>
          </div>
          <button
            id="add-login-btn"
            disabled={!!session()}
            class="sessions-primary sessions-connect"
            onClick={() => setModal(true)}
          >
            <Plus size={16} />
            Connect a site
            <CreditChip amount={80} class="sessions-credit" />
          </button>
        </header>
        <Show when={error()}>
          <p class="sessions-error" role="alert">
            {error()}
          </p>
        </Show>
        <Show when={!loading()} fallback={<Loading />}>
          <Show when={session()}>
            {active => (
              <section class="sessions-card sessions-live">
                <div class="sessions-section-heading">
                  <div>
                    <span class="sessions-live-label">
                      <span />
                      Browser open
                    </span>
                    <h2>Sign in, then save your session.</h2>
                  </div>
                  <button
                    class="sessions-primary"
                    disabled={closing()}
                    onClick={() => void close()}
                  >
                    <Check size={13} />
                    {closing() ? 'Finishing...' : 'Complete & Save'}
                  </button>
                </div>
                <div class="sessions-browser">
                  <Show
                    when={active().noVncUrl}
                    fallback={<Loading label="Initializing remote display..." />}
                  >
                    {id => <BrowserViewer profileId={id()} />}
                  </Show>
                </div>
              </section>
            )}
          </Show>
          <section class="sessions-card sessions-sites">
            <div class="sessions-section-heading">
              <div class="sessions-section-title">
                <h2>Connected sites</h2>
                <span class="sessions-count">{profile()?.loggedInOrigins.length ?? 0}</span>
              </div>
              <span class="sessions-section-note">Ready for your next project</span>
            </div>
            <Show
              when={profile()?.loggedInOrigins.length}
              fallback={
                <div class="sessions-empty">
                  <div class="sessions-empty-icon">
                    <Globe size={28} strokeWidth={1.3} />
                    <span>
                      <Lock size={12} />
                    </span>
                  </div>
                  <h3>Your workspace, connected.</h3>
                  <p>
                    Add a site you use for work. Sign in through the browser and save it for your
                    next project.
                  </p>
                  <button
                    class="sessions-empty-action"
                    disabled={!!session()}
                    onClick={() => setModal(true)}
                  >
                    Connect your first site <ArrowUpRight size={15} />
                  </button>
                </div>
              }
            >
              <ul class="sessions-list">
                <For each={profile()?.loggedInOrigins}>
                  {origin => (
                    <li class="sessions-origin">
                      <span class="sessions-site-icon">
                        <Globe size={19} strokeWidth={1.5} />
                      </span>
                      <div class="sessions-site-copy">
                        <span>{new URL(origin).host}</span>
                        <small>Saved browser login</small>
                      </div>
                      <span class="sessions-saved">
                        <Check size={12} />
                        Connected
                      </span>
                      <button
                        class="sessions-remove"
                        aria-label={`Remove ${origin}`}
                        title="Remove saved login"
                        disabled={deleting() === origin}
                        onClick={() => void remove(origin)}
                      >
                        {deleting() === origin ? (
                          <RefreshCw class="animate-spin" size={14} />
                        ) : (
                          <Trash2 size={14} />
                        )}
                      </button>
                    </li>
                  )}
                </For>
              </ul>
            </Show>
          </section>
          <div class="sessions-how">
            <p class="sessions-eyebrow">A little setup. A smoother workflow.</p>
            <ol>
              <li>
                <span>01</span>
                <div>
                  <h3>Open your site</h3>
                  <p>Enter a URL to launch a browser.</p>
                </div>
              </li>
              <li>
                <span>02</span>
                <div>
                  <h3>Sign in as usual</h3>
                  <p>Log in directly on the website.</p>
                </div>
              </li>
              <li>
                <span>03</span>
                <div>
                  <h3>Save and create</h3>
                  <p>Your login is ready for Pitch to use.</p>
                </div>
              </li>
            </ol>
          </div>
        </Show>
      </div>
      <Dialog
        open={modal()}
        title="Connect a site"
        class="sessions-dialog"
        onClose={() => setModal(false)}
      >
        <form
          noValidate
          onSubmit={event => {
            event.preventDefault()
            if (!starting()) void start()
          }}
        >
          <span class="sessions-site-icon">
            <Globe size={21} />
          </span>
          <h2>Connect a site</h2>
          <p class="sessions-description">
            Open your site, sign in, and save the session for Pitch to use.
          </p>
          <label class="sessions-input-label" for="session-site-url">
            Website URL
          </label>
          <input
            id="session-site-url"
            aria-label="Site URL"
            aria-invalid={!!urlError()}
            aria-describedby={urlError() ? 'session-url-error' : undefined}
            required
            autofocus
            type="url"
            class="sessions-input"
            placeholder="https://example.com"
            value={url()}
            onInput={event => {
              setUrl(event.currentTarget.value)
              setUrlError('')
            }}
          />
          <Show when={urlError()}>
            <p id="session-url-error" class="sessions-error" role="alert">
              {urlError()}
            </p>
          </Show>
          <p class="sessions-cost">
            <CreditChip amount={80} class="sessions-credit" /> credits per browser session
          </p>
          <div class="sessions-dialog-actions">
            <button type="button" class="sessions-secondary" onClick={() => setModal(false)}>
              Cancel
            </button>
            <button type="submit" class="sessions-primary" disabled={starting()}>
              {starting() ? 'Starting browser...' : 'Open browser'}
            </button>
          </div>
        </form>
      </Dialog>
    </div>
  )
}
