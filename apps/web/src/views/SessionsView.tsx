import { useAuth } from '@clerk/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { CreditChip } from '../components/CreditChip'
import { api } from '../lib/api'
import { prettyHost } from '../lib/authOrigins'

const IconShield = () => (
  <svg
    width="40"
    height="40"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="text-gray-300"
  >
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
  </svg>
)
const IconPlus = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
)
const IconCheck = () => (
  <svg
    width="12"
    height="12"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <polyline points="20 6 9 17 4 12" />
  </svg>
)
const IconGlobe = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="12" cy="12" r="10" />
    <line x1="2" y1="12" x2="22" y2="12" />
    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
  </svg>
)
const IconSpinner = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="animate-spin"
  >
    <line x1="12" y1="2" x2="12" y2="6" />
    <line x1="12" y1="18" x2="12" y2="22" />
    <line x1="4.93" y1="4.93" x2="7.76" y2="7.76" />
    <line x1="16.24" y1="16.24" x2="19.07" y2="19.07" />
    <line x1="2" y1="12" x2="6" y2="12" />
    <line x1="18" y1="12" x2="22" y2="12" />
    <line x1="4.93" y1="19.07" x2="7.76" y2="16.24" />
    <line x1="16.24" y1="7.76" x2="19.07" y2="4.93" />
  </svg>
)
const IconArrowLeft = ({ size = 14 }: { size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <line x1="19" y1="12" x2="5" y2="12" />
    <polyline points="12 19 5 12 12 5" />
  </svg>
)
const IconLock = ({ size = 14 }: { size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
)
const IconTrash = ({ size = 15 }: { size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    <line x1="10" y1="11" x2="10" y2="17" />
    <line x1="14" y1="11" x2="14" y2="17" />
  </svg>
)

import { BrowserViewer } from './BrowserViewer'

interface BrowserProfile {
  id: string
  userId: string
  profileDir: string
  storageStateKey: string | null
  loggedInOrigins: string[]
  lastSyncedAt: string | null
  version: number
  createdAt: string
  updatedAt: string
}

interface BrowserSession {
  id: string
  userId: string
  profileId: string
  status: 'STARTING' | 'READY' | 'CLOSED' | 'ERROR' | 'EXPIRED'
  startUrl: string | null
  cdpPort: number | null
  noVncUrl: string | null
  pid: number | null
  error: string | null
  startedAt: string
  readyAt: string | null
  closedAt: string | null
  expiresAt: string
}

interface ProfileResponse {
  profile: BrowserProfile
  activeSessions: BrowserSession[]
}

interface StartSessionResponse {
  sessionId: string
  status: BrowserSession['status']
  cdpPort: number
  noVncUrl: string | null
  profileDir: string
  startedAt: string
  expiresAt: string
}

interface CloseSessionResponse {
  sessionId: string
  status: BrowserSession['status']
  loggedInOrigins: string[]
}

function formatOrigin(origin: string): string {
  try {
    const u = new URL(origin)
    return u.host
  } catch {
    return origin
  }
}

function formatRelativeTime(iso: string | null): string {
  if (!iso) return 'never'
  const diff = Date.now() - new Date(iso).getTime()
  if (diff < 60_000) return 'just now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return `${Math.floor(diff / 86_400_000)}d ago`
}

export const SessionsView = () => {
  const { getToken } = useAuth()
  const [profile, setProfile] = useState<BrowserProfile | null>(null)
  const [activeSession, setActiveSession] = useState<BrowserSession | StartSessionResponse | null>(
    null,
  )
  const [loading, setLoading] = useState(true)
  const [authModalOpen, setAuthModalOpen] = useState(false)
  const [targetUrl, setTargetUrl] = useState('')
  const [urlError, setUrlError] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)
  const [closing, setClosing] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const pollRef = useRef<number | null>(null)
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [returnPath, setReturnPath] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [redirectIn, setRedirectIn] = useState<number | null>(null)
  const [deletingOrigin, setDeletingOrigin] = useState<string | null>(null)

  // Deep-link from a creation flow: prefill + open the auth modal, then strip
  // the params so a refresh or back-nav doesn't re-fire it.
  useEffect(() => {
    const url = searchParams.get('url')
    if (!url) return
    setTargetUrl(url)
    setAuthModalOpen(true)
    const from = searchParams.get('from')
    if (from === 'new') setReturnPath('/new')
    if (from === 'launch-video') setReturnPath('/launch-video/new')
    const next = new URLSearchParams(searchParams)
    next.delete('url')
    next.delete('from')
    setSearchParams(next, { replace: true })
    // run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setSearchParams, searchParams.get, searchParams])

  const fetchProfile = useCallback(async () => {
    try {
      const token = await getToken()
      if (!token) return
      const data = await api.get<ProfileResponse>('/browser/profile', token)
      setProfile(data.profile)
      setActiveSession(data.activeSessions[0] ?? null)
    } catch (err: any) {
      setActionError(err?.message ?? 'Failed to load profile')
    } finally {
      setLoading(false)
    }
  }, [getToken])

  useEffect(() => {
    void fetchProfile()
  }, [fetchProfile])

  // Poll active session status while one is running so the UI reflects
  // EXPIRED / ERROR transitions promptly.
  useEffect(() => {
    if (!activeSession) {
      if (pollRef.current) {
        window.clearInterval(pollRef.current)
        pollRef.current = null
      }
      return
    }
    pollRef.current = window.setInterval(async () => {
      try {
        const token = await getToken()
        if (!token) return
        const data = await api.get<ProfileResponse>('/browser/profile', token)
        setProfile(data.profile)
        setActiveSession(data.activeSessions[0] ?? null)
      } catch {
        // ignore transient errors
      }
    }, 5000)
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current)
    }
  }, [activeSession, getToken])

  // Cancellable auto-redirect back to the originating creation flow after a save.
  // Ticks down once a second; reaching 0 navigates. Cancelling sets it to null.
  useEffect(() => {
    if (redirectIn === null) return
    if (redirectIn <= 0 && returnPath) {
      navigate(returnPath)
      return
    }
    const t = window.setTimeout(() => setRedirectIn(n => (n === null ? null : n - 1)), 1000)
    return () => window.clearTimeout(t)
  }, [redirectIn, navigate, returnPath])

  const handleStart = async () => {
    setActionError(null)
    setUrlError(null)
    const raw = targetUrl.trim()
    if (!raw) {
      setUrlError('Enter a URL to log in to.')
      return
    }
    let normalized = raw
    if (!/^https?:\/\//i.test(normalized)) normalized = `https://${normalized}`
    try {
      new URL(normalized)
    } catch {
      setUrlError("That doesn't look like a valid URL.")
      return
    }

    setStarting(true)
    try {
      const token = await getToken()
      if (!token) throw new Error('Not authenticated')
      const session = await api.post<StartSessionResponse>('/browser/sessions', token, {
        startUrl: normalized,
      })
      setActiveSession(session)
      setAuthModalOpen(false)
      setTargetUrl('')
      // 2 credits were spent starting the session — refresh the header balance.
      window.dispatchEvent(new Event('credits-changed'))
    } catch (err: any) {
      const msg =
        err?.status === 409
          ? 'You already have an active session. Close it first.'
          : err?.status === 402
            ? 'Not enough credits — authenticating a site costs 2.'
            : (err?.message ?? 'Failed to start session')
      setActionError(msg)
    } finally {
      setStarting(false)
    }
  }

  const handleClose = async () => {
    if (!activeSession) return
    setActionError(null)
    setClosing(true)
    try {
      const token = await getToken()
      if (!token) throw new Error('Not authenticated')
      const result = await api.post<CloseSessionResponse>(
        `/browser/sessions/${(activeSession as any).sessionId ?? (activeSession as BrowserSession).id}/close`,
        token,
        {},
      )
      setActiveSession(null)
      if (profile) {
        setProfile({
          ...profile,
          loggedInOrigins: Array.from(
            new Set([...profile.loggedInOrigins, ...result.loggedInOrigins]),
          ).sort(),
          lastSyncedAt: new Date().toISOString(),
        })
      }
      await fetchProfile()
      // Offer a short, cancellable hop back to the originating creation flow.
      if (returnPath) {
        setSaved(true)
        setRedirectIn(5)
      }
    } catch (err: any) {
      setActionError(err?.message ?? 'Failed to close session')
    } finally {
      setClosing(false)
    }
  }

  const handleDeleteOrigin = async (origin: string) => {
    setRedirectIn(null) // don't yank the user away mid-action
    setActionError(null)
    setDeletingOrigin(origin)
    try {
      const token = await getToken()
      if (!token) throw new Error('Not authenticated')
      await api.delete(`/browser/origins?origin=${encodeURIComponent(origin)}`, token)
      setProfile(p =>
        p ? { ...p, loggedInOrigins: p.loggedInOrigins.filter(o => o !== origin) } : p,
      )
    } catch (err: any) {
      setActionError(err?.message ?? 'Failed to remove login')
    } finally {
      setDeletingOrigin(null)
    }
  }

  const origins = useMemo(() => profile?.loggedInOrigins ?? [], [profile])
  const returnLabel = returnPath === '/launch-video/new' ? 'launch video' : 'demo'

  return (
    <div className="p-6 md:p-8 max-w-5xl mx-auto w-full">
      {redirectIn !== null ? (
        <div
          role="status"
          aria-live="polite"
          className="mb-6 flex flex-col gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 sm:flex-row sm:items-center animate-[fadeIn_240ms_ease-out]"
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600">
            <IconCheck />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-emerald-900">Login saved</p>
            <p className="text-xs text-emerald-700/80">
              Returning to your {returnLabel} in{' '}
              <span className="font-semibold tabular-nums">{redirectIn}s</span> — or stay to
              re-authenticate / remove a site below.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              onClick={() => setRedirectIn(null)}
              className="rounded-lg border border-emerald-200 bg-white px-3 py-2 text-xs font-semibold text-emerald-800 transition-colors hover:bg-emerald-50/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/40"
            >
              Stay here
            </button>
            <button
              onClick={() => returnPath && navigate(returnPath)}
              className="rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white transition-colors hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40"
            >
              Go now
            </button>
          </div>
        </div>
      ) : saved ? (
        <div className="mb-6 flex flex-col gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 sm:flex-row sm:items-center animate-[fadeIn_240ms_ease-out]">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600">
            <IconCheck />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-emerald-900">Login saved</p>
            <p className="text-xs text-emerald-700/80">
              Re-authenticate or remove a site below, or head back to your {returnLabel}.
            </p>
          </div>
          <button
            onClick={() => returnPath && navigate(returnPath)}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white transition-colors hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40"
          >
            Return to your {returnLabel}
          </button>
        </div>
      ) : returnPath ? (
        <div className="mb-6 flex flex-col gap-3 rounded-xl border border-gray-200 bg-gradient-to-r from-gray-50 to-white px-4 py-3 sm:flex-row sm:items-center animate-[fadeIn_240ms_ease-out]">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-900 text-white">
            <IconLock />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-gray-900">
              Authenticating for your {returnLabel}
            </p>
            <p className="text-xs text-gray-500">
              Sign in to the site below, then click{' '}
              <strong className="font-semibold text-gray-700">Complete&nbsp;&amp;&nbsp;Save</strong>{' '}
              — we’ll bring you back.
            </p>
          </div>
          <button
            onClick={() => navigate(returnPath)}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-600 transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-300"
          >
            <IconArrowLeft size={13} /> Back to {returnLabel}
          </button>
        </div>
      ) : null}

      <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 leading-tight">Browser Sessions</h1>
          <p className="text-sm text-gray-500 mt-1 max-w-xl">
            Some sites sit behind a login or bot check. Authenticate one once in a stealth browser
            and every automation job reuses it — public sites need nothing here.
          </p>
        </div>
        <button
          onClick={() => {
            setActionError(null)
            setUrlError(null)
            setRedirectIn(null)
            setAuthModalOpen(true)
          }}
          disabled={!!activeSession}
          className="flex items-center gap-1.5 px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700 transition-colors border-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          id="add-login-btn"
        >
          <IconPlus /> Authenticate with URL
          <CreditChip amount={2} className="bg-white text-gray-900" />
        </button>
      </div>

      {actionError && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
          {actionError}
        </div>
      )}

      {activeSession && (
        <ActiveSessionPanel
          session={activeSession as BrowserSession & StartSessionResponse}
          onClose={handleClose}
          closing={closing}
        />
      )}

      <div className="mt-2">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Logged-in sites</h2>
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <IconSpinner /> Loading…
          </div>
        ) : origins.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center border border-dashed border-gray-200 rounded-xl bg-gray-50">
            <div className="w-14 h-14 bg-white rounded-xl flex items-center justify-center mb-4 shadow-sm border border-gray-200">
              <IconShield />
            </div>
            <h3 className="text-sm font-semibold text-gray-700 mb-1">No sites authenticated yet</h3>
            <p className="text-xs text-gray-400 max-w-xs">
              Click <span className="font-medium">Authenticate with URL</span> to open a stealth
              browser, log in, and have those credentials reused by every job you queue.
            </p>
          </div>
        ) : (
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {origins.map(origin => (
              <li
                key={origin}
                className="group flex items-center gap-3 px-3 py-2.5 bg-white border border-gray-200 rounded-lg transition-colors hover:border-gray-300"
              >
                <span className="w-6 h-6 rounded-md bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                  <IconCheck />
                </span>
                <span className="flex-1 min-w-0 flex items-center gap-1.5 text-sm text-gray-800 truncate">
                  <IconGlobe />
                  {formatOrigin(origin)}
                </span>
                <button
                  onClick={() => handleDeleteOrigin(origin)}
                  disabled={deletingOrigin === origin}
                  aria-label={`Remove saved login for ${formatOrigin(origin)}`}
                  title="Remove saved login"
                  className="shrink-0 rounded-md p-1.5 text-gray-300 transition-colors hover:bg-red-50 hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300 disabled:opacity-50"
                >
                  {deletingOrigin === origin ? <IconSpinner /> : <IconTrash size={15} />}
                </button>
              </li>
            ))}
          </ul>
        )}
        {profile?.lastSyncedAt && (
          <p className="mt-3 text-xs text-gray-400">
            Last synced {formatRelativeTime(profile.lastSyncedAt)}
          </p>
        )}
      </div>

      {authModalOpen && (
        <AuthModal
          url={targetUrl}
          onUrlChange={v => {
            setTargetUrl(v)
            setUrlError(null)
          }}
          urlError={urlError}
          starting={starting}
          onStart={handleStart}
          onClose={() => setAuthModalOpen(false)}
        />
      )}
    </div>
  )
}

interface ActiveSessionPanelProps {
  session: BrowserSession & StartSessionResponse
  onClose: () => void
  closing: boolean
}

const ActiveSessionPanel = ({ session, onClose, closing }: ActiveSessionPanelProps) => {
  const startUrl = session.startUrl
  const managerProfileId = session.noVncUrl

  return (
    <div className="mb-10 group">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-amber-100 text-amber-600">
            <IconSpinner />
          </div>
          <div>
            <h3 className="text-sm font-bold text-gray-900">Live Authentication Session</h3>
            <p className="text-[11px] text-gray-500 font-medium">
              {startUrl ? `Authenticated to ${startUrl}` : 'Browser ready'} · Expires{' '}
              {formatRelativeTime(session.expiresAt)}
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          disabled={closing}
          className="flex items-center gap-2 px-4 py-2 bg-white text-gray-900 text-xs font-bold rounded-lg border border-gray-200 hover:bg-gray-50 transition-all shadow-sm disabled:opacity-50"
        >
          {closing ? <IconSpinner /> : <IconCheck />}
          {closing ? 'Finishing...' : 'Complete & Save'}
        </button>
      </div>

      <div className="relative aspect-video w-full max-w-4xl mx-auto overflow-hidden rounded-2xl border border-gray-200 bg-gray-900 shadow-2xl transition-all group-hover:border-gray-300">
        {managerProfileId ? (
          <BrowserViewer profileId={managerProfileId} />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="flex flex-col items-center gap-3">
              <IconSpinner />
              <p className="text-xs text-white/40 font-medium">Initializing Remote Display...</p>
            </div>
          </div>
        )}
      </div>

      <div className="mt-4 max-w-4xl mx-auto px-4 py-3 bg-blue-50 border border-blue-100 rounded-xl flex items-center gap-3">
        <div className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
        <p className="text-[11px] text-blue-700 font-medium leading-relaxed">
          The browser above is running in a secure, isolated container. Your interactions are
          encrypted and private. Complete your login flow, then click{' '}
          <strong>Complete & Save</strong> to persist the session.
        </p>
      </div>
    </div>
  )
}

interface AuthModalProps {
  url: string
  onUrlChange: (v: string) => void
  urlError: string | null
  starting: boolean
  onStart: () => void
  onClose: () => void
}

const AuthModal = ({ url, onUrlChange, urlError, starting, onStart, onClose }: AuthModalProps) => {
  const dialogRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const host = prettyHost(url)

  // Accessibility: focus the input on open, trap Tab within the dialog, close on
  // Escape, lock background scroll, and restore focus to the trigger on unmount.
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null
    inputRef.current?.focus()
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
        return
      }
      if (e.key !== 'Tab') return
      const nodes = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      )
      const list = nodes ? Array.from(nodes).filter(el => !el.hasAttribute('disabled')) : []
      if (list.length === 0) return
      const first = list[0]
      const last = list[list.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = prevOverflow
      previouslyFocused?.focus?.()
    }
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-[2px] p-4 animate-[fadeIn_160ms_ease-out]"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-modal-title"
        aria-describedby="auth-modal-desc"
        className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-2.5 mb-1.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-900 text-white">
            <IconLock size={15} />
          </span>
          <h2 id="auth-modal-title" className="text-lg font-semibold text-gray-900">
            Authenticate a site
          </h2>
        </div>
        <p id="auth-modal-desc" className="text-sm text-gray-500 mb-4">
          We&apos;ll open a stealth browser so you can log in and clear any bot check. The session
          is saved to your profile and reused by every job.
        </p>
        <label htmlFor="auth-url-input" className="block text-xs font-medium text-gray-700 mb-1.5">
          Site URL
        </label>
        <input
          id="auth-url-input"
          ref={inputRef}
          type="url"
          placeholder="https://chat.deepseek.com"
          value={url}
          onChange={e => onUrlChange(e.target.value)}
          aria-invalid={!!urlError}
          aria-describedby={urlError ? 'auth-url-error' : undefined}
          className={`w-full px-3 py-2 text-sm border rounded-lg outline-none transition-colors ${
            urlError
              ? 'border-red-300 focus:border-red-500'
              : 'border-gray-200 focus:border-gray-400'
          }`}
          onKeyDown={e => {
            if (e.key === 'Enter' && !starting) onStart()
          }}
        />
        {urlError && (
          <p id="auth-url-error" className="mt-1.5 text-xs text-red-600">
            {urlError}
          </p>
        )}

        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
          Each authentication session costs <strong>2 credits</strong> — re-authenticating a removed
          site charges again.
        </div>

        <div className="flex items-center justify-end gap-2 mt-5">
          <button
            onClick={onClose}
            disabled={starting}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-300"
          >
            Cancel
          </button>
          <button
            onClick={onStart}
            disabled={starting}
            className="px-4 py-2 text-sm font-medium text-white bg-gray-900 rounded-lg hover:bg-gray-700 transition-colors cursor-pointer border-none disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900/30"
          >
            {starting && <IconSpinner />}
            {starting ? 'Starting browser…' : host ? `Open ${host}` : 'Open browser'}
            {!starting && <CreditChip amount={2} className="bg-white text-gray-900" />}
          </button>
        </div>
      </div>
    </div>
  )
}
