import { useEffect, useState } from 'react'
import type { Scene } from './client'
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

/** Scenes of a timed preview (launch shots, demo storyboard scenes). */
export function SceneStrip({ store }: { store: ProjectStore }) {
  const s = store
  const scenes = s.project?.description.scenes ?? []
  const isPlaying = (scene: Scene) => s.playhead >= scene.start && s.playhead < scene.end
  const pick = (scene: Scene) => {
    s.setSelectedScene(scene.id === s.selectedScene ? null : scene.id)
    s.seekPlayer(scene.start + 0.01)
  }
  return (
    <div className="timeline">
      <div className="timeline-header">
        <h2>Scenes</h2>
        <span className="timeline-meta">
          {scenes.length} scenes · {fmt(s.project?.description.duration ?? 0)}
          {s.busy && s.liveCount != null && (
            <span className="timeline-live"> · building, {s.liveCount} so far</span>
          )}
        </span>
      </div>
      {scenes.length === 0 ? (
        s.busy ? (
          <div className="strip">
            {[0, 1, 2, 3, 4, 5].map(i => (
              <div key={i} className="scene-card skeleton" />
            ))}
          </div>
        ) : (
          <div className="timeline-empty">
            No scenes yet — they appear as soon as the first ones are saved.
          </div>
        )
      ) : (
        <div className="strip">
          {scenes.map(scene => (
            <div
              key={scene.id}
              className={`scene-card ${scene.id === s.selectedScene ? 'selected' : ''} ${isPlaying(scene) ? 'playing' : ''}`}
              onClick={() => pick(scene)}
              title={`${scene.id}: ${fmt(scene.start)} – ${fmt(scene.end)}`}
            >
              <Thumb store={s} t={scene.start + 0.05} label={String(scene.index)} />
              <div className="scene-card-label">
                <span className="scene-name">{scene.id}</span>
                <span className="scene-time">{fmt(scene.dur)}</span>
              </div>
            </div>
          ))}
          {s.busy && (
            <div className="scene-card skeleton next" title="The agent is building the next scene">
              <span className="scene-next-label">next…</span>
            </div>
          )}
        </div>
      )}
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
