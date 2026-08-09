import { CreatePanel } from './CreatePanel'
import { EditPanel } from './EditPanel'
import { LaunchVideoProvider, useLaunchVideo } from './store'

function Tabs() {
  const { view, setView, clearProject } = useLaunchVideo()
  const tabs = [
    { key: 'create' as const, label: 'Create' },
    { key: 'edit' as const, label: 'Edit' },
  ]

  const handleTabClick = (key: 'create' | 'edit') => {
    if (key === 'create' && view !== 'create') {
      // Reset project state so the Create panel opens fresh.
      clearProject()
    }
    setView(key)
  }

  return (
    <div className="shrink-0 flex justify-center pt-4 pb-1">
      <div className="inline-flex items-center gap-1 rounded-full bg-[var(--bg-sunken)] p-1 border border-[var(--border-subtle)]">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => handleTabClick(t.key)}
            className={`h-7 px-4 rounded-full text-xs font-medium transition-all cursor-pointer border-none ${
              view === t.key
                ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-[var(--shadow-sm)]'
                : 'bg-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function LaunchVideoShell() {
  const { view } = useLaunchVideo()
  return (
    <div className="h-full flex flex-col">
      <Tabs />
      {view === 'create' ? <CreatePanel /> : <EditPanel />}
    </div>
  )
}

/** Route view for /launch-video — self-contained (own fetching + SSE). */
export function LaunchVideoView() {
  return (
    <LaunchVideoProvider>
      <LaunchVideoShell />
    </LaunchVideoProvider>
  )
}
