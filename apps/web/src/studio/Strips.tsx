import { Mic, Music, SkipBack } from 'lucide-react'
import { type CSSProperties, useEffect, useMemo, useRef, useState } from 'react'
import type { Scene } from './client'
import { timelineFollowScrollLeft } from './timelineFollow'
import type { ProjectStore } from './useProject'

export function fmt(t: number): string {
  const m = Math.floor(t / 60)
  const s = (t % 60).toFixed(1).padStart(4, '0')
  return m > 0 ? `${m}:${s}` : `${s}s`
}

function Thumb({ store, t, label }: { store: ProjectStore; t: number; label: string }) {
  const [failed, setFailed] = useState(false)
  const url = store.thumbnailUrl(t)
  useEffect(() => setFailed(false), [url])
  return (
    <div className="scene-thumb">
      {url && !failed ? (
        <img src={url} alt={label} draggable={false} onError={() => setFailed(true)} />
      ) : (
        <span className="scene-thumb-fallback">{label}</span>
      )}
    </div>
  )
}

interface SfxCue {
  id: string
  label: string
  time: number
  sceneId?: string
}

/** Multi-track timeline for timed preview: Video scenes, Voiceover, SFX, and Music. */
export function SceneStrip({ store }: { store: ProjectStore }) {
  const s = store
  const scenes = s.project?.description.scenes ?? []
  const duration = s.project?.description.duration || scenes[scenes.length - 1]?.end || 1
  const isPlaying = (scene: Scene) => s.playhead >= scene.start && s.playhead < scene.end
  const scrollViewportRef = useRef<HTMLDivElement | null>(null)
  const playheadRef = useRef<HTMLDivElement | null>(null)

  // SFX cues from project extra or derived from scene pacing & transitions
  const sfxCues = useMemo<SfxCue[]>(() => {
    const extraCues = (s.project?.description.extra as any)?.sfxCues
    if (Array.isArray(extraCues) && extraCues.length > 0) {
      return extraCues.map((c: any, i: number) => ({
        id: c.id ?? `sfx-${i}`,
        label: c.label ?? c.event ?? 'cue',
        time: Number(c.t ?? c.time ?? 0),
        sceneId: c.sceneId,
      }))
    }
    const derived: SfxCue[] = []
    scenes.forEach((scene, i) => {
      if (i > 0) {
        derived.push({
          id: `sfx-trans-${i}`,
          label: i === 1 ? 'whoosh_fast' : i === 2 ? 'click_soft' : 'swoosh_out',
          time: scene.start,
          sceneId: scene.id,
        })
      }
      if (scene.dur >= 4) {
        derived.push({
          id: `sfx-accent-${i}`,
          label: i % 2 === 0 ? 'chime_accent' : 'impact_drop',
          time: scene.start + Math.min(2.5, scene.dur / 2),
          sceneId: scene.id,
        })
      }
    })
    return derived.sort((a, b) => a.time - b.time)
  }, [s.project?.description.extra, scenes])

  // Distribute SFX cues into non-overlapping tracks (e.g. SFX 1, SFX 2) so they never overlay
  const sfxTracks = useMemo<SfxCue[][]>(() => {
    if (sfxCues.length === 0) return [[]]
    const tracks: SfxCue[][] = [[]]
    // Minimum time gap between cues on the same track before moving to another layer
    const minGap = Math.max(2.4, duration * 0.065)
    for (const cue of sfxCues) {
      let placed = false
      for (const track of tracks) {
        const last = track[track.length - 1]
        if (!last || cue.time - last.time >= minGap) {
          track.push(cue)
          placed = true
          break
        }
      }
      if (!placed) {
        tracks.push([cue])
      }
    }
    return tracks.slice(0, 3)
  }, [sfxCues, duration])

  const timelineWidth = Math.min(7200, Math.max(760, Math.ceil(duration * 48), scenes.length * 132))

  useEffect(() => {
    const viewport = scrollViewportRef.current
    const playhead = playheadRef.current
    if (!viewport || !playhead) return

    const frame = window.requestAnimationFrame(() => {
      const viewportRect = viewport.getBoundingClientRect()
      const playheadRect = playhead.getBoundingClientRect()
      const contentX = viewport.scrollLeft + playheadRect.left - viewportRect.left
      const leadingInset = Math.min(104, viewport.clientWidth * 0.28)
      const nextScrollLeft = timelineFollowScrollLeft({
        contentX,
        scrollLeft: viewport.scrollLeft,
        viewportWidth: viewport.clientWidth,
        scrollWidth: viewport.scrollWidth,
        leadingInset,
        playing: s.playing,
      })
      if (nextScrollLeft == null) return
      const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      viewport.scrollTo({
        left: nextScrollLeft,
        behavior: s.playing || reduceMotion ? 'auto' : 'smooth',
      })
    })

    return () => window.cancelAnimationFrame(frame)
  }, [s.playhead, s.playing, timelineWidth])

  const pickScene = (scene: Scene) => {
    s.setSelectedScene(scene.id === s.selectedScene ? null : scene.id)
    s.seekPlayer(scene.start + 0.01)
    s.addTarget({
      sceneId: scene.id,
      time: scene.start,
      endTime: scene.end,
      text: scene.label || scene.id,
      tagName: 'scene',
      selector: `scene#${scene.id}`,
      className: 'scene-card',
      id: scene.id,
    })
  }

  const pickVo = (scene: Scene) => {
    s.seekPlayer(scene.start + 0.01)
    s.addTarget({
      sceneId: scene.id,
      time: scene.start,
      endTime: scene.end,
      text: `voiceover: "${scene.label}"`,
      tagName: 'voiceover',
      selector: `vo#${scene.id}`,
      className: 'vo-clip',
      id: `vo-${scene.id}`,
    })
  }

  const pickSfx = (cue: SfxCue) => {
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
  }

  const pickMusic = () => {
    s.seekPlayer(0)
    s.addTarget({
      sceneId: null,
      time: 0,
      endTime: duration,
      text: 'background music bed',
      tagName: 'music',
      selector: 'audio#music',
      className: 'music-bed',
      id: 'music-bed',
    })
  }

  if (scenes.length === 0) {
    return (
      <div className="timeline">
        <div className="timeline-header">
          <h2>Timeline</h2>
          <span className="timeline-meta">
            {s.busy && s.liveCount != null
              ? `building, ${s.liveCount} scenes so far`
              : 'Scenes appear as they are created'}
          </span>
        </div>
        {s.busy ? (
          <div className="strip">
            {[0, 1, 2, 3, 4, 5].map(i => (
              <div key={i} className="scene-card skeleton" />
            ))}
          </div>
        ) : (
          <div className="timeline-empty">
            No scenes yet — they appear as soon as the first ones are saved.
          </div>
        )}
      </div>
    )
  }

  const playheadPct = duration > 0 ? Math.min(100, Math.max(0, (s.playhead / duration) * 100)) : 0

  return (
    <div
      className="timeline pro-multi-track-timeline"
      data-playing={s.playing ? 'true' : 'false'}
      style={
        {
          '--timeline-content-w': `${timelineWidth}px`,
          '--playhead-pct': `${playheadPct}%`,
        } as CSSProperties
      }
    >
      <div className="pro-timeline-toolbar">
        <div className="pro-toolbar-left">
          <button
            type="button"
            className="transport-btn"
            title="Rewind to start"
            aria-label="Rewind timeline to start"
            onClick={() => s.seekPlayer(0)}
          >
            <SkipBack size={12} />
          </button>
          <span className="pro-timecode-badge">
            {fmt(s.playhead)} / {fmt(duration)}
          </span>
          <span className="pro-track-stats">
            {scenes.length} scenes · {3 + sfxTracks.length} tracks
          </span>
        </div>
        <span className="pro-toolbar-hint">
          Click any Scene, Voice, SFX or Music to edit in chat
        </span>
      </div>

      <div className="pro-timeline-grid" ref={scrollViewportRef}>
        <div
          className="pro-timeline-canvas"
          style={{ '--timeline-content-w': `${timelineWidth}px` } as CSSProperties}
        >
          {/* Section 0: Sticky Time Ruler Row */}
          <div className="modular-track-row ruler-row">
            <div className="modular-track-cover ruler-corner" />
            <div
              className="modular-track-lane time-ruler"
              onClick={e => {
                const rect = e.currentTarget.getBoundingClientRect()
                const clickX = e.clientX - rect.left
                const nextT = Math.max(0, Math.min(duration, (clickX / rect.width) * duration))
                s.seekPlayer(nextT)
              }}
            >
              <span className="playhead-anchor" ref={playheadRef} aria-hidden="true" />
              {[0, 0.25, 0.5, 0.75, 1].map(frac => (
                <span key={frac} className="ruler-mark" style={{ left: `${frac * 100}%` }}>
                  {fmt(frac * duration)}
                </span>
              ))}
            </div>
          </div>

          {/* Section 1: Video Scenes Track */}
          <div className="modular-track-row row-video">
            <div className="modular-track-cover cover-video">
              <span className="track-tag">Video</span>
            </div>
            <div className="modular-track-lane lane-video">
              {scenes.map(scene => (
                <button
                  type="button"
                  key={scene.id}
                  className={`scene-card ${scene.id === s.selectedScene ? 'selected' : ''} ${isPlaying(scene) ? 'playing' : ''}`}
                  onClick={() => pickScene(scene)}
                  style={{ flex: `${Math.max(0.8, scene.dur)} 0 0%` }}
                  title={`${scene.id}: ${fmt(scene.start)} – ${fmt(scene.end)}`}
                >
                  <Thumb store={s} t={scene.start + 0.05} label={String(scene.index)} />
                  <div className="scene-card-label">
                    <span className="scene-name">{scene.id}</span>
                    <span className="scene-time">{fmt(scene.dur)}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Section 2: Voiceover Track */}
          <div className="modular-track-row row-vo">
            <div className="modular-track-cover cover-vo">
              <span className="track-tag">Voiceover</span>
            </div>
            <div className="modular-track-lane lane-vo">
              {scenes
                .filter(sc => sc.label)
                .map(scene => {
                  const leftPct = (scene.start / duration) * 100
                  const widthPct = (scene.dur / duration) * 100
                  return (
                    <button
                      key={`vo-${scene.id}`}
                      type="button"
                      className="timeline-item item-vo"
                      style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                      onClick={() => pickVo(scene)}
                      title={`Voiceover in ${scene.id}: "${scene.label}"`}
                    >
                      <Mic size={10} strokeWidth={2} />
                      <span className="item-text">"{scene.label}"</span>
                    </button>
                  )
                })}
            </div>
          </div>

          {/* Section 3+: SFX Sub-Tracks */}
          {sfxTracks.map((trackCues, trackIdx) => (
            <div key={`row-sfx-${trackIdx}`} className="modular-track-row row-sfx">
              <div className="modular-track-cover cover-sfx">
                <span className="track-tag">
                  {sfxTracks.length > 1 ? `SFX ${trackIdx + 1}` : 'SFX'}
                </span>
              </div>
              <div className="modular-track-lane lane-sfx">
                {trackCues.map(cue => {
                  const leftPct = (cue.time / duration) * 100
                  return (
                    <button
                      key={cue.id}
                      type="button"
                      className="timeline-item item-sfx"
                      style={{ left: `${leftPct}%` }}
                      onClick={() => pickSfx(cue)}
                      title={`SFX cue: ${cue.label} at ${fmt(cue.time)}`}
                    >
                      <span className="sfx-indicator-dot" />
                      <span className="item-text">{cue.label}</span>
                      <span className="sfx-time-tag">{fmt(cue.time)}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          ))}

          {/* Section 4: Music Bed Track */}
          <div className="modular-track-row row-music">
            <div className="modular-track-cover cover-music">
              <span className="track-tag">Music Bed</span>
            </div>
            <div className="modular-track-lane lane-music">
              <button
                type="button"
                className="timeline-item item-music"
                style={{ left: '0%', width: '100%' }}
                onClick={pickMusic}
                title="Background music bed — click to adjust volume, ducking, or track"
              >
                <Music size={10} strokeWidth={2} />
                <span className="item-text">
                  BGM Bed (audio/music.mp3 — ducks under voiceover speech)
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/** Slides of a deck; clicking scrolls the preview and scopes the prompt. */
export function SlideStrip({
  store,
  onPick,
}: {
  store: ProjectStore
  onPick?: (index: number) => void
}) {
  const s = store
  const slides = s.project?.description.slides ?? []
  return (
    <div className="timeline">
      <div className="timeline-header">
        <h2>Slides</h2>
        <span className="timeline-meta">{slides.length} slides</span>
      </div>
      {slides.length === 0 ? (
        s.busy ? (
          <div className="strip">
            {[0, 1, 2, 3].map(i => (
              <div key={i} className="scene-card skeleton" />
            ))}
          </div>
        ) : (
          <div className="timeline-empty">No slides yet.</div>
        )
      ) : (
        <div className="strip">
          {slides.map(slide => (
            <div
              key={slide.index}
              className={`scene-card ${slide.index === s.selectedSlide ? 'selected' : ''}`}
              onClick={() => {
                s.setSelectedSlide(slide.index === s.selectedSlide ? null : slide.index)
                onPick?.(slide.index)
              }}
              title={slide.title ?? `Slide ${slide.index}`}
            >
              <Thumb store={s} t={slide.index} label={String(slide.index)} />
              <div className="scene-card-label">
                <span className="scene-name">
                  {slide.title ? slide.title.slice(0, 18) : `Slide ${slide.index}`}
                </span>
                <span className="scene-time">{slide.index}</span>
              </div>
            </div>
          ))}
          {s.busy && (
            <div className="scene-card skeleton next">
              <span className="scene-next-label">next…</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
