import { CreditChip } from '../components/CreditChip'
import { hostOf, isAuthenticatedFor, prettyHost } from '../lib/authOrigins'

const IconShieldCheck = () => (
  <svg
    width="15"
    height="15"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    <path d="m9 12 2 2 4-4" />
  </svg>
)

const IconKey = () => (
  <svg
    width="15"
    height="15"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="m15.5 7.5 3 3L22 7l-3-3" />
    <path d="m18.5 10.5-7.793 7.793a2.121 2.121 0 0 1-3-3L15.5 7.5" />
    <circle cx="7.5" cy="15.5" r="3.5" />
  </svg>
)

export function LaunchAuthAssist({
  url,
  origins,
  loading,
  dismissedHost,
  onAuthenticate,
  onDismiss,
}: {
  url: string
  origins: string[]
  loading: boolean
  dismissedHost: string | null
  onAuthenticate: () => void
  onDismiss: () => void
}) {
  const host = hostOf(url)
  if (!host) return null

  const label = prettyHost(url)
  if (loading) {
    return (
      <div className="flex items-center gap-2 px-2 py-1 text-xs text-[var(--text-faint)]">
        <span className="h-3 w-3 animate-spin rounded-full border-[1.5px] border-gray-200 border-t-gray-400" />
        Checking saved logins…
      </div>
    )
  }

  if (isAuthenticatedFor(url, origins)) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50/70 px-3 py-2 text-emerald-800">
        <IconShieldCheck />
        <p className="text-xs leading-snug">
          <span className="font-semibold">Signed in to {label}.</span>{' '}
          <span className="text-emerald-700/80">Your saved browser login is ready.</span>
        </p>
      </div>
    )
  }

  if (dismissedHost === host) return null

  return (
    <div className="rounded-lg border border-amber-200/80 bg-amber-50/70 px-3 py-2.5">
      <div className="flex items-start gap-2">
        <span className="mt-0.5 shrink-0 text-amber-600">
          <IconKey />
        </span>
        <p className="text-xs leading-snug text-amber-900">
          Does <span className="font-semibold">{label}</span> need a login or bot check?
        </p>
      </div>
      <div className="mt-2.5 flex items-center gap-2 pl-[23px]">
        <button
          type="button"
          onClick={onAuthenticate}
          className="inline-flex items-center gap-1.5 rounded-md bg-amber-600 px-3 py-1.5 text-[11px] font-semibold text-white transition-colors hover:bg-amber-700"
        >
          Authenticate
          <CreditChip amount={2} className="bg-white text-gray-900" />
        </button>
        <button
          type="button"
          onClick={onDismiss}
          className="rounded-md border border-amber-300 bg-white px-3 py-1.5 text-[11px] font-semibold text-amber-800 transition-colors hover:bg-amber-50"
        >
          No auth needed
        </button>
      </div>
    </div>
  )
}
