/**
 * Studio client: the /projects API and the media URL rules. Tokens come from
 * Clerk at the call site (`useAuth().getToken`) so this module stays hook-free.
 */
import { API_URL } from '../config'
import { api } from '../lib/api'

export type FlowId = 'launch-video' | 'demo-video' | 'deck' | 'recording-edit'

export interface Output {
  kind: 'video' | 'pdf' | 'html' | 'thumbnail'
  url: string
  res?: string
  label?: string
  createdAt: string
}

export interface Scene {
  id: string
  index: number
  start: number
  end: number
  dur: number
  label?: string | null
  type?: string | null
}

export interface Slide {
  index: number
  title?: string | null
}

export type Preview =
  | { kind: 'html'; url: string }
  | { kind: 'deck'; url: string }
  | { kind: 'video'; url: string }
  | { kind: 'browser'; profileId: string }
  | null

export interface Description {
  preview: Preview
  audioUrl?: string | null
  scenes?: Scene[]
  slides?: Slide[]
  duration?: number
  outputs: Output[]
  error?: string | null
  extra?: Record<string, unknown>
}

export type ProjectStatus = 'empty' | 'working' | 'ready' | 'failed' | 'legacy'

export interface Project {
  id: string
  userId: string
  flow: FlowId
  name: string
  title: string
  prompt: string
  options: Record<string, any>
  creditsCharged: number
  outputs: Output[]
  thumbnailUrl: string | null
  lastError: string | null
  isPublic: boolean
  shareSlug: string | null
  legacyJobId: string | null
  createdAt: string
  updatedAt: string
  status: ProjectStatus
  busy: boolean
}

export interface ProjectDetail extends Project {
  description: Description
}

export type EntryRole = 'user' | 'assistant' | 'thinking' | 'tool'
export interface Entry {
  id: string
  role: EntryRole
  text: string
  tool?: { name: string; status: 'running' | 'done' | 'error' }
  at?: number
}

export interface ExportStatus {
  running: boolean
  res: string | null
  url: string | null
  progress: number
  stage: string
  error: string | null
  startedAt: number | null
  finishedAt: number | null
}

export type StudioEvent =
  | { type: 'hello'; busy: boolean }
  | { type: 'entry'; entry: Entry }
  | { type: 'delta'; id: string; delta: string }
  | { type: 'update'; entry: Entry }
  | { type: 'tool'; name: string; args: Record<string, unknown> }
  | { type: 'status'; busy: boolean }
  | { type: 'idle'; aborted?: boolean; failed?: boolean }
  | { type: 'error'; message: string }
  | { type: 'preview'; ok: boolean; files: string[]; description?: Description; error?: string | null }
  | { type: 'project'; project: Project }
  | { type: 'deleted' }

export interface UploadRef {
  url: string
  name: string
  type: string
  size: number
}

/** Absolute or app-relative URL for an API path (`/files/…`, `/projects/…`). */
export function apiUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path
  return `${API_URL.replace(/\/$/, '')}${path.startsWith('/') ? path : `/${path}`}`
}

/**
 * URL for media elements: API-hosted files get the Clerk token (they cannot
 * send headers) and a cache-busting version; public storage URLs never get
 * the token. Returns null when an API-hosted file has no token yet.
 */
export function mediaUrl(path: string | null | undefined, token: string | null, version?: number, extra?: Record<string, string>): string | null {
  if (!path) return null
  const isPublic = /^https?:\/\//i.test(path) && !path.startsWith(API_URL)
  if (!isPublic && !token) return null
  const params = new URLSearchParams(extra ?? {})
  if (version !== undefined) params.set('v', String(version))
  if (!isPublic && token) params.set('token', token)
  const q = params.toString()
  const base = apiUrl(path)
  return q ? `${base}${base.includes('?') ? '&' : '?'}${q}` : base
}

const p = (id: string) => `/projects/${encodeURIComponent(id)}`

export const studio = {
  list: (token: string, flow?: FlowId, importLegacy = false) =>
    api.get<Project[]>(`/projects${flow || importLegacy ? `?${new URLSearchParams({ ...(flow ? { flow } : {}), ...(importLegacy ? { import: '1' } : {}) })}` : ''}`, token),
  create: (token: string, body: { flow: FlowId; prompt: string; options?: Record<string, any>; uploads?: UploadRef[]; name?: string }) =>
    api.post<ProjectDetail>('/projects', token, body),
  get: (token: string, id: string) => api.get<ProjectDetail>(p(id), token),
  patch: (token: string, id: string, body: { title?: string; options?: Record<string, any> }) => api.patch<Project>(p(id), token, body),
  remove: (token: string, id: string) => api.delete<void>(p(id), token),
  prompt: (token: string, id: string, body: { text: string; targets?: unknown[]; scene?: string | null; slide?: number | null; uploads?: UploadRef[]; options?: Record<string, any> }) =>
    api.post<{ ok: boolean }>(`${p(id)}/prompt`, token, body),
  stop: (token: string, id: string) => api.post<{ stopped: boolean }>(`${p(id)}/stop`, token),
  messages: (token: string, id: string) => api.get<{ entries: Entry[]; busy: boolean }>(`${p(id)}/messages`, token),
  eventsUrl: (id: string, token: string) => mediaUrl(`${p(id)}/events`, token) as string,
  thumbnailUrl: (id: string, t: number, token: string, version: number) => mediaUrl(`${p(id)}/thumbnail`, token, version, { t: String(t) }) as string,
  startExport: (token: string, id: string, body: Record<string, any> = {}) => api.post<ExportStatus>(`${p(id)}/export`, token, body),
  getExport: (token: string, id: string) => api.get<ExportStatus>(`${p(id)}/export`, token),
  cancelExport: (token: string, id: string) => api.post<{ cancelled: boolean }>(`${p(id)}/export/cancel`, token),
  share: (token: string, id: string) => api.post<Project>(`${p(id)}/share`, token),
  unshare: (token: string, id: string) => api.delete<Project>(`${p(id)}/share`, token),
  upload: (token: string, form: FormData) => api.postForm<UploadRef[]>('/uploads', token, form),
}
