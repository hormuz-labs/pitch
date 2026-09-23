/**
 * What an administrator downloads when reviewing someone's project: the chat
 * as the user saw it, and the raw agent transcript as the model saw it. Pure
 * formatting only — the admin routes fetch, authorise and audit.
 */
import type { Entry } from '../studio/session.js'

export interface ReviewOwner {
  id: string
  email?: string | null
  firstName?: string | null
  lastName?: string | null
}

export interface ReviewProject {
  id: string
  title: string
  createdAt: string
}

/** A filename-safe stem: ids are cuids, but never trust a path parameter in a header. */
export function reviewFilename(projectId: string, kind: 'chat' | 'logs', ext: string): string {
  const stem = projectId.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64) || 'project'
  return `pitch-${stem}-${kind}.${ext}`
}

function ownerName(owner: ReviewOwner | null): string {
  if (!owner) return 'unknown'
  const name = [owner.firstName, owner.lastName].filter(Boolean).join(' ').trim()
  return [name, owner.email ? `<${owner.email}>` : '', `(${owner.id})`].filter(Boolean).join(' ')
}

function stamp(at: number | undefined): string {
  return typeof at === 'number' && Number.isFinite(at) ? new Date(at).toISOString() : ''
}

function entryHeading(e: Entry): string {
  switch (e.role) {
    case 'user':
      return e.pending ? `User (${e.pending})` : 'User'
    case 'assistant':
      return 'Assistant'
    case 'thinking':
      return 'Thinking'
    case 'tool':
      return `Tool · ${e.tool?.name ?? 'unknown'} · ${e.tool?.status ?? 'unknown'}`
    case 'question':
      return 'Question'
    default:
      return String(e.role)
  }
}

/** The conversation as Markdown, in the order the studio draws it. */
export function chatMarkdown(
  project: ReviewProject,
  owner: ReviewOwner | null,
  entries: Entry[],
  exportedAt = new Date(),
): string {
  const lines = [
    `# ${project.title || 'Untitled project'}`,
    '',
    `- Project: ${project.id}`,
    `- Owner: ${ownerName(owner)}`,
    `- Created: ${project.createdAt}`,
    `- Exported: ${exportedAt.toISOString()}`,
    `- Entries: ${entries.length}`,
    '',
  ]
  for (const e of entries) {
    const when = stamp(e.at)
    lines.push(`## ${entryHeading(e)}${when ? ` — ${when}` : ''}`, '')
    if (e.text?.trim()) lines.push(e.text.trim(), '')
    if (e.role === 'question' && e.ask) {
      if (e.ask.intro) lines.push(e.ask.intro, '')
      for (const q of e.ask.questions ?? []) {
        lines.push(`- ${q.question}`)
        for (const o of q.options ?? []) lines.push(`  - ${o.label}`)
      }
      lines.push('')
    }
  }
  return `${lines.join('\n').trimEnd()}\n`
}

/**
 * The pi session file is JSON Lines. Keep every line: a line that does not
 * parse (a torn final write) is kept as text rather than dropped, because the
 * point of the download is to see exactly what happened.
 */
export function parseSessionLog(raw: string | null): unknown[] {
  if (!raw) return []
  const out: unknown[] = []
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue
    try {
      out.push(JSON.parse(line))
    } catch {
      out.push({ unparsed: line })
    }
  }
  return out
}

/**
 * Asset thumbnails come back pointing at the owner's route. In the admin view
 * they must point at the admin route instead, which is the only one that
 * will answer an administrator.
 */
export function adminAssetUrl(projectId: string, url: string | null): string | null {
  if (!url) return url
  const owner = `/projects/${encodeURIComponent(projectId)}/`
  return url.startsWith(owner) ? `/admin${url}` : url
}
