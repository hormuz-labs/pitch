import { Mic, Music, SkipBack } from 'lucide-solid'
import { createEffect, createMemo, For, Show } from 'solid-js'
import { fmt, timelineFollowScrollLeft } from './helpers'
import type { Scene } from './types'
import type { ProjectStore } from './useProject'

function Thumb(props: { store: ProjectStore; t: number; label: string }) {
  return (
    <div class="scene-thumb">
      <Show
        when={props.store.thumbnailUrl(props.t)}
        fallback={<span class="scene-thumb-fallback">{props.label}</span>}
      >
        {u => <img src={u()!} alt={props.label} draggable={false} />}
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
  let viewport: HTMLDivElement | undefined, head: HTMLSpanElement | undefined
  const scenes = () => s.project?.description.scenes ?? [],
    duration = () => s.project?.description.duration || scenes().at(-1)?.end || 1,
    cues = createMemo<Cue[]>(() => {
      const raw = (s.project?.description.extra as any)?.sfxCues
      if (Array.isArray(raw) && raw.length)
        return raw.map((c: any, i: number) => ({
          id: c.id ?? `sfx-${i}`,
          label: c.label ?? c.event ?? 'cue',
          time: Number(c.t ?? c.time ?? 0),
          sceneId: c.sceneId,
        }))
      const out: Cue[] = []
      scenes().forEach((x, i) => {
        if (i)
          out.push({
            id: `sfx-trans-${i}`,
            label: i === 1 ? 'whoosh_fast' : i === 2 ? 'click_soft' : 'swoosh_out',
            time: x.start,
            sceneId: x.id,
          })
        if (x.dur >= 4)
          out.push({
            id: `sfx-accent-${i}`,
            label: i % 2 ? 'impact_drop' : 'chime_accent',
            time: x.start + Math.min(2.5, x.dur / 2),
            sceneId: x.id,
          })
      })
      return out.sort((a, b) => a.time - b.time)
    }),
    tracks = createMemo(() => {
      const result: Cue[][] = [[]],
        gap = Math.max(2.4, duration() * 0.065)
      for (const cue of cues()) {
        let row = result.find(x => !x.length || cue.time - x.at(-1)!.time >= gap)
        if (!row) {
          row = []
          result.push(row)
        }
        row.push(cue)
      }
      return result.slice(0, 3)
    }),
    width = () => Math.min(7200, Math.max(760, Math.ceil(duration() * 48), scenes().length * 132))
  createEffect(() => {
    s.playhead
    s.playing
    width()
    requestAnimationFrame(() => {
      if (!viewport || !head) return
      const vr = viewport.getBoundingClientRect(),
        hr = head.getBoundingClientRect(),
        x = viewport.scrollLeft + hr.left - vr.left,
        next = timelineFollowScrollLeft(
          x,
          viewport.scrollLeft,
          viewport.clientWidth,
          viewport.scrollWidth,
          Math.min(104, viewport.clientWidth * 0.28),
          s.playing,
        )
      if (next != null) viewport.scrollTo({ left: next, behavior: s.playing ? 'auto' : 'smooth' })
    })
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
      style={{
        '--timeline-content-w': `${width()}px`,
        '--playhead-pct': `${(s.playhead / duration()) * 100}%`,
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
            <button class="transport-btn" onClick={() => s.seekPlayer(0)}>
              <SkipBack size={12} />
            </button>
            <span class="pro-timecode-badge">
              {fmt(s.playhead)} / {fmt(duration())}
            </span>
            <span class="pro-track-stats">
              {scenes().length} scenes · {3 + tracks().length} tracks
            </span>
          </div>
          <span class="pro-toolbar-hint">Click any Scene, Voice, SFX or Music to edit in chat</span>
        </div>
        <div class="pro-timeline-grid" ref={viewport}>
          <div class="pro-timeline-canvas" style={{ '--timeline-content-w': `${width()}px` }}>
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
                <span class="playhead-anchor" ref={head} />
                <For each={[0, 0.25, 0.5, 0.75, 1]}>
                  {f => (
                    <span class="ruler-mark" style={{ left: `${f * 100}%` }}>
                      {fmt(f * duration())}
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
                      class={`scene-card ${x.id === s.selectedScene ? 'selected' : ''} ${s.playhead >= x.start && s.playhead < x.end ? 'playing' : ''}`}
                      style={{ flex: `${Math.max(0.8, x.dur)} 0 0%` }}
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
            <div class="modular-track-row row-vo">
              <div class="modular-track-cover cover-vo">
                <span class="track-tag">Voiceover</span>
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
                      onClick={() => target(x, 'voiceover')}
                    >
                      <Mic size={10} />
                      <span class="item-text">"{x.label}"</span>
                    </button>
                  )}
                </For>
              </div>
            </div>
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
            <div class="modular-track-row row-music">
              <div class="modular-track-cover cover-music">
                <span class="track-tag">Music Bed</span>
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
                      text: 'background music bed',
                      tagName: 'music',
                      selector: 'audio#music',
                      className: 'music-bed',
                      id: 'music-bed',
                    })
                  }
                >
                  <Music size={10} />
                  <span class="item-text">
                    BGM Bed (audio/music.mp3 — ducks under voiceover speech)
                  </span>
                </button>
              </div>
            </div>
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
