import { useEffect, useState } from 'react'
import type { LaunchScene } from './api'
import { useLaunchVideo } from './store'
import { captureFrame } from './thumbs'

/** Video frame thumbnail for a scene, captured from the project render. */
export function SceneThumb({ scene }: { scene: LaunchScene }) {
  const { currentProject, videoVersion, mediaUrl } = useLaunchVideo()
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    const src = mediaUrl(currentProject?.videoUrl, videoVersion)
    if (!src) return
    let live = true
    setUrl(null)
    // re-capture when a new render lands (videoVersion baked into the src)
    void captureFrame(src, scene.start + 0.05).then(u => {
      if (live) setUrl(u)
    })
    return () => {
      live = false
    }
  }, [currentProject?.videoUrl, videoVersion, scene.start, mediaUrl])

  return (
    <div className="w-full aspect-video bg-[var(--bg-sunken)] overflow-hidden flex items-center justify-center">
      {url ? (
        <img src={url} alt={scene.id} draggable={false} className="w-full h-full object-cover" />
      ) : (
        <span className="text-xs font-semibold text-[var(--text-faint)] font-[family-name:var(--font-mono)]">
          {scene.index}
        </span>
      )}
    </div>
  )
}
