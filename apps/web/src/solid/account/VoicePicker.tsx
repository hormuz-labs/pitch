import { AudioLines, Check, Pause, Play, Search, Sparkles, X } from 'lucide-solid'
import { createEffect, createSignal, For, onCleanup, Show } from 'solid-js'
import { listStudioVoices, type StudioVoice, type VoicePreference } from '../../lib/studio-api'
import { useAuth } from '../core/auth'
import { Dialog } from './primitives'

export function VoicePicker(props: {
  value: VoicePreference | null
  onChange: (voice: VoicePreference | null) => void
  onClose: () => void
}) {
  const { getToken } = useAuth()
  const [query, setQuery] = createSignal('')
  const [voices, setVoices] = createSignal<StudioVoice[]>([])
  const [cursor, setCursor] = createSignal<string | null>(null)
  const [loading, setLoading] = createSignal(true)
  const [source, setSource] = createSignal<'account' | 'default'>('account')
  const [error, setError] = createSignal('')
  const [audioError, setAudioError] = createSignal('')
  const [playing, setPlaying] = createSignal<string | null>(null)
  const [buffering, setBuffering] = createSignal(false)
  let request = 0
  let audio: HTMLAudioElement | undefined

  const stop = () => {
    if (audio) {
      audio.pause()
      audio.removeAttribute('src')
      audio.load()
      audio = undefined
    }
    setPlaying(null)
    setBuffering(false)
  }
  const preview = async (voice: StudioVoice) => {
    const wasPlaying = playing() === voice.id
    stop()
    setAudioError('')
    if (wasPlaying || !voice.previewUrl) return
    const player = new Audio(voice.previewUrl)
    audio = player
    setPlaying(voice.id)
    setBuffering(true)
    player.onended = () => {
      if (audio === player) stop()
    }
    player.onerror = () => {
      if (audio !== player) return
      stop()
      setAudioError(`Could not play ${voice.name}'s sample. Try another voice or play it again.`)
    }
    player.onwaiting = () => {
      if (audio === player) setBuffering(true)
    }
    player.onplaying = () => {
      if (audio === player) setBuffering(false)
    }
    try {
      await player.play()
      if (audio === player) setBuffering(false)
    } catch {
      if (audio !== player) return
      stop()
      setAudioError(`Could not play ${voice.name}'s sample. Try another voice or play it again.`)
    }
  }
  const load = async (append = false) => {
    const id = ++request
    setLoading(true)
    setError('')
    try {
      const token = await getToken()
      if (!token) throw new Error('Please sign in again to browse voices.')
      const page = await listStudioVoices(token, query().trim(), append ? (cursor() ?? '') : '')
      if (id !== request) return
      setVoices(current => {
        const combined = append ? [...current, ...page.voices] : page.voices
        return [...new Map(combined.map(voice => [voice.id, voice])).values()]
      })
      setCursor(page.nextCursor)
      setSource(page.source)
    } catch (reason) {
      if (id === request)
        setError(reason instanceof Error ? reason.message : 'Could not load voices.')
    } finally {
      if (id === request) setLoading(false)
    }
  }
  createEffect(() => {
    const search = query()
    ++request
    stop()
    setVoices([])
    setCursor(null)
    setLoading(true)
    setError('')
    const timer = window.setTimeout(() => void load(), search ? 250 : 0)
    onCleanup(() => window.clearTimeout(timer))
  })
  onCleanup(() => {
    ++request
    stop()
  })
  const choose = (voice: VoicePreference | null) => {
    props.onChange(voice)
    props.onClose()
  }
  const labels = (voice: StudioVoice) =>
    [...new Set(Object.values(voice.labels))]
      .filter(Boolean)
      .slice(0, 4)
      .join(' · ')
      .replaceAll('_', ' ')

  return (
    <Dialog open title="Choose a narration voice" onClose={props.onClose} class="voice-picker">
      <header class="voice-picker__header">
        <div>
          <span class="voice-picker__eyebrow">
            <AudioLines size={14} /> ElevenLabs
          </span>
          <h2>Find your voice</h2>
          <p>Listen to a sample. Pick the voice for your project.</p>
        </div>
        <button class="voice-picker__close" aria-label="Close voice picker" onClick={props.onClose}>
          <X size={18} />
        </button>
      </header>
      <label class="voice-picker__search">
        <Search size={17} />
        <input
          autofocus
          type="search"
          aria-label="Search voices"
          placeholder="Search by name, accent, or style"
          maxLength={120}
          value={query()}
          onInput={event => setQuery(event.currentTarget.value)}
        />
      </label>
      <button class="voice-picker__auto" aria-pressed={!props.value} onClick={() => choose(null)}>
        <span class="voice-picker__avatar voice-picker__avatar--auto">
          <Sparkles size={18} />
        </span>
        <span>
          <strong>Let Pitch choose</strong>
          <small>A voice that fits your brief</small>
        </span>
        <Show when={!props.value}>
          <Check size={17} />
        </Show>
      </button>
      <div class="voice-picker__results" data-lenis-prevent aria-busy={loading()}>
        <For each={voices()}>
          {(voice, index) => (
            <div class={`voice-picker__row ${props.value?.id === voice.id ? 'is-selected' : ''}`}>
              <button
                class="voice-picker__sample"
                disabled={!voice.previewUrl}
                aria-label={`${playing() === voice.id ? 'Stop' : 'Play'} ${voice.name} sample`}
                title={voice.previewUrl ? 'Preview voice' : 'No sample available'}
                onClick={() => void preview(voice)}
              >
                <span
                  class="voice-picker__avatar"
                  style={{ '--voice-hue': `${(index() * 47 + 210) % 360}` }}
                >
                  <Show
                    when={playing() === voice.id}
                    fallback={<Play size={16} fill="currentColor" />}
                  >
                    <Show when={!buffering()} fallback={<span class="spinner" />}>
                      <Pause size={16} fill="currentColor" />
                    </Show>
                  </Show>
                </span>
              </button>
              <button
                class="voice-picker__select"
                aria-label={`Use ${voice.name}`}
                aria-pressed={props.value?.id === voice.id}
                onClick={() => choose({ provider: 'elevenlabs', id: voice.id, name: voice.name })}
              >
                <span>
                  <strong>{voice.name}</strong>
                  <small>{labels(voice) || voice.description || 'ElevenLabs voice'}</small>
                </span>
                <Show when={props.value?.id === voice.id}>
                  <Check size={17} />
                </Show>
              </button>
            </div>
          )}
        </For>
        <Show when={loading()}>
          <div class="voice-picker__status" role="status">
            <span class="spinner" /> Loading voices…
          </div>
        </Show>
        <Show when={error()}>
          <div class="voice-picker__status" role="alert">
            <p>{error()}</p>
            <button onClick={() => void load(voices().length > 0)}>Try again</button>
          </div>
        </Show>
        <Show when={!loading() && !error() && !voices().length}>
          <div class="voice-picker__status">
            <Search size={22} />
            <strong>No voices found</strong>
            <p>Try a name or a broader search, like “warm”.</p>
          </div>
        </Show>
        <Show when={cursor() && !loading() && !error()}>
          <button class="voice-picker__more" onClick={() => void load(true)}>
            Load more voices
          </button>
        </Show>
      </div>
      <Show when={audioError()}>
        <p class="voice-picker__error" role="alert">
          {audioError()}
        </p>
      </Show>
      <footer class="voice-picker__footer">
        {source() === 'default' ? 'ElevenLabs standard voices. ' : ''}Samples are free to preview.
        Your choice is used when your project needs narration.
      </footer>
    </Dialog>
  )
}
