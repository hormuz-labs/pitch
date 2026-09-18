import { LocateFixed, Mic, Music, SkipBack } from 'lucide-solid'
import { createEffect, createMemo, createSignal, For, onCleanup, onMount, Show } from 'solid-js'
import { fmt, fmtRulerTick, timelineFollowScrollLeft, timelineRulerTicks } from './helpers'
import type { Scene } from './types'
import type { ProjectStore } from './useProject'

function Thumb(props: { store: ProjectStore; t: number; label: string }) {
  const [src, setSrc] = createSignal<string | null>(null)
  const [loaded, setLoaded] = createSignal(false)
  let contentKey = ''
  createEffect(() => {
    const key = `${props.store.videoVersion}:${props.t}`
    const candidate = props.store.thumbnailUrl(props.t)
    if (key !== contentKey) {
      contentKey = key
      setLoaded(false)
      setSrc(candidate)
    } else if (!loaded()) {
      // Lazy/failed thumbnails need current credentials. Already decoded
      // images keep their source so token renewal cannot flash the strip.
      setSrc(candidate)
    }
  })
  return (
    <div class="scene-thumb">
      <span class="scene-thumb-fallback" aria-hidden="true">
        {props.label}
      </span>
      <Show when={src()}>
        {url => (
          <img
            src={url()}
            alt={props.label}
            classList={{ 'is-loaded': loaded() }}
            loading="lazy"
            decoding="async"
            draggable={false}
            onLoad={() => setLoaded(true)}
            onError={() => setLoaded(false)}
          />
        )}
      </Show>
    </div>
  )
}
interface Cue {
  id: string
  label: string
  time: number
  sceneId?: string
}
export function SceneStrip(props: { store: ProjectStore }) {
  const s = props.store
  const [follow, setFollow] = createSignal(false)
  const [rulerWidth, setRulerWidth] = createSignal(760)
  let viewport: HTMLDivElement | undefined
  const scenes = createMemo(() => s.project?.description.scenes ?? []),
    duration = createMemo(() => s.project?.description.duration || scenes().at(-1)?.end || 1),
    cues = createMemo<Cue[]>(() => {
      const raw = (s.project?.description.extra as any)?.sfxCues
      if (Array.isArray(raw) && raw.length)
        return raw.map((c: any, i: number) => ({
          id: c.id ?? `sfx-${i}`,
          label: c.label ?? c.event ?? 'cue',
          time: Number(c.t ?? c.time ?? 0),
          sceneId: c.sceneId,
        }))
      return []
    }),
    tracks = createMemo(() => {
      const result: Cue[][] = [],
        gap = Math.max(2.4, duration() * 0.065)
      for (const cue of [...cues()]
        .filter(c => Number.isFinite(c.time) && c.time >= 0 && c.time < duration())
        .sort((a, b) => a.time - b.time)) {
        let row = result.find(x => !x.length || cue.time - x.at(-1)!.time >= gap)
        if (!row) {
          row = []
          result.push(row)
        }
        row.push(cue)
      }
      return result
    }),
    width = createMemo(() =>
      Math.min(7200, Math.max(760, Math.ceil(duration() * 48), scenes().length * 132)),
    ),
    contentWidth = createMemo(() => Math.max(width(), rulerWidth())),
    playheadX = () => Math.max(0, Math.min(1, s.playhead / duration())) * contentWidth(),
    rulerTicks = createMemo(() => timelineRulerTicks(duration(), contentWidth())),
    activeScene = createMemo(
      () => scenes().find(scene => s.playhead >= scene.start && s.playhead < scene.end)?.id,
    )
  createEffect(() => {
    const playing = s.playing
    if (playing && !follow()) return
    const x = 112 + playheadX()
    const frame = requestAnimationFrame(() => {
      if (!viewport) return
      const next = timelineFollowScrollLeft(
        x,
        viewport.scrollLeft,
        viewport.clientWidth,
        viewport.scrollWidth,
        Math.min(104, viewport.clientWidth * 0.28),
        playing,
      )
      if (next != null) viewport.scrollTo({ left: next, behavior: 'smooth' })
    })
    onCleanup(() => cancelAnimationFrame(frame))
  })
  onMount(() => {
    if (!viewport) return
    const measure = () => setRulerWidth(Math.max(240, viewport!.clientWidth - 104))
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(viewport)
    onCleanup(() => observer.disconnect())
  })
  const target = (scene: Scene, kind = 'scene') => {
    s.seekPlayer(scene.start + 0.01)
    s.addTarget({
      sceneId: scene.id,
      time: scene.start,
      endTime: scene.end,
      text: kind === 'voiceover' ? `voiceover: "${scene.label}"` : scene.label || scene.id,
      tagName: kind,
      selector: `${kind}#${scene.id}`,
      className: kind === 'voiceover' ? 'vo-clip' : 'scene-card',
      id: scene.id,
    })
  }
  return (
    <div
      class="timeline pro-multi-track-timeline"
      classList={{ 'is-empty': !scenes().length }}
      style={{
        '--timeline-content-w': `${contentWidth()}px`,
      }}
    >
      <Show
        when={scenes().length}
        fallback={
          <>
            <div class="timeline-header">
              <h2>Timeline</h2>
              <span class="timeline-meta">Scenes appear as they are created</span>
            </div>
            <div class="timeline-empty">No scenes yet.</div>
          </>
        }
      >
        <div class="pro-timeline-toolbar">
          <div class="pro-toolbar-left">
            <button
              class="transport-btn"
              aria-label="Seek to start"
              onClick={() => s.seekPlayer(0)}
            >
              <SkipBack size={12} />
            </button>
            <span class="pro-timecode-badge">
              {fmt(s.playhead)} / {fmt(duration())}
            </span>
            <span class="pro-track-stats">
              {scenes().length} scenes ·{' '}
              {1 +
                (scenes().some(x => x.label) ? 1 : 0) +
                (s.project?.description.audioUrl ? 1 : 0) +
                tracks().length}{' '}
              tracks
            </span>
          </div>
          <button
            class={`timeline-follow-btn${follow() ? ' is-active' : ''}`}
            aria-label="Follow playhead"
            aria-pressed={follow()}
            title="Automatically scroll the timeline during playback"
            onClick={() => setFollow(value => !value)}
          >
            <LocateFixed size={13} />
            <span>Follow</span>
          </button>
        </div>
        <div
          class="pro-timeline-grid"
          ref={viewport}
          onWheel={() => setFollow(false)}
          onTouchStart={() => setFollow(false)}
        >
          <div
            class="pro-timeline-canvas"
            style={{ '--timeline-content-w': `${contentWidth()}px` }}
          >
            <span
              class="timeline-playhead"
              aria-hidden="true"
              style={{
                transform: `translate3d(${playheadX()}px, 0, 0)`,
                transition: s.playing ? 'transform 100ms linear' : 'none',
              }}
            />
            <div class="modular-track-row ruler-row">
              <div class="modular-track-cover ruler-corner" />
              <div
                class="modular-track-lane time-ruler"
                onClick={e =>
                  s.seekPlayer(
                    Math.max(
                      0,
                      Math.min(
                        duration(),
                        ((e.clientX - e.currentTarget.getBoundingClientRect().left) /
                          e.currentTarget.getBoundingClientRect().width) *
                          duration(),
                      ),
                    ),
                  )
                }
              >
                <For each={rulerTicks()}>
                  {tick => (
                    <span class="ruler-mark" style={{ left: `${(tick / duration()) * 100}%` }}>
                      {fmtRulerTick(tick, duration())}
                    </span>
                  )}
                </For>
              </div>
            </div>
            <div class="modular-track-row row-video">
              <div class="modular-track-cover cover-video">
                <span class="track-tag">Video</span>
              </div>
              <div class="modular-track-lane lane-video">
                <For each={scenes()}>
                  {x => (
                    <button
                      class={`scene-card ${x.id === s.selectedScene ? 'selected' : ''} ${activeScene() === x.id ? 'playing' : ''}`}
                      title={`${x.label || x.id} · ${fmt(x.start)}–${fmt(x.end)}`}
                      style={{
                        left: `${(x.start / duration()) * 100}%`,
                        width: `${(Math.max(0, x.end - x.start) / duration()) * 100}%`,
                      }}
                      onClick={() => {
                        s.setSelectedScene(x.id === s.selectedScene ? null : x.id)
                        target(x)
                      }}
                    >
                      <Thumb store={s} t={x.start + 0.05} label={String(x.index)} />
                      <div class="scene-card-label">
                        <span class="scene-name">{x.id}</span>
                        <span class="scene-time">{fmt(x.dur)}</span>
                      </div>
                    </button>
                  )}
                </For>
              </div>
            </div>
            <Show when={scenes().some(x => x.label)}>
              <div class="modular-track-row row-vo">
                <div class="modular-track-cover cover-vo">
                  <span class="track-tag">Scene notes</span>
                </div>
                <div class="modular-track-lane lane-vo">
                  <For each={scenes().filter(x => x.label)}>
                    {x => (
                      <button
                        class="timeline-item item-vo"
                        style={{
                          left: `${(x.start / duration()) * 100}%`,
                          width: `${(x.dur / duration()) * 100}%`,
                        }}
                        title={x.label ?? x.id}
                        onClick={() => target(x)}
                      >
                        <Mic size={10} />
                        <span class="item-text">"{x.label}"</span>
                      </button>
                    )}
                  </For>
                </div>
              </div>
            </Show>
            <For each={tracks()}>
              {(row, i) => (
                <div class="modular-track-row row-sfx">
                  <div class="modular-track-cover cover-sfx">
                    <span class="track-tag">{tracks().length > 1 ? `SFX ${i() + 1}` : 'SFX'}</span>
                  </div>
                  <div class="modular-track-lane lane-sfx">
                    <For each={row}>
                      {cue => (
                        <button
                          class="timeline-item item-sfx"
                          style={{ left: `${(cue.time / duration()) * 100}%` }}
                          onClick={() => {
                            s.seekPlayer(cue.time)
                            s.addTarget({
                              sceneId: cue.sceneId ?? null,
                              time: cue.time,
                              text: `sfx: ${cue.label}`,
                              tagName: 'sfx',
                              selector: `sfx#${cue.id}`,
                              className: 'sfx-cue',
                              id: cue.id,
                            })
                          }}
                        >
                          <span class="sfx-indicator-dot" />
                          <span class="item-text">{cue.label}</span>
                          <span class="sfx-time-tag">{fmt(cue.time)}</span>
                        </button>
                      )}
                    </For>
                  </div>
                </div>
              )}
            </For>
            <Show when={s.project?.description.audioUrl}>
              <div class="modular-track-row row-music">
                <div class="modular-track-cover cover-music">
                  <span class="track-tag">Audio mix</span>
                </div>
                <div class="modular-track-lane lane-music">
                  <button
                    class="timeline-item item-music"
                    style={{ left: '0%', width: '100%' }}
                    onClick={() =>
                      s.addTarget({
                        sceneId: null,
                        time: 0,
                        endTime: duration(),
                        text: 'project audio mix',
                        tagName: 'audio',
                        selector: 'audio#mix',
                        className: 'audio-mix',
                        id: 'audio-mix',
                      })
                    }
                  >
                    <Music size={10} />
                    <span class="item-text">Project audio</span>
                  </button>
                </div>
              </div>
            </Show>
          </div>
        </div>
      </Show>
    </div>
  )
}
export function SlideStrip(props: { store: ProjectStore }) {
  const s = props.store,
    slides = () => s.project?.description.slides ?? []
  return (
    <div class="timeline">
      <div class="timeline-header">
        <h2>Slides</h2>
        <span class="timeline-meta">{slides().length} slides</span>
      </div>
      <Show when={slides().length} fallback={<div class="timeline-empty">No slides yet.</div>}>
        <div class="strip">
          <For each={slides()}>
            {x => (
              <div
                class={`scene-card ${x.index === s.selectedSlide ? 'selected' : ''}`}
                onClick={() => s.setSelectedSlide(x.index === s.selectedSlide ? null : x.index)}
              >
                <Thumb store={s} t={x.index} label={String(x.index)} />
                <div class="scene-card-label">
                  <span class="scene-name">{x.title?.slice(0, 18) ?? `Slide ${x.index}`}</span>
                  <span class="scene-time">{x.index}</span>
                </div>
              </div>
            )}
          </For>
        </div>
      </Show>
    </div>
  )
}
