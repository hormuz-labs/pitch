import { useNavigate, useSearchParams } from '@solidjs/router'
import { Check, Globe, Lock, Maximize, Plus, RefreshCw, Shield, Trash2 } from 'lucide-solid'
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
    <div class="sessions-page min-h-full px-4 py-6 sm:px-6 lg:px-10">
      <div class="mx-auto max-w-[1100px]">
        <header class="sessions-header mb-7 flex flex-wrap items-end justify-between gap-5 border-b pb-7">
          <div>
            <p class="text-[11px] uppercase tracking-[.16em] text-gray-500">Browser access</p>
            <h1 class="text-[34px] font-semibold tracking-[-.04em]">
              Keep your signed-in sites ready.
            </h1>
            <p class="mt-2 text-sm text-gray-500">
              Authenticate a private site once so the agent can reuse the login.
            </p>
          </div>
          <button
            id="add-login-btn"
            disabled={!!session()}
            class="sessions-primary flex shrink-0 items-center gap-2 rounded-xl px-4 py-2.5 text-sm disabled:opacity-50"
            onClick={() => setModal(true)}
          >
            <Plus size={14} />
            Authenticate with URL
            <CreditChip amount={80} class="bg-white text-gray-900" />
          </button>
        </header>
        <Show when={error()}>
          <p class="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error()}</p>
        </Show>
        <Show when={!loading()} fallback={<Loading />}>
          <Show when={session()}>
            {active => (
              <section class="sessions-card mb-8 rounded-2xl border p-5">
                <div class="mb-4 flex items-center justify-between">
                  <b>Live authentication session</b>
                  <button
                    class="sessions-secondary flex items-center gap-2 rounded-lg border px-4 py-2 text-xs font-semibold"
                    disabled={closing()}
                    onClick={() => void close()}
                  >
                    <Check size={13} />
                    {closing() ? 'Finishing...' : 'Complete & Save'}
                  </button>
                </div>
                <div class="aspect-video overflow-hidden rounded-xl bg-gray-900">
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
          <section class="sessions-card rounded-2xl border p-5">
            <h2 class="font-semibold">Logged-in sites</h2>
            <Show
              when={profile()?.loggedInOrigins.length}
              fallback={
                <div class="py-12 text-center text-sm text-gray-500">
                  <Shield class="mx-auto mb-3 text-gray-300" />
                  No saved logins yet
                </div>
              }
            >
              <ul class="mt-4 grid gap-2 md:grid-cols-2">
                <For each={profile()?.loggedInOrigins}>
                  {origin => (
                    <li class="sessions-origin flex items-center gap-3 rounded-lg border p-3">
                      <Globe size={14} />
                      <span class="min-w-0 flex-1 truncate text-sm">{new URL(origin).host}</span>
                      <button
                        class="sessions-remove"
                        aria-label={`Remove ${origin}`}
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
        </Show>
      </div>
      <Dialog open={modal()} title="Authenticate a site" onClose={() => setModal(false)}>
        <form
          noValidate
          onSubmit={event => {
            event.preventDefault()
            if (!starting()) void start()
          }}
        >
          <div class="flex items-center gap-2">
            <Lock size={18} />
            <h2 class="text-lg font-semibold">Authenticate a site</h2>
          </div>
          <p class="my-3 text-sm text-gray-500">
            Open a secure browser, complete the login, then save the session.
          </p>
          <input
            aria-label="Site URL"
            aria-invalid={!!urlError()}
            required
            autofocus
            type="url"
            class="w-full rounded-lg border p-3 text-sm"
            placeholder="https://example.com"
            value={url()}
            onInput={event => {
              setUrl(event.currentTarget.value)
              setUrlError('')
            }}
          />
          <Show when={urlError()}>
            <p class="mt-1 text-xs text-red-600">{urlError()}</p>
          </Show>
          <div class="mt-5 flex justify-end gap-2">
            <button
              type="button"
              class="sessions-secondary rounded-lg px-4 py-2 text-sm"
              onClick={() => setModal(false)}
            >
              Cancel
            </button>
            <button
              type="submit"
              class="sessions-primary rounded-lg px-4 py-2 text-sm"
              disabled={starting()}
            >
              {starting() ? 'Starting browser...' : 'Open browser'}
            </button>
          </div>
        </form>
      </Dialog>
    </div>
  )
}
