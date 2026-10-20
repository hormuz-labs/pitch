// Issue reports from the static site. Visitors are signed out and the site
// carries no PostHog, so this keeps only what the support card needs: send
// the report to the API, which emails support.
import { API_URL } from '../../config'

export type IssueReportCategory = 'bug' | 'video' | 'billing' | 'feedback'

export interface RecentAppError {
  id: string
  source: string
  message: string
  projectId?: string
  path: string
  at: string
}

let reportCounter = 0

export function getRecentAppErrors(): RecentAppError[] {
  return []
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
  const url = typeof window !== 'undefined' ? window.location.href : ''
  void Promise.resolve(input.token)
    .catch(() => null)
    .then((token) =>
      fetch(`${API_URL}/users/issues`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', Authorization: `Bearer ${token ?? ''}` },
        body: JSON.stringify({
          category: input.category,
          message: input.message.trim(),
          userEmail: input.email?.trim() || undefined,
          projectId: input.projectId?.trim() || undefined,
          pageUrl: url,
          recentErrors: [],
          screenshotName: input.screenshot?.name,
          screenshotDataUrl: input.screenshot?.dataUrl,
        }),
      }),
    )
    .catch(() => {})
  return { eventId, replayUrl: null }
}
