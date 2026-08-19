import { type CSSProperties, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import type { PhaseUpdate } from '../types'
import { messageText } from './api'
import { CreatePanel } from './CreatePanel'
import { EditPanel } from './EditPanel'
import { resolveLaunchVideoRoute } from './navigation'
import { calculateLaunchVideoProgress, LAUNCH_VIDEO_PHASES } from './progress'
import { LaunchVideoProvider, useLaunchVideo } from './store'

function Tabs({ active }: { active: 'new' | 'edit' }) {
  const { setView, clearProject } = useLaunchVideo()
  const navigate = useNavigate()
  const tabs = [
    { key: 'new' as const, label: 'Create new' },
    { key: 'edit' as const, label: 'View & edit' },
  ]

  const handleTabClick = (key: 'new' | 'edit') => {
    clearProject()
    setView(key === 'new' ? 'create' : 'edit')
    navigate(`/launch-video/${key}`)
  }

  return (
    <div className="shrink-0 flex justify-center pt-4 pb-1">
      <div className="inline-flex items-center gap-1 rounded-full bg-[var(--bg-sunken)] p-1 border border-[var(--border-subtle)]">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => handleTabClick(t.key)}
            className={`h-7 px-4 rounded-full text-xs font-medium transition-all cursor-pointer border-none ${
              active === t.key
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
  const [nowMs, setNowMs] = useState(() => Date.now())
  useEffect(() => {
    setNowMs(Date.now())
    if (!busy) return
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [busy])

  const byKey = new Map(phases.map(p => [p.phase, p]))
  let detectedRunningIndex = -1
  for (let index = 0; index < LAUNCH_VIDEO_PHASES.length; index++) {
    if (byKey.get(LAUNCH_VIDEO_PHASES[index].key)?.status === 'running') {
      detectedRunningIndex = index
    }
  }
  const steps: Array<PhaseStatus> = LAUNCH_VIDEO_PHASES.map(({ key, label }, index) => ({
    label: byKey.get(key)?.label ?? label,
    status: byKey.get(key)?.status ?? (detectedRunningIndex > index ? 'completed' : 'pending'),
  }))
  const runningIndex = steps.findIndex(s => s.status === 'running')
  const currentLabel = runningIndex >= 0 ? steps[runningIndex].label : null
  const displayedProgress = calculateLaunchVideoProgress(phases, progress, nowMs)

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
            {displayedProgress}%
          </span>
        </div>

        <div
          className="mt-3 h-1.5 rounded-full bg-[var(--border-subtle)] overflow-hidden"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={displayedProgress}
        >
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${displayedProgress}%`,
              background: displayedProgress >= 100 ? '#16a34a' : 'var(--interactive-bg)',
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
  const navigate = useNavigate()
  const latestMessage = messages[messages.length - 1]
  const statusText =
    jobError ??
    (currentProject?.name ? `Building ${currentProject.name}…` : 'Generating launch video…')
  return (
    <div className="flex-1 min-h-0 flex flex-col items-center justify-center text-center px-6 pb-10">
      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--interactive-bg)]">
        {jobError ? 'Launch video stopped' : 'Launch video in progress'}
      </p>
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
      {!jobError && currentJobId && (
        <p className="mt-4 max-w-md text-sm text-[var(--text-muted)]">
          You can safely leave this page. Generation continues in the background, and this progress
          screen will be waiting when you return.
        </p>
      )}
      {latestMessage && (
        <p className="mt-4 max-w-lg text-sm text-[var(--text-muted)]">
          {messageText(latestMessage)}
        </p>
      )}
      <button
        onClick={() => navigate('/dashboard')}
        className="mt-5 h-9 px-4 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-sunken)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
      >
        Back to dashboard
      </button>
    </div>
  )
}

function LaunchVideoShell() {
  const {
    setView,
    currentProject,
    currentJobId,
    projects,
    selectProject,
    clearProject,
    trackJob,
    projectsLoading,
    busy,
  } = useLaunchVideo()
  const { '*': splat } = useParams<{ '*': string }>()
  const navigate = useNavigate()
  const trackedRouteRef = useRef<string | null>(null)
  const previousRouteRef = useRef<string | undefined>(splat)
  const route = resolveLaunchVideoRoute(splat, projects, projectsLoading)
  const routeJobId = route.jobId
  const projectName = route.projectName

  // Migrate old /:id, /job/:id, /:name, and bare-root links.
  useEffect(() => {
    if (route.redirectTo) navigate(route.redirectTo, { replace: true })
  }, [route.redirectTo, navigate])

  // Route-section changes reset transient project/job state. Starting a job
  // while already on /new does not trigger this because the URL is unchanged.
  useEffect(() => {
    const previousRoute = previousRouteRef.current
    previousRouteRef.current = splat
    if (previousRoute === splat) return
    if (route.section === 'new') {
      clearProject()
      setView('create')
    } else if (!routeJobId && !projectName) {
      clearProject()
      setView('edit')
    }
  }, [splat, route.section, routeJobId, projectName, clearProject, setView])

  // A direct ID route restores both running progress and completed project
  // details. Remember the route locally so a completed job is not re-fetched
  // when currentJobId is cleared to stop polling.
  useEffect(() => {
    if (projectsLoading || route.resolving) return
    if (!routeJobId) {
      trackedRouteRef.current = null
      return
    }
    if (currentJobId === routeJobId) {
      trackedRouteRef.current = routeJobId
      return
    }
    if (trackedRouteRef.current !== routeJobId) {
      trackedRouteRef.current = routeJobId
      void trackJob(routeJobId)
    }
  }, [projectsLoading, route.resolving, routeJobId, currentJobId, trackJob])

  // Filesystem-only legacy projects have no job row, so they retain an
  // explicit /edit/project/:name fallback instead of occupying the ID namespace.
  useEffect(() => {
    if (projectsLoading || route.resolving || !projectName || routeJobId) return
    if (currentJobId) return
    if (!currentProject || currentProject.name !== projectName) {
      setView('edit')
      void selectProject(projectName)
    } else if (!busy) {
      setView('edit')
    }
  }, [
    projectsLoading,
    route.resolving,
    projectName,
    currentProject,
    selectProject,
    routeJobId,
    currentJobId,
    busy,
    setView,
  ])

  const onJobRoute = Boolean(
    currentJobId || (routeJobId && (!currentProject || trackedRouteRef.current !== routeJobId)),
  )

  return (
    <div className="h-full flex flex-col">
      <Tabs active={route.section} />
      {onJobRoute ? <JobStatusPanel /> : route.section === 'new' ? <CreatePanel /> : <EditPanel />}
    </div>
  )
}

/** Route view for /launch-video/new, /edit, and /edit/:jobId. */
export function LaunchVideoView() {
  return (
    <LaunchVideoProvider>
      <LaunchVideoShell />
    </LaunchVideoProvider>
  )
}
