import posthog, { type PostHogConfig } from 'posthog-js'
import { createEffect, createSignal, onCleanup, onMount, type ParentProps } from 'solid-js'
import { api } from '../../lib/api'
import { useUser } from './auth.tsx'

const key = (import.meta.env.VITE_POSTHOG_KEY ?? '').trim()
const host = (import.meta.env.VITE_POSTHOG_HOST ?? '').trim() || 'https://us.i.posthog.com'

const options = {
  api_host: host,
  defaults: '2026-06-25',
  capture_pageview: 'history_change',
  capture_pageleave: true,
  capture_exceptions: true,
  person_profiles: 'identified_only',
  mask_personal_data_properties: true,
  session_recording: { maskAllInputs: true, recordCrossOriginIframes: true },
  enable_recording_console_log: true,
} satisfies Partial<PostHogConfig>

export type IssueReportCategory = 'bug' | 'video' | 'billing' | 'feedback'

export interface RecentAppError {
  id: string
  source: string
  message: string
  projectId?: string
  path: string
  at: string
}

const MAX_RECENT_ERRORS = 10
let errorCounter = 0
let reportCounter = 0
const [recentErrors, setRecentErrors] = createSignal<RecentAppError[]>([])

function formatErrorMessage(error: unknown): string {
  if (typeof error === 'string') return error.replace(/^⚠\s*/, '').trim()
  if (error instanceof Error) return error.message.replace(/^⚠\s*/, '').trim()
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string')
    return error.message.replace(/^⚠\s*/, '').trim()
  return String(error ?? 'Unknown error').trim()
}

function activeProjectIdFromPath(pathname: string): string | undefined {
  if (!pathname.startsWith('/p/')) return undefined
  const segment = pathname.split('/')[2]?.trim()
  return segment || undefined
}

export function getRecentAppErrors(): RecentAppError[] {
  return recentErrors()
}

export function clearRecentAppErrors(): void {
  setRecentErrors([])
}

export function recordAppError(
  source: string,
  error: unknown,
  context: Record<string, unknown> = {},
): RecentAppError {
  const message = formatErrorMessage(error) || 'Unknown error'
  const path = typeof window !== 'undefined' ? window.location.pathname : ''
  const projectId =
    typeof context.projectId === 'string' && context.projectId
      ? context.projectId
      : activeProjectIdFromPath(path)
  const entry: RecentAppError = {
    id: `err_${Date.now()}_${++errorCounter}`,
    source,
    message,
    ...(projectId ? { projectId } : {}),
    path,
    at: new Date().toISOString(),
  }
  setRecentErrors(current =>
    [entry, ...current.filter(item => item.message !== message)].slice(0, MAX_RECENT_ERRORS),
  )
  try {
    posthog.capture('app_error', {
      source,
      message,
      path,
      ...(projectId ? { project_id: projectId } : {}),
      ...context,
    })
    posthog.captureException?.(error instanceof Error ? error : new Error(message), {
      source,
      path,
      ...(projectId ? { project_id: projectId } : {}),
      ...context,
    })
  } catch {
    // Telemetry must never break user flows.
  }
  return entry
}

export function submitIssueReport(input: {
  category: IssueReportCategory
  message: string
  email?: string
  projectId?: string
  includeDiagnostics?: boolean
  screenshot?: { name: string; dataUrl: string } | null
  token?: string | null | Promise<string | null>
}): { eventId: string; replayUrl: string | null } {
  const eventId = `issue_${Date.now()}_${++reportCounter}`
  const pathname = typeof window !== 'undefined' ? window.location.pathname : ''
  const url = typeof window !== 'undefined' ? window.location.href : ''
  const projectId = input.projectId?.trim() || activeProjectIdFromPath(pathname)
  const diagnostics = input.includeDiagnostics !== false
  const errors = diagnostics ? recentErrors() : []
  let replayUrl: string | null = null
  try {
    replayUrl = posthog.get_session_replay_url?.({ withTimestamp: true }) ?? null
  } catch {
    replayUrl = null
  }
  const properties: Record<string, unknown> = {
    report_id: eventId,
    category: input.category,
    message: input.message.trim(),
    ...(input.email?.trim() ? { user_email: input.email.trim() } : {}),
    ...(projectId ? { project_id: projectId } : {}),
    url,
    pathname,
    ...(diagnostics && typeof navigator !== 'undefined' ? { user_agent: navigator.userAgent } : {}),
    ...(diagnostics
      ? {
          recent_error_count: errors.length,
          recent_errors: errors,
          latest_error: errors[0]?.message ?? null,
        }
      : {}),
    has_screenshot: Boolean(input.screenshot?.dataUrl),
    ...(input.screenshot
      ? {
          screenshot_name: input.screenshot.name,
          screenshot_data_url: input.screenshot.dataUrl,
        }
      : {}),
    ...(replayUrl ? { session_replay_url: replayUrl } : {}),
  }
  try {
    posthog.capture('issue_reported', properties)
  } catch {
    // Telemetry must never break user flows.
  }
  void Promise.resolve(input.token)
    .catch(() => null)
    .then(token =>
      api.post('/users/issues', token ?? '', {
        category: input.category,
        message: input.message.trim(),
        userEmail: input.email?.trim() || undefined,
        projectId,
        pageUrl: url,
        recentErrors: errors,
        screenshotName: input.screenshot?.name,
        screenshotDataUrl: input.screenshot?.dataUrl,
        sessionReplayUrl: replayUrl,
      }),
    )
    .catch(() => {})
  return { eventId, replayUrl }
}

export function PostHogProvider(props: ParentProps) {
  const auth = useUser()

  onMount(() => {
    if (key && !posthog.__loaded) posthog.init(key, options)
    const onError = (event: ErrorEvent) => {
      recordAppError('window_error', event.error ?? event.message, {
        filename: event.filename,
        lineno: event.lineno,
      })
    }
    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      recordAppError('unhandled_rejection', event.reason)
    }
    window.addEventListener('error', onError)
    window.addEventListener('unhandledrejection', onUnhandledRejection)
    onCleanup(() => {
      window.removeEventListener('error', onError)
      window.removeEventListener('unhandledrejection', onUnhandledRejection)
    })
  })

  createEffect(() => {
    if (!key || !auth.isLoaded()) return
    const user = auth.userAccessor()
    if (!user) {
      if (posthog._isIdentified()) posthog.reset()
      return
    }
    posthog.identify(user.id, {
      email: user.primaryEmailAddress?.emailAddress,
      name: user.fullName,
    })
  })

  return props.children
}

export { posthog }
