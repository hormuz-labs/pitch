import type { ProjectStore } from '../useProject'

/** A rendered (or uploaded) video. */
export function VideoPreview({ store, src }: { store: ProjectStore; src: string }) {
  const s = store
  return (
    <div className="video-container">
      <video
        key={src}
        src={src}
        controls
        preload="metadata"
        ref={el => {
          s.player.current = el
            ? {
                seek: t => {
                  el.currentTime = t
                  void el.play()
                },
              }
            : null
        }}
        onTimeUpdate={e => s.setPlayhead(e.currentTarget.currentTime)}
        onSeeked={e => s.setPlayhead(e.currentTarget.currentTime)}
        onPlay={() => s.notePlayerState(true)}
        onPause={() => s.notePlayerState(false)}
      />
      {s.busy && (
        <div className="preview-updating">
          <span className="spinner" /> {s.status}
        </div>
      )}
    </div>
  )
}
