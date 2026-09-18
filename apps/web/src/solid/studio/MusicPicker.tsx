import { Check, Music2, Pause, Play, Search, X } from 'lucide-solid'
import { createMemo, createSignal, For, onCleanup, onMount, Show } from 'solid-js'
import { studio } from './client'
import type { MusicTrack } from './types'

function durationLabel(seconds: number | null): string {
  if (seconds === null) return ''
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

export function MusicPicker(props: {
  current?: string
  getToken: () => Promise<string>
  mediaUrl: (path: string | null | undefined) => string | null
  onApply: (track: MusicTrack) => void
  onClose: () => void
}) {
  const [tracks, setTracks] = createSignal<MusicTrack[]>([])
  const [query, setQuery] = createSignal('')
  const [selected, setSelected] = createSignal(props.current ?? '')
  const [playing, setPlaying] = createSignal('')
  const [loading, setLoading] = createSignal(true)
  const [error, setError] = createSignal('')
  let audio: HTMLAudioElement | undefined
  const filtered = createMemo(() => {
    const value = query().trim().toLowerCase()
    return value ? tracks().filter(track => track.name.toLowerCase().includes(value)) : tracks()
  })
  const stop = () => {
    audio?.pause()
    audio = undefined
    setPlaying('')
  }
  const preview = (track: MusicTrack) => {
    if (playing() === track.file) {
      stop()
      return
    }
    stop()
    const src = props.mediaUrl(track.url)
    if (!src) return
    audio = new Audio(src)
    audio.addEventListener('ended', stop, { once: true })
    void audio
      .play()
      .then(() => setPlaying(track.file))
      .catch(stop)
  }
  onMount(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') props.onClose()
    }
    document.addEventListener('keydown', closeOnEscape)
    void props
      .getToken()
      .then(token => studio.music(token))
      .then(setTracks)
      .catch(reason => setError(reason instanceof Error ? reason.message : 'Could not load music'))
      .finally(() => setLoading(false))
    onCleanup(() => {
      stop()
      document.removeEventListener('keydown', closeOnEscape)
    })
  })
  const choice = () => tracks().find(track => track.file === selected())
  return (
    <div
      class="modal-backdrop music-picker-backdrop"
      onMouseDown={event => event.target === event.currentTarget && props.onClose()}
    >
      <section
        class="modal music-picker"
        role="dialog"
        aria-modal="true"
        aria-labelledby="music-picker-title"
      >
        <div class="modal-header music-picker-header">
          <div>
            <span class="music-picker-kicker">Soundtrack</span>
            <h2 id="music-picker-title">Choose a new music bed</h2>
            <p>The AI's choice stays in place until you apply another track.</p>
          </div>
          <button
            type="button"
            class="music-picker-close"
            aria-label="Close music picker"
            onClick={props.onClose}
          >
            <X size={18} />
          </button>
        </div>
        <label class="music-picker-search">
          <Search size={15} />
          <input
            value={query()}
            onInput={event => setQuery(event.currentTarget.value)}
            placeholder="Search tracks"
            autofocus
          />
        </label>
        <div class="track-list music-picker-list">
          <Show
            when={!loading()}
            fallback={<div class="track-empty">Loading soundtrack library...</div>}
          >
            <Show when={!error()} fallback={<div class="track-empty">{error()}</div>}>
              <For
                each={filtered()}
                fallback={<div class="track-empty">No tracks match that search.</div>}
              >
                {track => (
                  <div class={`track-row${selected() === track.file ? ' selected' : ''}`}>
                    <button
                      type="button"
                      class="track-play"
                      aria-label={`${playing() === track.file ? 'Pause' : 'Preview'} ${track.name}`}
                      onClick={() => preview(track)}
                    >
                      {playing() === track.file ? <Pause size={12} /> : <Play size={12} />}
                    </button>
                    <button
                      type="button"
                      class="music-picker-choice"
                      onClick={() => setSelected(track.file)}
                    >
                      <span class="track-name">{track.name}</span>
                      <span class="track-dur">{durationLabel(track.duration)}</span>
                      <span class="track-check">
                        {selected() === track.file ? <Check size={16} /> : null}
                      </span>
                    </button>
                  </div>
                )}
              </For>
            </Show>
          </Show>
        </div>
        <footer class="music-picker-footer">
          <span>
            <Music2 size={14} /> The video will be remixed after you apply.
          </span>
          <button
            type="button"
            class="music-picker-apply"
            disabled={!choice() || selected() === props.current}
            onClick={() => choice() && props.onApply(choice()!)}
          >
            Apply track
          </button>
        </footer>
      </section>
    </div>
  )
}
