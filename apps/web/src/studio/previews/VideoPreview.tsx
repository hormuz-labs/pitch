/**
 * A video, and the track you select on.
 *
 * Same contract as the HTML and deck previews: point at the thing you want
 * changed, then say what should change. A video has no DOM, so the unit of
 * selection is TIME — drag across the track to select a range ("cut this",
 * "the music is too loud here"), or click a single point for a moment. Either
 * becomes a [n] chip in the composer, exactly like clicking an element does
 * elsewhere.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { ProjectStore } from '../useProject'

const fmt = (t: number) => {
  const m = Math.floor(t / 60)
  const s = Math.floor(t % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}
const fmtPrecise = (t: number) => `${fmt(t)}.${Math.floor((t % 1) * 10)}`

/** A drag shorter than this is a click: one moment, not a range. */
const CLICK_SECONDS = 0.25

/** How many stills to lay out. Enough to find a beat, few enough to scan. */
const FRAME_COUNT = 12

/**
 * The film strip: evenly spaced stills across the whole clip.
 *
 * The track says WHEN; this says WHAT. Scrubbing to find the shot you meant
 * is the slow part of editing a video you did not make, and a row of frames
 * removes it — click one and the player goes there with that moment selected,
 * ready to say what should happen to it.
 *
 * The frames come from the project's own thumbnail route, which reads them
 * with ffmpeg and caches them, so this costs one request per frame once.
 */
function Frames({
  store,
  duration,
  onPick,
}: {
  store: ProjectStore
  duration: number
  onPick: (t: number) => void
}) {
  if (!duration) return null
  // Offset by half a step: the first and last frames of a clip are often
  // black, and the middle of each slice is representative of it.
  const step = duration / FRAME_COUNT
  const times = Array.from({ length: FRAME_COUNT }, (_, i) => i * step + step / 2)
  const playing = (t: number) => store.playhead >= t - step / 2 && store.playhead < t + step / 2

  return (
    <div className="video-frames">
      {times.map(t => {
        const url = store.thumbnailUrl(t)
        return (
          <button
            type="button"
            key={t.toFixed(3)}
            className={`video-frame${playing(t) ? ' on' : ''}`}
            title={`Jump to ${fmt(t)} and select it`}
            onClick={() => onPick(t)}
          >
            {url && <img src={url} alt="" loading="lazy" draggable={false} />}
            <span className="video-frame-time">{fmt(t)}</span>
          </button>
        )
      })}
    </div>
  )
}

export function VideoPreview({ store, src }: { store: ProjectStore; src: string }) {
  const s = store
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const trackRef = useRef<HTMLDivElement | null>(null)
  const [duration, setDuration] = useState(0)
  const [range, setRange] = useState<{ start: number; end: number } | null>(null)
  const drag = useRef<{ anchor: number; moved: boolean } | null>(null)

  const scenes = s.project?.description.scenes ?? []
  const beatAt = (t: number) => scenes.find(sc => t >= sc.start && t < sc.end) ?? null

  // A new video is a new timeline; a selection from the old one means nothing.
  useEffect(() => {
    setRange(null)
  }, [src])

  const timeAt = useCallback(
    (clientX: number): number => {
      const rect = trackRef.current?.getBoundingClientRect()
      if (!rect || rect.width === 0 || !duration) return 0
      const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
      return ratio * duration
    },
    [duration],
  )

  const seek = (t: number) => {
    const el = videoRef.current
    if (!el) return
    el.currentTime = Math.min(Math.max(0, t), duration || 0)
    s.setPlayhead(el.currentTime)
  }

  const onPointerDown = (e: React.PointerEvent) => {
    if (!duration) return
    const t = timeAt(e.clientX)
    drag.current = { anchor: t, moved: false }
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    setRange({ start: t, end: t })
    seek(t)
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return
    const t = timeAt(e.clientX)
    if (Math.abs(t - drag.current.anchor) > 0.02) drag.current.moved = true
    setRange({ start: Math.min(drag.current.anchor, t), end: Math.max(drag.current.anchor, t) })
  }

  const onPointerUp = () => {
    const d = drag.current
    drag.current = null
    if (!d) return
    setRange(prev => {
      if (!prev) return null
      // A tap is a point in time, not a zero-length range.
      return prev.end - prev.start < CLICK_SECONDS ? { start: prev.start, end: prev.start } : prev
    })
  }

  /** Hand the current selection to the composer as a [n] chip. */
  const addSelection = () => {
    if (!range) return
    const isRange = range.end - range.start >= CLICK_SECONDS
    const beat = beatAt(range.start)
    s.addTarget({
      sceneId: beat?.id ?? null,
      tagName: isRange ? 'range' : 'moment',
      className: '',
      id: '',
      text: beat?.label ?? '',
      selector: isRange
        ? `t=${range.start.toFixed(2)}s..${range.end.toFixed(2)}s`
        : `t=${range.start.toFixed(2)}s`,
      time: range.start,
      ...(isRange ? { endTime: range.end } : {}),
    })
    if (beat) s.setSelectedScene(beat.id)
  }

  const playheadPct = duration ? (s.playhead / duration) * 100 : 0
  const selecting = !!range
  const isRange = !!range && range.end - range.start >= CLICK_SECONDS

  return (
    <div className="video-container">
      <video
        key={src}
        ref={el => {
          videoRef.current = el
          s.player.current = el
            ? {
                seek: t => {
                  el.currentTime = t
                  void el.play()
                },
              }
            : null
        }}
        src={src}
        controls
        preload="metadata"
        onLoadedMetadata={e => setDuration(e.currentTarget.duration || 0)}
        onDurationChange={e => setDuration(e.currentTarget.duration || 0)}
        onTimeUpdate={e => s.setPlayhead(e.currentTarget.currentTime)}
        onSeeked={e => s.setPlayhead(e.currentTarget.currentTime)}
        onPlay={() => s.notePlayerState(true)}
        onPause={() => s.notePlayerState(false)}
      />

      <div className="video-select">
        <div className="video-select-head">
          <span className="video-select-hint">
            {selecting
              ? isRange
                ? `${fmtPrecise(range.start)} – ${fmtPrecise(range.end)} · ${(range.end - range.start).toFixed(1)}s`
                : `Moment at ${fmtPrecise(range.start)}`
              : 'Drag across the track to select a range, or click a moment'}
          </span>
          {selecting && (
            <span className="video-select-actions">
              <button type="button" className="target-clear" onClick={() => setRange(null)}>
                clear
              </button>
              <button type="button" className="video-select-ask" onClick={addSelection}>
                {isRange ? 'Ask about this range' : 'Ask about this moment'}
              </button>
            </span>
          )}
        </div>

        {/* biome-ignore lint/a11y/noStaticElementInteractions: a timeline is a pointer surface */}
        <div
          ref={trackRef}
          className="video-track"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          {/* Narration beats, when the render left a timeline behind. */}
          {duration > 0 &&
            scenes.map(scene => (
              <span
                key={scene.id}
                className="video-track-beat"
                title={scene.label ?? `Moment ${scene.index}`}
                style={{
                  left: `${(scene.start / duration) * 100}%`,
                  width: `${((scene.end - scene.start) / duration) * 100}%`,
                }}
              />
            ))}

          {range && duration > 0 && (
            <span
              className={`video-track-sel ${isRange ? '' : 'point'}`}
              style={{
                left: `${(range.start / duration) * 100}%`,
                width: `${Math.max(((range.end - range.start) / duration) * 100, 0.4)}%`,
              }}
            />
          )}

          <span className="video-track-playhead" style={{ left: `${playheadPct}%` }} />
        </div>

        <div className="video-track-times">
          <span>0:00</span>
          <span>{fmt(duration)}</span>
        </div>

        <Frames
          store={s}
          duration={duration}
          onPick={t => {
            seek(t)
            setRange({ start: t, end: t })
          }}
        />
      </div>

      {s.busy && (
        <div className="preview-updating">
          <span className="spinner" /> {s.status}
        </div>
      )}
    </div>
  )
}
