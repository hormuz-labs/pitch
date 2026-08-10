import { ArrowUp, Loader2, Music2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { messageText } from './api'
import { MusicLibrary } from './MusicLibrary'
import { useLaunchVideo } from './store'

export function CreatePanel() {
  const {
    activity,
    busy,
    currentProject,
    messages,
    musicTracks,
    selectedMusic,
    sendPrompt,
    startProject,
  } = useLaunchVideo()
  const [draft, setDraft] = useState('')
  const [libraryOpen, setLibraryOpen] = useState(false)
  const scrollRef = useRef<HTMLDivElement | null>(null)

  const started = currentProject !== null
  const selectedTrackName =
    musicTracks.find(t => t.file === selectedMusic)?.name.replace(/-/g, ' ') ?? null

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
      await startProject(t)
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
          <div className="flex items-center justify-between">
            <button
              onClick={() => setLibraryOpen(true)}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full border border-[var(--border-subtle)] bg-transparent text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-sunken)] hover:text-[var(--text-primary)] transition-colors cursor-pointer max-w-[220px]"
            >
              <Music2 size={13} className="shrink-0" />
              <span className="truncate">{selectedTrackName ?? 'Music'}</span>
            </button>
            <button
              disabled={busy || !draft.trim()}
              onClick={() => void send(draft)}
              className="inline-flex items-center gap-1.5 h-8 px-4 rounded-full bg-[var(--interactive-bg)] text-[var(--interactive-text)] text-sm font-medium hover:bg-[var(--interactive-bg-hover)] transition-colors disabled:opacity-50 disabled:pointer-events-none cursor-pointer border-none"
            >
              {busy ? <Loader2 size={14} className="animate-spin" /> : <ArrowUp size={14} />}
              {started ? 'Send' : 'Generate'}
            </button>
          </div>
        </div>
      </div>

      {libraryOpen && <MusicLibrary onClose={() => setLibraryOpen(false)} />}
    </div>
  )
}
