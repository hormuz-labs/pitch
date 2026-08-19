import { Check, Music2, Play, Search, Square, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useLaunchVideo } from './store'

function fmtDur(sec: number | null): string {
  if (sec == null) return ''
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

function pretty(name: string): string {
  return name.replace(/-/g, ' ')
}

/** Searchable music library modal — scales to hundreds of tracks. */
export function MusicLibrary({ onClose }: { onClose: () => void }) {
  const { musicTracks, selectedMusic, setSelectedMusic, refreshMusic, mediaUrl } = useLaunchVideo()
  const [query, setQuery] = useState('')
  const [previewing, setPreviewing] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const searchRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    void refreshMusic()
    searchRef.current?.focus()
    return () => audioRef.current?.pause()
  }, [refreshMusic])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return musicTracks
    return musicTracks.filter(t => t.name.toLowerCase().replace(/-/g, ' ').includes(q))
  }, [query, musicTracks])

  const togglePreview = (file: string, url: string) => {
    if (previewing === file) {
      audioRef.current?.pause()
      setPreviewing(null)
      return
    }
    audioRef.current?.pause()
    const src = mediaUrl(url)
    if (!src) return
    const audio = new Audio(src)
    audio.onended = () => setPreviewing(null)
    void audio.play()
    audioRef.current = audio
    setPreviewing(file)
  }

  const pick = (file: string | null) => {
    setSelectedMusic(file)
    audioRef.current?.pause()
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--bg-overlay)] backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg max-h-[80vh] flex flex-col rounded-[var(--radius-xl)] border border-[var(--border-subtle)] bg-[var(--bg-surface)] shadow-[var(--shadow-xl)]"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <h2 className="text-base font-semibold text-[var(--text-primary)]">Music library</h2>
          <div className="flex items-center gap-3">
            <span className="text-xs text-[var(--text-muted)]">{filtered.length} tracks</span>
            <button
              onClick={onClose}
              className="text-[var(--text-faint)] hover:text-[var(--text-secondary)] transition-colors cursor-pointer bg-transparent border-none p-0"
              aria-label="Close"
            >
              <X size={16} />
            </button>
          </div>
        </div>
        <div className="px-5 pb-3">
          <div className="relative">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-faint)] pointer-events-none"
            />
            <input
              ref={searchRef}
              className="w-full rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-raised)] pl-9 pr-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-faint)] outline-none focus:border-[var(--border-strong)] transition-colors"
              placeholder="Search tracks…"
              value={query}
              onChange={e => setQuery(e.currentTarget.value)}
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-2 pb-3">
          <button
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-[var(--radius-md)] text-left transition-colors cursor-pointer border-none ${
              selectedMusic === null
                ? 'bg-[var(--accent-subtle)]'
                : 'bg-transparent hover:bg-[var(--bg-sunken)]'
            }`}
            onClick={() => pick(null)}
          >
            <span className="w-7 h-7 shrink-0 flex items-center justify-center rounded-full text-[var(--text-faint)]">
              <Music2 size={14} />
            </span>
            <span className="flex-1 text-sm text-[var(--text-muted)]">No music</span>
            <span className="text-[var(--text-primary)]">
              {selectedMusic === null ? <Check size={14} /> : null}
            </span>
          </button>
          {filtered.map(track => {
            const selected = selectedMusic === track.file
            const isPreviewing = previewing === track.file
            return (
              <div
                key={track.file}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-[var(--radius-md)] transition-colors cursor-pointer ${
                  selected ? 'bg-[var(--accent-subtle)]' : 'hover:bg-[var(--bg-sunken)]'
                }`}
                onClick={() => pick(track.file)}
              >
                <button
                  className="w-7 h-7 shrink-0 flex items-center justify-center rounded-full bg-[var(--bg-sunken)] text-[var(--text-secondary)] hover:bg-[var(--accent-subtle)] hover:text-[var(--text-primary)] transition-colors cursor-pointer border-none"
                  onClick={e => {
                    e.stopPropagation()
                    togglePreview(track.file, track.url)
                  }}
                  aria-label={isPreviewing ? 'Stop preview' : 'Play preview'}
                >
                  {isPreviewing ? <Square size={11} /> : <Play size={11} className="ml-px" />}
                </button>
                <span className="flex-1 min-w-0 truncate text-sm text-[var(--text-primary)]">
                  {pretty(track.name)}
                </span>
                <span className="text-xs tabular-nums text-[var(--text-faint)] font-[family-name:var(--font-mono)]">
                  {fmtDur(track.duration)}
                </span>
                <span className="w-4 text-[var(--text-primary)]">
                  {selected ? <Check size={14} /> : null}
                </span>
              </div>
            )
          })}
          {filtered.length === 0 && (
            <div className="px-3 py-8 text-center text-sm text-[var(--text-muted)]">
              No tracks match “{query}”.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
