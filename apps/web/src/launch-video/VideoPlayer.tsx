import { Clapperboard } from 'lucide-react'
import { useLaunchVideo } from './store'

export function VideoPlayer() {
  const { currentProject, videoVersion, setPlayhead, playerRef, mediaUrl } = useLaunchVideo()

  const src = mediaUrl(currentProject?.videoUrl, videoVersion)

  return (
    <div className="rounded-[var(--radius-lg)] overflow-hidden bg-neutral-950 border border-neutral-800 shadow-[var(--shadow-md)]">
      {src ? (
        <video
          key={src}
          src={src}
          controls
          preload="metadata"
          className="w-full aspect-video bg-black"
          ref={el => {
            playerRef.current = el
          }}
          onTimeUpdate={e => setPlayhead(e.currentTarget.currentTime)}
          onSeeked={e => setPlayhead(e.currentTarget.currentTime)}
        />
      ) : (
        <div className="w-full aspect-video flex flex-col items-center justify-center gap-3 text-neutral-500">
          <Clapperboard size={28} strokeWidth={1.5} />
          <p className="text-sm">
            No render yet — ask the agent to generate the video in the chat.
          </p>
        </div>
      )}
    </div>
  )
}
