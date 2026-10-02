import { Check, Music2, Pause, Play, Search, Upload, X } from 'lucide-solid'
import { createMemo, createSignal, For, onCleanup, onMount, Show } from 'solid-js'
import { AUDIO_ACCEPT, attachmentLimitError } from '../../lib/attachments'
import { studio } from './client'
import type { Asset, MusicTrack } from './types'

function durationLabel(seconds: number | null): string {
  if (seconds === null) return ''
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

export function MusicPicker(props: {
  current?: string
  getToken: () => Promise<string>
  mediaUrl: (path: string | null | undefined) => string | null
  assets: Asset[]
  onUpload: (file: File) => Promise<MusicTrack>
  onApply: (track: MusicTrack) => void
  onClose: () => void
}) {
  const [tracks, setTracks] = createSignal<MusicTrack[]>([])
  const [query, setQuery] = createSignal('')
  const [selected, setSelected] = createSignal(props.current ?? '')
  const [playing, setPlaying] = createSignal('')
  const [loading, setLoading] = createSignal(true)
  const [error, setError] = createSignal('')
  const [libraryError, setLibraryError] = createSignal('')
  const [uploaded, setUploaded] = createSignal<MusicTrack[]>([])
  const [uploading, setUploading] = createSignal(false)
  const [dragging, setDragging] = createSignal(false)
  let audio: HTMLAudioElement | undefined
  let input: HTMLInputElement | undefined
  let dragDepth = 0
  const allTracks = createMemo(() => {
    const personal = props.assets
      .filter(asset => asset.kind === 'audio' && asset.origin === 'upload')
      .map(asset => ({ name: asset.name, file: asset.path, url: asset.url, duration: null }))
    return [
      ...new Map(
        [...uploaded(), ...personal, ...tracks()].map(track => [track.file, track]),
      ).values(),
    ]
  })
  const filtered = createMemo(() => {
    const value = query().trim().toLowerCase()
    return value
      ? allTracks().filter(track => track.name.toLowerCase().includes(value))
      : allTracks()
  })
  const upload = async (files: File[]) => {
    if (uploading() || !files.length) return
    if (files.length !== 1) {
      setError('Choose one soundtrack at a time.')
      return
    }
    const file = files[0]
    const extension = file.name.match(/\.[a-z0-9]+$/i)?.[0]?.toLowerCase()
    if (!extension || !AUDIO_ACCEPT.split(',').includes(extension)) {
      setError('Use an MP3, WAV, M4A, AAC, OGG or FLAC audio file.')
      return
    }
    const sizeError = attachmentLimitError(files)
    if (sizeError) {
      setError(sizeError)
      return
    }
    setError('')
    setUploading(true)
    try {
      const track = await props.onUpload(file)
      setUploaded(current => [track, ...current.filter(item => item.file !== track.file)])
      setSelected(track.file)
      setQuery('')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not upload soundtrack')
    } finally {
      setUploading(false)
    }
  }
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
      .catch(reason =>
        setLibraryError(reason instanceof Error ? reason.message : 'Could not load music'),
      )
      .finally(() => setLoading(false))
    onCleanup(() => {
      stop()
      document.removeEventListener('keydown', closeOnEscape)
    })
  })
  const choice = () => allTracks().find(track => track.file === selected())
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
        onDragEnter={event => {
          if (!event.dataTransfer?.types.includes('Files')) return
          event.preventDefault()
          dragDepth++
          setDragging(true)
        }}
        onDragOver={event => {
          if (!event.dataTransfer?.types.includes('Files')) return
          event.preventDefault()
          event.dataTransfer.dropEffect = uploading() ? 'none' : 'copy'
        }}
        onDragLeave={() => {
          dragDepth = Math.max(0, dragDepth - 1)
          if (!dragDepth) setDragging(false)
        }}
        onDrop={event => {
          if (!event.dataTransfer?.types.includes('Files') && !event.dataTransfer?.files.length)
            return
          event.preventDefault()
          dragDepth = 0
          setDragging(false)
          void upload(Array.from(event.dataTransfer!.files))
        }}
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
        <div class="music-picker-upload" classList={{ 'is-dropping': dragging() }}>
          <button type="button" disabled={uploading()} onClick={() => input?.click()}>
            <Show when={!uploading()} fallback={<span class="spinner" />}>
              <Upload size={15} />
            </Show>
            {uploading() ? 'Uploading soundtrack…' : 'Upload soundtrack'}
          </button>
          <span>
            {dragging() ? 'Drop your audio file here' : 'Or drag audio here · up to 50 MB'}
          </span>
          <input
            ref={input}
            type="file"
            accept={AUDIO_ACCEPT}
            hidden
            onChange={event => {
              void upload(Array.from(event.currentTarget.files ?? []))
              event.currentTarget.value = ''
            }}
          />
        </div>
        <Show when={error()}>
          <div class="music-picker-error" role="alert">
            {error()}
          </div>
        </Show>
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
          <Show when={loading()}>
            <div class="track-empty">Loading soundtrack library...</div>
          </Show>
          <Show when={libraryError()}>
            <div class="track-empty">{libraryError()}</div>
          </Show>
          <For
            each={filtered()}
            fallback={!loading() && <div class="track-empty">No tracks match that search.</div>}
          >
            {track => (
              <div class={`track-row${selected() === track.file ? ' selected' : ''}`}>
                <button
                  type="button"
                  class={`track-play${playing() === track.file ? ' is-playing' : ''}`}
                  aria-label={`${playing() === track.file ? 'Pause' : 'Preview'} ${track.name}`}
                  onClick={() => preview(track)}
                >
                  {playing() === track.file ? (
                    <Pause size={12} fill="currentColor" />
                  ) : (
                    <Play size={12} fill="currentColor" />
                  )}
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
                  <Show when={track.file.startsWith('uploads/')}>
                    <small class="music-picker-personal">Your audio</small>
                  </Show>
                </button>
              </div>
            )}
          </For>
        </div>
        <footer class="music-picker-footer">
          <span>
            <Music2 size={14} /> The video will be remixed after you apply.
          </span>
          <button
            type="button"
            class="music-picker-apply"
            disabled={uploading() || !choice() || selected() === props.current}
            onClick={() => choice() && props.onApply(choice()!)}
          >
            Apply track
          </button>
        </footer>
      </section>
    </div>
  )
}
