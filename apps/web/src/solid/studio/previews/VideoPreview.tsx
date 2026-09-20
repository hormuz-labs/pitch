import { createEffect, createSignal, For, onCleanup, onMount, Show } from 'solid-js'
import type { PlayerCtrl } from '../types'
import type { ProjectStore } from '../useProject'
import { FullscreenButton, PreviewUpdate } from './PlaybackControls'
import { useFullscreen } from './useFullscreen'

const fmt = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`,
  precise = (t: number) => `${fmt(t)}.${Math.floor((t % 1) * 10)}`
export function VideoPreview(props: {
  store: ProjectStore
  src: string
  showRangeSelector?: boolean
}) {
  const s = props.store
  let video: HTMLVideoElement | undefined,
    player: HTMLDivElement | undefined,
    track: HTMLDivElement | undefined,
    drag: { anchor: number } | null = null
  const fullscreen = useFullscreen(() => player)
  const control: PlayerCtrl = {
    seek: t => {
      if (!video) return
      video.currentTime = Math.max(0, Math.min(t, video.duration || t))
      void video.play().catch(() => {})
    },
    pause: () => video?.pause(),
  }
  const [duration, setDuration] = createSignal(0),
    [range, setRange] = createSignal<{ start: number; end: number } | null>(null)
  createEffect(() => {
    props.src
    setRange(null)
  })
  onCleanup(() => {
    if (s.player.current === control) {
      s.player.current = null
      s.notePlayerState(false)
    }
    video?.pause()
  })
  onMount(() => {
    s.player.current = control
    const key = (event: KeyboardEvent) => {
      if (
        event.key.toLowerCase() !== 'f' ||
        player?.closest('[hidden]') ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        (event.target as HTMLElement)?.closest?.(
          'input,textarea,select,[contenteditable="true"],[role="dialog"],[role="menu"]',
        )
      )
        return
      event.preventDefault()
      void fullscreen.toggle()
    }
    window.addEventListener('keydown', key)
    onCleanup(() => window.removeEventListener('keydown', key))
  })
  const timeAt = (x: number) => {
      const r = track?.getBoundingClientRect()
      return !r || !duration() ? 0 : Math.min(1, Math.max(0, (x - r.left) / r.width)) * duration()
    },
    seek = (t: number) => {
      if (video) {
        video.currentTime = Math.min(Math.max(0, t), duration())
        s.setPlayhead(video.currentTime)
      }
    },
    scenes = () => s.project?.description.scenes ?? [],
    beat = (t: number) => scenes().find(x => t >= x.start && t < x.end),
    isRange = () => !!range() && range()!.end - range()!.start >= 0.25,
    add = () => {
      const r = range()
      if (!r) return
      const b = beat(r.start)
      s.addTarget({
        sceneId: b?.id ?? null,
        tagName: isRange() ? 'range' : 'moment',
        className: '',
        id: '',
        text: b?.label ?? '',
        selector: isRange()
          ? `t=${r.start.toFixed(2)}s..${r.end.toFixed(2)}s`
          : `t=${r.start.toFixed(2)}s`,
        time: r.start,
        ...(isRange() ? { endTime: r.end } : {}),
      })
      if (b) s.setSelectedScene(b.id)
    }
  const down = (e: PointerEvent) => {
      if (!duration()) return
      const t = timeAt(e.clientX)
      drag = { anchor: t }
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
      setRange({ start: t, end: t })
      seek(t)
    },
    move = (e: PointerEvent) => {
      if (!drag) return
      const t = timeAt(e.clientX)
      setRange({ start: Math.min(drag.anchor, t), end: Math.max(drag.anchor, t) })
    },
    up = () => {
      drag = null
      setRange(r => (r && r.end - r.start < 0.25 ? { start: r.start, end: r.start } : r))
    }
  return (
    <div class="video-container">
      <div ref={player} class={`native-preview${fullscreen.active() ? ' is-fullscreen' : ''}`}>
        <video
          ref={video}
          src={props.src}
          controls
          playsinline
          preload="metadata"
          onLoadedMetadata={e => {
            const element = e.currentTarget
            setDuration(element.duration || 0)
            const jump = s.consumeAutoSeek()
            if (jump) {
              element.currentTime = Math.min(
                Math.max(0, jump.t),
                Math.max(0, element.duration - 0.001),
              )
              if (jump.play) void element.play().catch(() => {})
            }
            s.setPlayhead(element.currentTime)
          }}
          onDurationChange={e => setDuration(e.currentTarget.duration || 0)}
          onTimeUpdate={e => s.setPlayhead(e.currentTarget.currentTime)}
          onPlay={() => s.notePlayerState(true)}
          onPause={() => s.notePlayerState(false)}
          onEnded={() => s.notePlayerState(false)}
        />
        <div class="native-preview-actions">
          <PreviewUpdate store={s} />
          <FullscreenButton active={fullscreen.active()} onClick={() => void fullscreen.toggle()} />
        </div>
      </div>
      <Show when={props.showRangeSelector !== false}>
        <div class="video-select">
          <div class="video-select-head">
            <span class="video-select-hint">
              {range()
                ? isRange()
                  ? `${precise(range()!.start)} – ${precise(range()!.end)} · ${(range()!.end - range()!.start).toFixed(1)}s`
                  : `Moment at ${precise(range()!.start)}`
                : 'Drag across the track to select a range, or click a moment'}
            </span>
            <Show when={range()}>
              <span class="video-select-actions">
                <button class="target-clear" onClick={() => setRange(null)}>
                  clear
                </button>
                <button class="video-select-ask" onClick={add}>
                  {isRange() ? 'Ask about this range' : 'Ask about this moment'}
                </button>
              </span>
            </Show>
          </div>
          <div
            ref={track}
            class="video-track"
            onPointerDown={down}
            onPointerMove={move}
            onPointerUp={up}
            onPointerCancel={up}
          >
            <For each={scenes()}>
              {x => (
                <span
                  class="video-track-beat"
                  title={x.label ?? `Moment ${x.index}`}
                  style={{
                    left: `${(x.start / duration()) * 100}%`,
                    width: `${((x.end - x.start) / duration()) * 100}%`,
                  }}
                />
              )}
            </For>
            <Show when={range() !== null && duration() > 0}>
              <Show when={range()} keyed>
                {r => (
                  <span
                    class={`video-track-sel ${isRange() ? '' : 'point'}`}
                    style={{
                      left: `${(r.start / duration()) * 100}%`,
                      width: `${Math.max(((r.end - r.start) / duration()) * 100, 0.4)}%`,
                    }}
                  />
                )}
              </Show>
            </Show>
            <span
              class="video-track-playhead"
              style={{ left: `${duration() ? (s.playhead / duration()) * 100 : 0}%` }}
            />
          </div>
          <div class="video-track-times">
            <span>0:00</span>
            <span>{fmt(duration())}</span>
          </div>
        </div>
      </Show>
    </div>
  )
}
