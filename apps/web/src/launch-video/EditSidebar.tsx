import { ArrowUp, Loader2, MousePointerClick, Wand2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { launchVideoActivityStage } from './activity'
import { messageText } from './api'
import { fmt } from './SceneTimeline'
import { useLaunchVideo } from './store'

export function EditSidebar() {
  const { activity, busy, currentProject, sceneMessages, selectedScene, sendScenePrompt } =
    useLaunchVideo()
  const [draft, setDraft] = useState('')
  const [busySince, setBusySince] = useState<number | null>(null)
  const [now, setNow] = useState(Date.now())
  const feedRef = useRef<HTMLDivElement | null>(null)

  const scene = currentProject?.scenes.find(s => s.id === selectedScene) ?? null
  const thread = selectedScene ? (sceneMessages.get(selectedScene) ?? []) : []

  // Clear draft when switching scenes.
  useEffect(() => {
    setDraft('')
  }, [selectedScene])

  // Auto-scroll the feed while tokens stream in.
  const streamLen = thread.reduce((n, m) => n + Object.values(m.partTexts).join('').length, 0)
  useEffect(() => {
    const el = feedRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [thread.length, streamLen, busy, activity])

  useEffect(() => {
    if (!busy) {
      setBusySince(null)
      return
    }
    setBusySince(value => value ?? Date.now())
    setNow(Date.now())
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [busy])

  const stage = launchVideoActivityStage(activity)
  const elapsed = busySince === null ? 0 : Math.max(0, Math.floor((now - busySince) / 1000))
  const elapsedLabel =
    elapsed >= 60 ? `${Math.floor(elapsed / 60)}m ${elapsed % 60}s` : `${elapsed}s`

  const submit = async () => {
    const text = draft.trim()
    if (!scene || !text || busy) return
    setDraft('')
    await sendScenePrompt(scene.id, text)
  }

  return (
    <aside className="w-[320px] shrink-0 flex flex-col min-h-0 border-l border-[var(--border-subtle)] bg-[var(--bg-surface)]">
      {/* Scene header */}
      <div className="shrink-0 px-4 py-3 border-b border-[var(--border-subtle)]">
        {scene ? (
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center gap-2">
              <Wand2 size={13} className="text-[var(--accent)] shrink-0" />
              <span className="text-sm font-semibold text-[var(--text-primary)] font-[family-name:var(--font-mono)] truncate">
                {scene.id}
              </span>
              {busy && (
                <span className="ml-auto flex items-center gap-1 text-xs text-[var(--text-muted)] truncate max-w-[100px]">
                  <Loader2 size={11} className="animate-spin shrink-0" />
                  <span className="truncate">{activity ?? 'working…'}</span>
                </span>
              )}
            </div>
            <div className="text-xs text-[var(--text-faint)] font-[family-name:var(--font-mono)] pl-5">
              {fmt(scene.start)} – {fmt(scene.end)} · {fmt(scene.dur)}
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2 py-1">
            <MousePointerClick
              size={14}
              strokeWidth={1.5}
              className="text-[var(--text-faint)] shrink-0"
            />
            <div className="text-sm text-[var(--text-muted)]">Select a scene to edit</div>
          </div>
        )}
      </div>

      {/* Chat feed — fills available space, scrollable */}
      <div ref={feedRef} className="flex-1 min-h-0 overflow-y-auto px-4 py-3 flex flex-col gap-2">
        {thread.length === 0 && (
          <div className="flex-1 flex flex-col items-center justify-center text-center px-4 py-8 gap-2">
            {scene ? (
              <>
                <Wand2 size={20} strokeWidth={1.5} className="text-[var(--text-faint)]" />
                <p className="text-xs text-[var(--text-faint)] leading-relaxed">
                  No edits yet for{' '}
                  <span className="font-[family-name:var(--font-mono)]">{scene.id}</span>.
                  <br />
                  Describe what to change below.
                </p>
              </>
            ) : (
              <p className="text-xs text-[var(--text-faint)] leading-relaxed">
                Click a scene in the timeline to inspect and edit it.
              </p>
            )}
          </div>
        )}

        {thread.map(m => {
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
                className={`max-w-[85%] rounded-[var(--radius-md)] px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap break-words ${
                  m.role === 'user'
                    ? 'bg-[var(--interactive-bg)] text-[var(--interactive-text)] rounded-br-[var(--radius-sm)]'
                    : 'bg-[var(--bg-sunken)] text-[var(--text-secondary)] rounded-bl-[var(--radius-sm)]'
                }`}
              >
                {text}
              </div>
              {time && <div className="text-[10px] text-[var(--text-faint)] px-1">{time}</div>}
            </div>
          )
        })}

        {busy && scene && (
          <div className="flex justify-start">
            <div className="w-[92%] rounded-[var(--radius-md)] rounded-bl-[var(--radius-sm)] px-3 py-2.5 text-xs bg-[var(--bg-sunken)] text-[var(--text-muted)] flex flex-col gap-2">
              <div className="flex items-center gap-1.5 min-w-0">
                <Loader2 size={11} className="animate-spin shrink-0" />
                <span className="truncate text-[var(--text-secondary)]">
                  {activity ?? 'Starting the scene update…'}
                </span>
                <span className="ml-auto shrink-0 font-[family-name:var(--font-mono)] text-[10px] text-[var(--text-faint)]">
                  {elapsedLabel}
                </span>
              </div>
              <div className="h-1 rounded-full overflow-hidden bg-[var(--border-subtle)]">
                <div
                  className="h-full rounded-full bg-[var(--interactive-bg)] transition-[width] duration-700"
                  style={{ width: `${stage.progress}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-[10px] text-[var(--text-faint)]">
                <span>{stage.label}</span>
                <span>Live session · safe to leave</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Compose — pinned at bottom, only shown when a scene is selected */}
      {scene && (
        <div className="shrink-0 px-3 pb-3 pt-2 border-t border-[var(--border-subtle)]">
          <div className="rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--bg-raised)] p-2 flex flex-col gap-1.5 focus-within:border-[var(--border-strong)] transition-colors">
            <textarea
              rows={3}
              placeholder="What should change in this scene?"
              value={draft}
              disabled={busy}
              onChange={e => setDraft(e.currentTarget.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  void submit()
                }
              }}
              className="w-full resize-none bg-transparent px-1 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-faint)] outline-none disabled:opacity-60"
            />
            <div className="flex justify-end">
              <button
                disabled={busy || !draft.trim()}
                onClick={() => void submit()}
                className="inline-flex items-center gap-1 h-7 px-3 rounded-full bg-[var(--interactive-bg)] text-[var(--interactive-text)] text-xs font-medium hover:bg-[var(--interactive-bg-hover)] transition-colors disabled:opacity-50 disabled:pointer-events-none cursor-pointer border-none"
              >
                {busy ? <Loader2 size={11} className="animate-spin" /> : <ArrowUp size={11} />}
                {busy ? 'Working…' : 'Update'}
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  )
}
