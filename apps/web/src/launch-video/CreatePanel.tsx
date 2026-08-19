import { ArrowUp, Loader2, Mic, MicOff, Monitor, Music2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CreditChip } from '../components/CreditChip'
import { useBrowserProfile } from '../hooks/useBrowserProfile'
import { messageText } from './api'
import { LaunchAuthAssist } from './LaunchAuthAssist'
import { MusicLibrary } from './MusicLibrary'
import { launchVideoProjectDestination } from './navigation'
import { websiteHostFromPrompt } from './project-name'
import { useLaunchVideo } from './store'

const LAUNCH_VIDEO_DRAFT_KEY = 'launch-video:new:draft'
const LAUNCH_VIDEO_RES_KEY = 'launch-video:new:resolution'
const LAUNCH_VIDEO_NARRATION_KEY = 'launch-video:new:narration'

/**
 * Display-only mirror of the server's pricing table (packages/shared →
 * LAUNCH_VIDEO_RESOLUTIONS). Deliberately duplicated rather than imported:
 * @saas/shared is a server package that pulls in pino, and the web app does not
 * depend on it. The SERVER is authoritative — it revalidates the resolution and
 * recomputes the charge, so a stale value here can only mis-display a price,
 * never mis-bill. Keep the two in sync.
 */
const LAUNCH_VIDEO_RESOLUTIONS = {
  '720p': { label: '720p', credits: 5 },
  '1080p': { label: '1080p', credits: 8 },
  '4k': { label: '4K', credits: 12 },
} as const
/** Narration adds a TTS pass on top of the render. */
const LAUNCH_VIDEO_NARRATION_CREDITS = 1
type LaunchVideoResolution = keyof typeof LAUNCH_VIDEO_RESOLUTIONS
const DEFAULT_LAUNCH_VIDEO_RESOLUTION: LaunchVideoResolution = '1080p'
const RESOLUTION_ORDER: LaunchVideoResolution[] = ['720p', '1080p', '4k']

export function CreatePanel() {
  const navigate = useNavigate()
  const { origins, loading: originsLoading } = useBrowserProfile()
  const {
    activity,
    busy,
    currentProject,
    messages,
    musicTracks,
    projects,
    selectedMusic,
    sendPrompt,
    startProject,
  } = useLaunchVideo()
  const [draft, setDraft] = useState(() => sessionStorage.getItem(LAUNCH_VIDEO_DRAFT_KEY) ?? '')
  const [dismissedAuthHost, setDismissedAuthHost] = useState<string | null>(null)
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [narration, setNarration] = useState<boolean>(
    () => sessionStorage.getItem(LAUNCH_VIDEO_NARRATION_KEY) !== 'off',
  )
  const [resolution, setResolution] = useState<LaunchVideoResolution>(() => {
    const saved = sessionStorage.getItem(LAUNCH_VIDEO_RES_KEY)
    return saved && saved in LAUNCH_VIDEO_RESOLUTIONS
      ? (saved as LaunchVideoResolution)
      : DEFAULT_LAUNCH_VIDEO_RESOLUTION
  })
  const scrollRef = useRef<HTMLDivElement | null>(null)

  const started = currentProject !== null
  const selectedTrackName =
    musicTracks.find(t => t.file === selectedMusic)?.name.replace(/-/g, ' ') ?? null
  const activeProject = projects.find(
    project => project.jobId && (project.status === 'PENDING' || project.status === 'PROCESSING'),
  )
  const websiteHost = websiteHostFromPrompt(draft)
  const websiteUrl = websiteHost ? `https://${websiteHost}` : ''

  useEffect(() => {
    if (draft) sessionStorage.setItem(LAUNCH_VIDEO_DRAFT_KEY, draft)
    else sessionStorage.removeItem(LAUNCH_VIDEO_DRAFT_KEY)
  }, [draft])

  useEffect(() => {
    sessionStorage.setItem(LAUNCH_VIDEO_RES_KEY, resolution)
  }, [resolution])

  useEffect(() => {
    sessionStorage.setItem(LAUNCH_VIDEO_NARRATION_KEY, narration ? 'on' : 'off')
  }, [narration])

  // Auto-scroll while tokens arrive (track both count and streamed length).
  const streamLength = messages.reduce((n, m) => n + messageText(m).length, messages.length)
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages.length, streamLength, busy, activity])

  const send = async (text: string) => {
    const t = text.trim()
    if (!t || busy) return
    if (!started) {
      setDraft('')
      const { jobId } = await startProject(t, resolution, narration)
      navigate(`/launch-video/edit/${encodeURIComponent(jobId)}`)
      return
    }
    setDraft('')
    await sendPrompt(t)
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto">
        {!started && messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-center px-6 pb-10">
            <h1 className="font-[family-name:var(--font-serif)] text-4xl md:text-5xl text-[var(--text-primary)] tracking-tight">
              What should we launch?
            </h1>
            <p className="mt-4 max-w-md text-sm md:text-base text-[var(--text-muted)] leading-relaxed">
              Describe the product launch video you want — Pitch will direct, animate, and render it
              end to end.
            </p>
            {activeProject?.jobId && (
              <button
                onClick={() => navigate(launchVideoProjectDestination(activeProject))}
                className="mt-6 flex items-center gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-4 py-3 text-left shadow-[var(--shadow-sm)] hover:border-[var(--border-strong)] hover:shadow-[var(--shadow-md)] transition-all cursor-pointer"
              >
                <span className="h-2 w-2 shrink-0 rounded-full bg-amber-500 animate-pulse" />
                <span>
                  <span className="block text-sm font-medium text-[var(--text-primary)]">
                    {activeProject.displayName ?? activeProject.name} is still being created
                  </span>
                  <span className="block text-xs text-[var(--text-muted)]">
                    View progress — or start another video below
                  </span>
                </span>
              </button>
            )}
          </div>
        )}

        <div className="max-w-3xl mx-auto w-full px-6 py-6 flex flex-col gap-3">
          {messages.map(m => {
            const text = messageText(m)
            if (!text) return null

            const time = m.created
              ? new Intl.DateTimeFormat('en-US', {
                  hour: 'numeric',
                  minute: '2-digit',
                }).format(new Date(m.created))
              : null

            return (
              <div
                key={m.id}
                className={`flex flex-col gap-1 ${m.role === 'user' ? 'items-end' : 'items-start'}`}
              >
                <div
                  className={`max-w-[80%] rounded-[var(--radius-lg)] px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap break-words ${
                    m.role === 'user'
                      ? 'bg-[var(--interactive-bg)] text-[var(--interactive-text)] rounded-br-[var(--radius-sm)]'
                      : 'bg-[var(--bg-sunken)] text-[var(--text-primary)] rounded-bl-[var(--radius-sm)]'
                  }`}
                >
                  {text}
                </div>
                {time && <div className="text-[10px] text-[var(--text-faint)] px-1.5">{time}</div>}
              </div>
            )
          })}
          {busy && (
            <div className="flex justify-start">
              <div className="max-w-[80%] rounded-[var(--radius-lg)] rounded-bl-[var(--radius-sm)] px-4 py-2.5 text-sm bg-[var(--bg-sunken)] text-[var(--text-muted)] flex items-center gap-2">
                <Loader2 size={13} className="animate-spin shrink-0" />
                <span className="truncate">{activity ?? 'working…'}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="shrink-0 px-6 pb-6 pt-2">
        <div className="max-w-3xl mx-auto rounded-[var(--radius-xl)] border border-[var(--border-subtle)] bg-[var(--bg-surface)] shadow-[var(--shadow-md)] p-3 flex flex-col gap-2">
          <textarea
            rows={3}
            placeholder={
              started ? 'Reply, or describe a change to the plan…' : 'A 40-second launch video for…'
            }
            value={draft}
            disabled={busy}
            onChange={e => setDraft(e.currentTarget.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                void send(draft)
              }
            }}
            className="w-full resize-none bg-transparent px-2 pt-1 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-faint)] outline-none disabled:opacity-60"
          />
          {!started && websiteUrl && (
            <LaunchAuthAssist
              url={websiteUrl}
              origins={origins}
              loading={originsLoading}
              dismissedHost={dismissedAuthHost}
              onAuthenticate={() =>
                navigate(`/sessions?url=${encodeURIComponent(websiteUrl)}&from=launch-video`)
              }
              onDismiss={() => setDismissedAuthHost(websiteHost)}
            />
          )}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setLibraryOpen(true)}
                className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full border border-[var(--border-subtle)] bg-transparent text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-sunken)] hover:text-[var(--text-primary)] transition-colors cursor-pointer max-w-[220px]"
              >
                <Music2 size={13} className="shrink-0" />
                <span className="truncate">{selectedTrackName ?? 'Music'}</span>
              </button>

              {/* Narration on/off. A narration-free film is a different edit —
                  scene lengths come from the storyboard instead of measured
                  voiceover — so it is chosen up front, not at mix time. */}
              {!started && (
                <button
                  onClick={() => setNarration(v => !v)}
                  aria-pressed={narration}
                  title={
                    narration
                      ? `Narrated — an AI voiceover is written and recorded (+${LAUNCH_VIDEO_NARRATION_CREDITS} credit)`
                      : 'Music only — no voiceover, on-screen copy carries the story'
                  }
                  className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-full border text-xs font-medium transition-colors cursor-pointer ${
                    narration
                      ? 'border-[var(--border-subtle)] bg-transparent text-[var(--text-secondary)] hover:bg-[var(--bg-sunken)] hover:text-[var(--text-primary)]'
                      : 'border-transparent bg-[var(--bg-sunken)] text-[var(--text-primary)]'
                  }`}
                >
                  {narration ? (
                    <Mic size={13} className="shrink-0" />
                  ) : (
                    <MicOff size={13} className="shrink-0" />
                  )}
                  <span className="truncate">{narration ? 'Narration' : 'Music only'}</span>
                </button>
              )}

              {/* Output resolution. Hidden once a project has started: the tier
                  was paid for at creation, so it is no longer changeable. */}
              {!started && (
                <div
                  role="radiogroup"
                  aria-label="Output resolution"
                  className="inline-flex items-center h-8 rounded-full border border-[var(--border-subtle)] p-0.5"
                >
                  <Monitor size={13} className="shrink-0 mx-1.5 text-[var(--text-muted)]" />
                  {RESOLUTION_ORDER.map(key => {
                    const opt = LAUNCH_VIDEO_RESOLUTIONS[key]
                    const active = resolution === key
                    return (
                      <button
                        key={key}
                        role="radio"
                        aria-checked={active}
                        title={`${opt.label} — ${
                          opt.credits + (narration ? LAUNCH_VIDEO_NARRATION_CREDITS : 0)
                        } credits`}
                        onClick={() => setResolution(key)}
                        className={`h-7 px-2.5 rounded-full text-xs font-medium transition-colors cursor-pointer border-none ${
                          active
                            ? 'bg-[var(--interactive-bg)] text-[var(--interactive-text)]'
                            : 'bg-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                        }`}
                      >
                        {opt.label}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
            <button
              disabled={busy || !draft.trim()}
              onClick={() => void send(draft)}
              className="inline-flex items-center gap-1.5 h-8 px-4 rounded-full bg-[var(--interactive-bg)] text-[var(--interactive-text)] text-sm font-medium hover:bg-[var(--interactive-bg-hover)] transition-colors disabled:opacity-50 disabled:pointer-events-none cursor-pointer border-none"
            >
              {busy ? <Loader2 size={14} className="animate-spin" /> : <ArrowUp size={14} />}
              {started ? (
                'Send'
              ) : (
                <>
                  Generate
                  <CreditChip
                    amount={
                      LAUNCH_VIDEO_RESOLUTIONS[resolution].credits +
                      (narration ? LAUNCH_VIDEO_NARRATION_CREDITS : 0)
                    }
                    className="bg-white text-gray-900"
                  />
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {libraryOpen && <MusicLibrary onClose={() => setLibraryOpen(false)} />}
    </div>
  )
}
