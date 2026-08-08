import { ArrowLeft, Film, Loader2 } from 'lucide-react'
import { EditSidebar } from './EditSidebar'
import { SceneTimeline } from './SceneTimeline'
import { useLaunchVideo } from './store'
import { VideoPlayer } from './VideoPlayer'

export function EditPanel() {
  const {
    activity,
    busy,
    clearProject,
    currentProject,
    projects,
    projectsLoading,
    projectsError,
    refreshProjects,
    selectProject,
  } = useLaunchVideo()

  if (!currentProject) {
    return (
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-6 py-10">
          <h1 className="font-[family-name:var(--font-serif)] text-3xl text-[var(--text-primary)] tracking-tight">
            Pick a project to edit
          </h1>
          <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {projects.map(p => (
              <button
                key={p.name}
                onClick={() => void selectProject(p.name)}
                className="group flex flex-col items-start gap-1.5 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 text-left shadow-[var(--shadow-sm)] hover:border-[var(--border-strong)] hover:shadow-[var(--shadow-md)] transition-all cursor-pointer"
              >
                <span className="text-[var(--text-faint)] group-hover:text-[var(--text-muted)] transition-colors">
                  <Film size={16} strokeWidth={1.75} />
                </span>
                <span className="text-sm font-semibold text-[var(--text-primary)] truncate w-full font-[family-name:var(--font-mono)]">
                  {p.name}
                </span>
                <span className="text-xs text-[var(--text-muted)]">
                  {p.hasVideo ? `${p.sceneCount} scenes · rendered` : 'no render yet'}
                </span>
              </button>
            ))}
          </div>
          {projectsLoading && (
            <div className="flex items-center gap-2 mt-8 text-sm text-[var(--text-muted)]">
              <Loader2 size={14} className="animate-spin" />
              Loading projects…
            </div>
          )}
          {!projectsLoading && projectsError && (
            <div className="mt-8 flex flex-col items-start gap-3">
              <p className="text-sm text-[var(--text-muted)]">Couldn't load projects.</p>
              <button
                onClick={() => void refreshProjects()}
                className="h-8 px-3 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-transparent text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-sunken)] transition-colors cursor-pointer"
              >
                Retry
              </button>
            </div>
          )}
          {!projectsLoading && !projectsError && projects.length === 0 && (
            <p className="mt-8 text-sm text-[var(--text-muted)]">
              No projects yet — generate one from the Create tab.
            </p>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="shrink-0 flex items-center gap-3 px-5 py-3 border-b border-[var(--border-subtle)]">
        <button
          onClick={() => clearProject()}
          className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-[var(--radius-md)] bg-transparent text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-sunken)] hover:text-[var(--text-primary)] transition-colors cursor-pointer border-none"
        >
          <ArrowLeft size={13} />
          Projects
        </button>
        <span className="text-sm font-semibold text-[var(--text-primary)] font-[family-name:var(--font-mono)] truncate">
          {currentProject.name}
        </span>
        {busy && (
          <span className="inline-flex items-center gap-1.5 text-xs text-[var(--text-muted)] truncate">
            <Loader2 size={12} className="animate-spin shrink-0" />
            {activity ?? 'working…'}
          </span>
        )}
      </div>
      <div className="flex-1 min-h-0 flex">
        <div className="flex-1 min-w-0 overflow-y-auto">
          <div className="max-w-4xl mx-auto px-5 py-5 flex flex-col gap-5">
            <VideoPlayer />
            <SceneTimeline />
          </div>
        </div>
        <EditSidebar />
      </div>
    </div>
  )
}
