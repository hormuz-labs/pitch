import { useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { messageText } from './api'
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

function JobStatusPanel() {
  const { currentJobId, jobError, currentProject, busy, messages, activity } = useLaunchVideo()
  const latestMessage = messages[messages.length - 1]
  const statusText =
    jobError ??
    (currentProject?.name ? `Building ${currentProject.name}…` : 'Generating launch video…')
  return (
    <div className="flex-1 min-h-0 flex flex-col items-center justify-center text-center px-6 pb-10">
      <h2 className="font-[family-name:var(--font-serif)] text-2xl md:text-3xl text-[var(--text-primary)] tracking-tight">
        {jobError ? 'Generation failed' : statusText}
      </h2>
      {currentJobId && (
        <p className="mt-3 text-xs text-[var(--text-faint)] font-mono">job {currentJobId}</p>
      )}
      {busy && !jobError && (
        <div className="mt-6 inline-flex items-center gap-2 text-sm text-[var(--text-muted)]">
          <span className="inline-block w-4 h-4 border-2 border-[var(--border-subtle)] border-t-[var(--interactive-bg)] rounded-full animate-spin" />
          {activity ?? 'working…'}
        </div>
      )}
      {latestMessage && (
        <p className="mt-4 max-w-lg text-sm text-[var(--text-muted)]">
          {messageText(latestMessage)}
        </p>
      )}
    </div>
  )
}

function LaunchVideoShell() {
  const {
    view,
    currentProject,
    currentJobId,
    selectProject,
    clearProject,
    trackJob,
    projectsLoading,
  } = useLaunchVideo()
  const { projectName, jobId } = useParams<{ projectName?: string; jobId?: string }>()
  const navigate = useNavigate()

  // Resume tracking a job when landing on /launch-video/job/:jobId.
  useEffect(() => {
    if (jobId && !currentJobId) {
      void trackJob(jobId)
    }
  }, [jobId, currentJobId, trackJob])

  // When a job is created but the URL doesn't show it yet, switch to the job view.
  useEffect(() => {
    if (currentJobId && !jobId) {
      navigate(`/launch-video/job/${encodeURIComponent(currentJobId)}`, { replace: true })
    }
  }, [currentJobId, jobId, navigate])

  // Load the project named in the URL once the project list is ready.
  useEffect(() => {
    if (projectsLoading || !projectName || jobId) return
    if (!currentProject || currentProject.name !== projectName) {
      void selectProject(projectName)
    }
  }, [projectsLoading, projectName, currentProject, selectProject, jobId])

  // Navigating to /launch-video (no project) clears the current project.
  useEffect(() => {
    if (!projectsLoading && !projectName && !jobId && currentProject) {
      clearProject()
    }
  }, [projectsLoading, projectName, jobId, currentProject, clearProject])

  // Sync the URL with the active project so a refresh resumes the right session.
  useEffect(() => {
    if (jobId) return
    if (currentProject?.name && currentProject.name !== projectName) {
      navigate(`/launch-video/${encodeURIComponent(currentProject.name)}`, { replace: true })
    } else if (!currentProject?.name && projectName) {
      navigate('/launch-video', { replace: true })
    }
  }, [currentProject?.name, projectName, jobId, navigate])

  const onJobRoute = Boolean(jobId || currentJobId)

  return (
    <div className="h-full flex flex-col">
      {!onJobRoute && <Tabs />}
      {onJobRoute ? <JobStatusPanel /> : view === 'create' ? <CreatePanel /> : <EditPanel />}
    </div>
  )
}

/** Route view for /launch-video/:projectName? and /launch-video/job/:jobId. */
export function LaunchVideoView() {
  return (
    <LaunchVideoProvider>
      <LaunchVideoShell />
    </LaunchVideoProvider>
  )
}
