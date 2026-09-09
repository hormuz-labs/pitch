import { createEffect, createSignal, For, onCleanup, Show } from 'solid-js'
import type { ProjectStore } from '../useProject'

const fmt = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`,
  precise = (t: number) => `${fmt(t)}.${Math.floor((t % 1) * 10)}`
export function VideoPreview(props: { store: ProjectStore; src: string }) {
  const s = props.store
  let video: HTMLVideoElement | undefined,
    track: HTMLDivElement | undefined,
    drag: { anchor: number; moved: boolean } | null = null
  const [duration, setDuration] = createSignal(0),
    [range, setRange] = createSignal<{ start: number; end: number } | null>(null)
  createEffect(() => {
    props.src
    setRange(null)
  })
  onCleanup(() => {
    s.player.current = null
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
      drag = { anchor: t, moved: false }
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
      <video
        ref={el => {
          video = el
          s.player.current = {
            seek: t => {
              el.currentTime = t
              void el.play()
            },
          }
        }}
        src={props.src}
        controls
        preload="metadata"
        onLoadedMetadata={e => setDuration(e.currentTarget.duration || 0)}
        onDurationChange={e => setDuration(e.currentTarget.duration || 0)}
        onTimeUpdate={e => s.setPlayhead(e.currentTarget.currentTime)}
        onPlay={() => s.notePlayerState(true)}
        onPause={() => s.notePlayerState(false)}
      />
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
        <Show when={duration()}>
          <div class="video-frames">
            <For each={Array.from({ length: 12 }, (_, i) => ((i + 0.5) * duration()) / 12)}>
              {t => (
                <button
                  class={`video-frame${Math.abs(s.playhead - t) < duration() / 24 ? ' on' : ''}`}
                  onClick={() => {
                    seek(t)
                    setRange({ start: t, end: t })
                  }}
                >
                  <img src={s.thumbnailUrl(t) ?? ''} alt="" loading="lazy" draggable={false} />
                  <span class="video-frame-time">{fmt(t)}</span>
                </button>
              )}
            </For>
          </div>
        </Show>
      </div>
      <Show when={s.busy}>
        <div class="preview-updating">
          <span class="spinner" /> Updating preview…
        </div>
      </Show>
    </div>
  )
}
