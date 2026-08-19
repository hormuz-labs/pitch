import { Film } from 'lucide-react'
import type { LaunchScene } from './api'
import { SceneThumb } from './SceneThumb'
import { useLaunchVideo } from './store'

export function fmt(t: number): string {
  const m = Math.floor(t / 60)
  const s = (t % 60).toFixed(1).padStart(4, '0')
  return m > 0 ? `${m}:${s}` : `${s}s`
}

export function SceneTimeline() {
  const { currentProject, playhead, seekPlayer, selectedScene, setSelectedScene } = useLaunchVideo()
  const scenes = currentProject?.scenes ?? []

  const isPlaying = (scene: LaunchScene) => playhead >= scene.start && playhead < scene.end

  const pick = (scene: LaunchScene) => {
    setSelectedScene(scene.id === selectedScene ? null : scene.id)
    seekPlayer(scene.start + 0.01)
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between px-1">
        <h2 className="text-sm font-semibold text-[var(--text-primary)]">Scenes</h2>
        <span className="text-xs text-[var(--text-muted)] font-[family-name:var(--font-mono)]">
          {scenes.length} scenes · {fmt(currentProject?.duration ?? 0)}
        </span>
      </div>

      {scenes.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-[var(--radius-md)] border border-dashed border-[var(--border-default)] px-4 py-8 text-center text-sm text-[var(--text-muted)]">
          <Film size={18} strokeWidth={1.5} className="text-[var(--text-faint)]" />
          {currentProject?.videoUrl
            ? 'This video is available, but its editable scene files are unavailable.'
            : 'No scenes yet — they appear once the project has a timing map.'}
        </div>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-2 px-1">
          {scenes.map(scene => {
            const selected = scene.id === selectedScene
            const playing = isPlaying(scene)
            return (
              <button
                key={scene.id}
                className={`group w-40 shrink-0 rounded-[var(--radius-md)] overflow-hidden text-left transition-all cursor-pointer border bg-[var(--bg-surface)] ${
                  selected
                    ? 'border-transparent ring-2 ring-[var(--accent)] shadow-[var(--shadow-md)]'
                    : 'border-[var(--border-subtle)] hover:border-[var(--border-strong)] shadow-[var(--shadow-sm)]'
                }`}
                onClick={() => pick(scene)}
                title={`${scene.id}: ${fmt(scene.start)} – ${fmt(scene.end)}`}
              >
                <div className="relative">
                  <SceneThumb scene={scene} />
                  {playing && (
                    <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-[var(--success)] shadow" />
                  )}
                </div>
                <div className="flex items-center justify-between gap-2 px-2.5 py-2">
                  <span
                    className={`text-xs font-medium truncate ${
                      selected ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'
                    }`}
                  >
                    {scene.id}
                  </span>
                  <span className="text-[10px] tabular-nums text-[var(--text-faint)] font-[family-name:var(--font-mono)]">
                    {fmt(scene.dur)}
                  </span>
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
