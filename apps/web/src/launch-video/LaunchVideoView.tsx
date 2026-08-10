import { type CSSProperties, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import type { PhaseUpdate } from '../types'
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

/** Canonical launch-video pipeline, in execution order. The worker reports
 *  these phase keys as it runs recon → direction → storyboard → VO → build →
 *  mix → render. Steps not yet reached are shown as pending. */
const LAUNCH_PHASE_ORDER: Array<{ key: string; label: string }> = [
  { key: 'workspace_init', label: 'Setting up workspace' },
  { key: 'processing', label: 'Reading your prompt' },
  { key: 'recon', label: 'Researching the product' },
  { key: 'planning', label: 'Planning creative direction' },
  { key: 'voiceover', label: 'Recording voiceover' },
  { key: 'building', label: 'Building scenes' },
  { key: 'mixing', label: 'Mixing audio' },
  { key: 'rendering', label: 'Rendering video' },
]

interface PhaseStatus {
  status: 'pending' | 'running' | 'completed' | 'failed'
  label: string
}

function PhaseDot({ status }: { status: PhaseStatus['status'] }) {
  const styles: Record<PhaseStatus['status'], CSSProperties> = {
    completed: { background: '#16a34a', borderColor: '#16a34a', color: '#fff' },
    running: {
      background: 'var(--interactive-bg)',
      borderColor: 'var(--interactive-bg)',
      animation: 'lv-pulse 1.2s ease-in-out infinite',
    },
    pending: {
      background: 'transparent',
      borderColor: 'var(--border-subtle)',
      color: 'var(--text-faint)',
    },
    failed: { background: '#ef4444', borderColor: '#ef4444', color: '#fff' },
  }
  return (
    <span
      className="flex items-center justify-center w-5 h-5 rounded-full border text-[10px] font-semibold shrink-0"
      style={styles[status]}
    >
      {status === 'completed' ? '✓' : status === 'failed' ? '!' : ''}
    </span>
  )
}

function JobProgressCard({
  phases,
  progress,
  activity,
  busy,
}: {
  phases: PhaseUpdate[]
  progress: number
  activity: string | null
  busy: boolean
}) {
  const byKey = new Map(phases.map(p => [p.phase, p]))
  const steps: Array<PhaseStatus> = LAUNCH_PHASE_ORDER.map(({ key, label }) => ({
    label: byKey.get(key)?.label ?? label,
    status: byKey.get(key)?.status ?? 'pending',
  }))
  const runningIndex = steps.findIndex(s => s.status === 'running')
  const currentLabel = runningIndex >= 0 ? steps[runningIndex].label : null

  return (
    <div className="mt-6 w-full max-w-md text-left">
      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-sunken)] p-5 shadow-[var(--shadow-sm)]">
        <div className="flex items-end justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wide text-[var(--text-faint)]">
              {currentLabel ?? 'Working'}
            </p>
            <p className="mt-0.5 text-sm font-medium text-[var(--text-primary)] truncate">
              {currentLabel ? `${currentLabel}…` : 'Setting up the studio…'}
            </p>
          </div>
          <span className="text-sm font-semibold text-[var(--text-primary)] tabular-nums">
            {progress}%
          </span>
        </div>

        <div className="mt-3 h-1.5 rounded-full bg-[var(--border-subtle)] overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${Math.min(100, Math.max(0, progress))}%`,
              background: progress >= 100 ? '#16a34a' : 'var(--interactive-bg)',
            }}
          />
        </div>

        <ol className="mt-4 space-y-2">
          {steps.map((s, i) => (
            <li key={s.label} className="flex items-center gap-2.5">
              <PhaseDot status={s.status} />
              <span
                className={`text-sm ${
                  s.status === 'pending'
                    ? 'text-[var(--text-faint)]'
                    : s.status === 'failed'
                      ? 'text-[var(--text-primary)]'
                      : 'text-[var(--text-muted)]'
                }`}
              >
                {s.label}
              </span>
              {s.status === 'running' && (
                <span className="text-xs text-[var(--text-faint)]">…</span>
              )}
              {i === steps.length - 1 && s.status === 'running' && (
                <span className="text-xs text-[var(--text-faint)]">
                  (this can take a few minutes)
                </span>
              )}
            </li>
          ))}
        </ol>

        {busy && activity && (
          <p className="mt-4 pt-3 border-t border-[var(--border-subtle)] text-xs text-[var(--text-muted)] flex items-center gap-2">
            <span className="inline-block w-3 h-3 border-2 border-[var(--border-subtle)] border-t-[var(--interactive-bg)] rounded-full animate-spin" />
            {activity}
          </p>
        )}
      </div>
    </div>
  )
}

function JobStatusPanel() {
  const {
    currentJobId,
    jobError,
    currentProject,
    busy,
    messages,
    activity,
    jobPhases,
    jobProgress,
  } = useLaunchVideo()
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
      {!jobError && currentJobId && (
        <JobProgressCard
          phases={jobPhases}
          progress={jobProgress}
          activity={activity}
          busy={busy}
        />
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
    setView,
    currentProject,
    currentJobId,
    selectProject,
    clearProject,
    trackJob,
    projectsLoading,
    busy,
  } = useLaunchVideo()
  const { '*': splat } = useParams<{ '*': string }>()
  const navigate = useNavigate()

  let jobId: string | undefined
  let projectName: string | undefined

  if (splat?.startsWith('job/')) {
    jobId = decodeURIComponent(splat.slice(4))
  } else if (splat) {
    projectName = decodeURIComponent(splat)
  }

  // Resume tracking a job when landing on /launch-video/job/:jobId.
  useEffect(() => {
    if (jobId && !currentJobId) {
      void trackJob(jobId)
    }
  }, [jobId, currentJobId, trackJob])

  // When a job is active but the URL doesn't show it yet, switch to the job view.
  useEffect(() => {
    if (currentJobId && !jobId) {
      navigate(`/launch-video/job/${encodeURIComponent(currentJobId)}`, { replace: true })
    }
  }, [currentJobId, jobId, navigate])

  // When on a job route and the job completes (currentJobId becomes null) and project detail is ready, switch to edit view.
  useEffect(() => {
    if (jobId && !currentJobId && currentProject?.name && !busy) {
      navigate(`/launch-video/${encodeURIComponent(currentProject.name)}`, { replace: true })
      setView('edit')
    }
  }, [jobId, currentJobId, currentProject?.name, busy, navigate, setView])

  // Load the project named in the URL once the project list is ready.
  useEffect(() => {
    if (projectsLoading || !projectName || jobId || currentJobId) return
    if (!currentProject || currentProject.name !== projectName) {
      void selectProject(projectName)
    }
  }, [projectsLoading, projectName, currentProject, selectProject, jobId, currentJobId])

  // Navigating to /launch-video (no project) clears the current project.
  useEffect(() => {
    if (!projectsLoading && !projectName && !jobId && !currentJobId && currentProject) {
      clearProject()
    }
  }, [projectsLoading, projectName, jobId, currentJobId, currentProject, clearProject])

  // Sync the URL with the active project so a refresh resumes the right session (only when not on a job route).
  useEffect(() => {
    if (jobId || currentJobId) return
    if (currentProject?.name && currentProject.name !== projectName) {
      navigate(`/launch-video/${encodeURIComponent(currentProject.name)}`, { replace: true })
    } else if (!currentProject?.name && projectName) {
      navigate('/launch-video', { replace: true })
    }
  }, [currentProject?.name, projectName, jobId, currentJobId, navigate])

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
