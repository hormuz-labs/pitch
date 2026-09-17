import { Pause, Play, Volume2, VolumeX } from 'lucide-solid'
import { createSignal, onCleanup, Show } from 'solid-js'
import './audio-player.css'

const time = (seconds: number) => {
  const value = Math.max(0, Math.floor(seconds))
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`
}

export function AudioPlayer(props: { src: string }) {
  let audio!: HTMLAudioElement
  const [playing, setPlaying] = createSignal(false)
  const [duration, setDuration] = createSignal(0)
  const [position, setPosition] = createSignal(0)
  const [volume, setVolume] = createSignal(1)
  const [muted, setMuted] = createSignal(false)
  const [error, setError] = createSignal(false)
  const silent = () => muted() || volume() === 0
  const updateDuration = () => setDuration(Number.isFinite(audio.duration) ? audio.duration : 0)
  const toggle = async () => {
    if (!audio.paused) return audio.pause()
    try {
      await audio.play()
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      setError(true)
    }
  }
  onCleanup(() => audio.pause())

  return (
    <div class="asset-audio-player">
      <audio
        ref={audio}
        src={props.src}
        autoplay
        preload="metadata"
        onLoadStart={() => {
          setPlaying(false)
          setPosition(0)
          setDuration(0)
          setError(false)
        }}
        onLoadedMetadata={updateDuration}
        onDurationChange={updateDuration}
        onTimeUpdate={() => setPosition(audio.currentTime)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onVolumeChange={() => {
          setVolume(audio.volume)
          setMuted(audio.muted)
        }}
        onError={() => setError(true)}
      />
      <div class="asset-audio-transport">
        <button
          type="button"
          class="asset-audio-play"
          aria-label={playing() ? 'Pause audio' : 'Play audio'}
          disabled={error()}
          onClick={() => void toggle()}
        >
          <Show when={playing()} fallback={<Play size={21} fill="currentColor" />}>
            <Pause size={21} fill="currentColor" />
          </Show>
        </button>
        <div class="asset-audio-timeline">
          <input
            class="asset-audio-range"
            type="range"
            min="0"
            max={duration() || 1}
            step="0.1"
            value={position()}
            disabled={!duration() || error()}
            aria-label="Audio position"
            aria-valuetext={`${time(position())} of ${time(duration())}`}
            style={{ '--fill': `${duration() ? (position() / duration()) * 100 : 0}%` }}
            onInput={event => {
              audio.currentTime = event.currentTarget.valueAsNumber
              setPosition(audio.currentTime)
            }}
          />
          <div class="asset-audio-times" aria-hidden="true">
            <span>{time(position())}</span>
            <span>{duration() ? time(duration()) : '–:––'}</span>
          </div>
        </div>
        <div class="asset-audio-volume">
          <button
            type="button"
            class="asset-audio-mute"
            aria-label={silent() ? 'Unmute audio' : 'Mute audio'}
            onClick={() => {
              if (silent()) {
                if (!audio.volume) audio.volume = 1
                audio.muted = false
              } else audio.muted = true
            }}
          >
            <Show when={silent()} fallback={<Volume2 size={18} />}>
              <VolumeX size={18} />
            </Show>
          </button>
          <input
            class="asset-audio-range"
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={muted() ? 0 : volume()}
            aria-label="Audio volume"
            aria-valuetext={`${Math.round((muted() ? 0 : volume()) * 100)}%`}
            style={{ '--fill': `${muted() ? 0 : volume() * 100}%` }}
            onInput={event => {
              audio.volume = event.currentTarget.valueAsNumber
              audio.muted = false
            }}
          />
        </div>
      </div>
      <Show when={error()}>
        <p class="asset-audio-error" role="alert">
          Couldn’t play this audio. Download the file to listen to it.
        </p>
      </Show>
    </div>
  )
}
