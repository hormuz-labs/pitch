/**
 * Typed client for the studio routes (docs/studio-architecture.md → Routes).
 * Tokens are passed in explicitly (Clerk `getToken()` at the call site) so this
 * module stays hook-free and testable.
 */
import { API_URL } from '../config'
import { api } from './api'

// ── Flows ─────────────────────────────────────────────────────────────────────

export type FlowId = 'studio' | 'launch-video' | 'demo-video' | 'deck' | 'recording-edit'
export const FLOW_IDS: FlowId[] = ['studio', 'launch-video', 'demo-video', 'deck', 'recording-edit']
export const isFlowId = (v: unknown): v is FlowId =>
  typeof v === 'string' && (FLOW_IDS as string[]).includes(v)

export interface FlowInfo {
  id: FlowId
  title: string
  /** flow.price({}) — the price with default options */
  basePrice: number
}

/**
 * Labels for the `flow` a project row was created with. New projects are all
 * 'studio'; the rest are here so imported and pre-merge projects still read
 * sensibly wherever the column is displayed.
 */
export const FLOWS: Record<FlowId, { title: string; short: string; blurb: string }> = {
  studio: {
    title: 'Project',
    short: 'Project',
    blurb: 'Anything the studio can make or edit.',
  },
  'launch-video': {
    title: 'Launch video',
    short: 'Launch',
    blurb: 'A cinematic launch film from a URL and one line of direction.',
  },
  'demo-video': {
    title: 'Demo video',
    short: 'Demo',
    blurb: 'A narrated walkthrough recorded in a real browser on your product.',
  },
  deck: {
    title: 'Slide deck',
    short: 'Deck',
    blurb: 'A designed presentation from a topic, a template, or a PDF/PPTX.',
  },
  'recording-edit': {
    title: 'Edit recording',
    short: 'Edit',
    blurb: 'Trim, zoom, caption and polish a screen recording you already have.',
  },
}

// ── Project shapes (mirror apps/api/src/projects/service.ts) ───────────────

export type ProjectStatus = 'empty' | 'working' | 'ready' | 'failed'

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
  /** Outputs found in the workspace; the project row holds the published ones. */
  outputs: Output[]
  /** Why the preview cannot load right now (e.g. shots.js does not evaluate). */
  error?: string | null
  /** Flow-specific extras the UI may show (storyboard, recording state…). */
  extra?: Record<string, unknown>
}

export interface Project {
  id: string
  userId: string
  flow: FlowId
  /** slug, unique per (userId, flow); the workspace dir name */
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
  shareViews: number
  createdAt: string
  updatedAt: string
  /** Derived, never stored. */
  status: ProjectStatus
  busy: boolean
}

export interface ProjectDetail extends Project {
  description: Description
}

export interface UploadRef {
  url: string
  name: string
  type: string
  size: number
}

export interface CreateProjectInput {
  prompt: string
  options?: Record<string, any>
  uploads?: UploadRef[]
  name?: string
  /** A `provider/id` model spec from the composer picker. */
  model?: string
}

export interface PromptInput {
  text: string
  targets?: Array<Record<string, any>>
  scene?: string | null
  slide?: number | null
  uploads?: UploadRef[]
  options?: Record<string, any>
  model?: string
}

export interface StudioModel {
  /** `provider/id`, e.g. `google/gemini-3.7-flash`. */
  spec: string
  label: string
}

// ── Thread / events ───────────────────────────────────────────────────────────

export type EntryRole = 'user' | 'assistant' | 'thinking' | 'tool'

export interface Entry {
  id: string
  role: EntryRole
  text: string
  tool?: { name: string; status: 'running' | 'done' | 'error'; args?: Record<string, unknown> }
  createdAt?: string
}

export type StudioEvent =
  | { type: 'hello'; busy: boolean }
  | { type: 'entry'; entry: Entry }
  | { type: 'delta'; id: string; delta: string }
  | { type: 'update'; entry: Entry }
  | { type: 'tool'; name: string; args: Record<string, unknown> }
  | { type: 'status'; busy: boolean }
  | { type: 'idle'; aborted?: boolean }
  | { type: 'error'; message: string }
  | ({ type: 'preview'; ok: boolean; files: string[] } & Partial<Description>)
  | { type: 'project'; project: Project }
  | { type: 'deleted' }

export interface ExportStatus {
  running: boolean
  res: string | null
  url: string | null
  /** 0–100 while capturing frames */
  progress: number
  /** idle | starting | mixing | capturing | encoding | muxing | uploading | done | failed */
  stage: string
  error: string | null
  startedAt: number | null
  finishedAt: number | null
}

export interface MusicTrack {
  name: string
  file: string
  url: string
  duration: number | null
}

/** GET /projects/public/:slug */
export interface PublicProject {
  id: string
  flow: FlowId
  title: string
  videoUrl: string | null
  pdfUrl: string | null
  thumbnailUrl: string | null
  createdAt: string
}

// ── URLs ──────────────────────────────────────────────────────────────────────

const apiBase = () => API_URL.replace(/\/$/, '')
const isAbsolute = (path: string) => /^(https?:)?\/\//i.test(path) || /^(blob|data):/i.test(path)

/** API-relative path → absolute URL on the API; absolute URLs pass through. */
export function resolveFileUrl(path: string): string {
  if (isAbsolute(path)) return path
  return `${apiBase()}${path.startsWith('/') ? path : `/${path}`}`
}

/**
 * URL for a file the browser loads through a media element, iframe or img —
 * elements that cannot send an Authorization header. API-relative `/files/…`
 * paths get `?token=`; absolute (S3 / CDN) URLs never do. `version` busts the
 * cache after the workspace changes.
 */
export function fileUrl(path: string, token: string | null, version?: number): string {
  const params = new URLSearchParams()
  if (version !== undefined) params.set('v', String(version))
  if (!isAbsolute(path) && token) params.set('token', token)
  const query = params.toString()
  const base = resolveFileUrl(path)
  if (!query) return base
  return `${base}${base.includes('?') ? '&' : '?'}${query}`
}

const p = (id: string) => `/projects/${encodeURIComponent(id)}`

// ── Client ────────────────────────────────────────────────────────────────────

export const listProjects = (token: string, flow?: FlowId) =>
  api.get<Project[]>(`/projects${flow ? `?flow=${encodeURIComponent(flow)}` : ''}`, token)

export const getFlows = (token: string) => api.get<FlowInfo[]>('/projects/flows', token)

export const listStudioModels = (token: string) =>
  api.get<{ default: string; models: StudioModel[] }>('/projects/models', token)

export const createProject = (token: string, input: CreateProjectInput) =>
  api.post<ProjectDetail>('/projects', token, input)

export const getProject = (token: string, id: string) => api.get<ProjectDetail>(p(id), token)

export const patchProject = (
  token: string,
  id: string,
  data: { title?: string; options?: Record<string, any> },
) => api.patch<Project>(p(id), token, data)

export const deleteProject = (token: string, id: string) => api.delete<null>(p(id), token)

export const prompt = (token: string, id: string, input: PromptInput) =>
  api.post<{ ok: boolean }>(`${p(id)}/prompt`, token, input)

export const stop = (token: string, id: string) =>
  api.post<{ stopped: boolean }>(`${p(id)}/stop`, token)

export const messages = (token: string, id: string) =>
  api.get<{ entries: Entry[]; busy: boolean }>(`${p(id)}/messages`, token)

/** EventSource URL for the project's SSE stream (token in the query). */
export const eventsUrl = (id: string, token: string) => fileUrl(`${p(id)}/events`, token)

/** JPEG of the live preview (html flows) or the render at time `t`. */
export const thumbnailUrl = (id: string, t: number, token: string, version?: number) =>
  fileUrl(`${p(id)}/thumbnail?t=${encodeURIComponent(String(t))}`, token, version)

export const startExport = (token: string, id: string, opts: { res?: string } = {}) =>
  api.post<ExportStatus>(`${p(id)}/export`, token, opts)

export const getExport = (token: string, id: string) =>
  api.get<ExportStatus>(`${p(id)}/export`, token)

export const cancelExport = (token: string, id: string) =>
  api.post<{ cancelled: boolean }>(`${p(id)}/export/cancel`, token)

export const share = (token: string, id: string) => api.post<Project>(`${p(id)}/share`, token)

export const unshare = (token: string, id: string) => api.delete<Project>(`${p(id)}/share`, token)

/** Public share payload — no auth. */
export async function getPublic(slug: string): Promise<PublicProject | null> {
  const res = await fetch(`${apiBase()}/projects/public/${encodeURIComponent(slug)}`)
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return (await res.json()) as PublicProject
}

/** Multipart upload (`files` field) → S3 refs. */
export const uploads = (token: string, form: FormData) =>
  api.postForm<UploadRef[]>('/uploads', token, form)

export const music = (token: string) => api.get<MusicTrack[]>('/music', token)

/** Share URL for a project the owner has made public. */
export const shareUrl = (slug: string) => `${window.location.origin}/d/${slug}`

export const studioApi = {
  listProjects,
  getFlows,
  listStudioModels,
  createProject,
  getProject,
  patchProject,
  deleteProject,
  prompt,
  stop,
  messages,
  eventsUrl,
  thumbnailUrl,
  startExport,
  getExport,
  cancelExport,
  share,
  unshare,
  getPublic,
  uploads,
  music,
  fileUrl,
  resolveFileUrl,
  shareUrl,
}
