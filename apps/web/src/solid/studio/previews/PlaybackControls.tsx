import {
  Maximize,
  Minimize,
  MousePointer2,
  Pause,
  Play,
  RefreshCw,
  Volume2,
  VolumeX,
} from 'lucide-solid'
import { type JSX, Show } from 'solid-js'
import type { ProjectStore } from '../useProject'

export function SelectToggle(props: { active: boolean; onClick: () => void }) {
  return (
    <button
      class={`select-toggle${props.active ? ' on' : ''}`}
      aria-pressed={props.active}
      onClick={props.onClick}
    >
      <MousePointer2 size={13} />
      {props.active ? 'Selecting — esc to stop' : 'Select'}
    </button>
  )
}
export function InspectButton(props: { active: boolean; onClick: () => void }) {
  return (
    <button
      class={`preview-btn preview-inspect-btn ${props.active ? 'active' : ''}`}
      aria-label="Select an element"
      aria-pressed={props.active}
      title="Select an element (I)"
      onClick={props.onClick}
    >
      <MousePointer2 size={18} />
    </button>
  )
}
export function FullscreenButton(props: { active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      class="preview-btn preview-fullscreen-btn"
      aria-label={props.active ? 'Exit fullscreen' : 'Enter fullscreen'}
      title={props.active ? 'Exit fullscreen (F)' : 'Fullscreen (F)'}
      onClick={props.onClick}
    >
      {props.active ? <Minimize size={18} /> : <Maximize size={18} />}
    </button>
  )
}
export function PreviewUpdate(props: { store: ProjectStore }) {
  return (
    <Show when={props.store.previewPending}>
      <button
        class="preview-update-btn"
        title="A newer preview is ready. Update now, or pause to load it."
        onClick={() => void props.store.applyPreview()}
      >
        <RefreshCw size={13} />
        <span>Update preview</span>
      </button>
    </Show>
  )
}
export const playbackTime = (seconds: number) => {
  const value = Math.max(0, Number.isFinite(seconds) ? seconds : 0)
  return `${Math.floor(value / 60)}:${String(Math.floor(value % 60)).padStart(2, '0')}`
}
export function PlaybackControls(props: {
  ready: boolean
  playing: boolean
  muted: boolean
  audio: boolean
  time: number
  duration: number
  fullscreen: boolean
  onPlay: () => void
  onMute: () => void
  onSeek: (time: number) => void
  onFullscreen: () => void
  children?: JSX.Element
}) {
  return (
    <div class="media-controls">
      <input
        class="media-scrub"
        type="range"
        aria-label="Playback position"
        min={0}
        max={props.duration || 1}
        step={0.05}
        value={props.time}
        disabled={!props.ready}
        onInput={event => props.onSeek(Number(event.currentTarget.value))}
        style={{ '--progress': `${Math.min(100, (props.time / (props.duration || 1)) * 100)}%` }}
      />
      <div class="media-controls__row">
        <button
          type="button"
          class="preview-btn"
          aria-label={props.playing ? 'Pause' : 'Play'}
          title={props.playing ? 'Pause (Space)' : 'Play (Space)'}
          disabled={!props.ready}
          onClick={props.onPlay}
        >
          {props.playing ? (
            <Pause size={18} fill="currentColor" />
          ) : (
            <Play size={18} fill="currentColor" />
          )}
        </button>
        <button
          type="button"
          class="preview-btn"
          aria-label={props.muted ? 'Unmute' : 'Mute'}
          title={props.audio ? (props.muted ? 'Unmute' : 'Mute') : 'No audio in this preview'}
          disabled={!props.audio}
          onClick={props.onMute}
        >
          {props.muted || !props.audio ? <VolumeX size={17} /> : <Volume2 size={17} />}
        </button>
        <span class="media-time">
          {playbackTime(props.time)}
          <span> / {playbackTime(props.duration)}</span>
        </span>
        <div class="media-controls__spacer" />
        {props.children}
        <FullscreenButton active={props.fullscreen} onClick={props.onFullscreen} />
      </div>
    </div>
  )
}
