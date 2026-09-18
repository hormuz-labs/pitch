import { API_URL } from '../../config'
import { api } from '../../lib/api'
import type {
  Asset,
  Entry,
  ExportStatus,
  FlowId,
  ProjectDetail,
  ProjectSummary,
  StudioModel,
  UploadRef,
} from './types'

export function apiUrl(path: string): string {
  return /^https?:\/\//i.test(path)
    ? path
    : `${API_URL.replace(/\/$/, '')}${path.startsWith('/') ? path : `/${path}`}`
}
export function mediaUrl(
  path: string | null | undefined,
  token: string | null,
  version?: number,
  extra?: Record<string, string>,
): string | null {
  if (!path) return null
  const isPublic = /^https?:\/\//i.test(path) && !path.startsWith(API_URL)
  if (!isPublic && !token) return null
  const params = new URLSearchParams(extra)
  if (version !== undefined) params.set('v', String(version))
  if (!isPublic && token) params.set('token', token)
  const base = apiUrl(path)
  const query = params.toString()
  return query ? `${base}${base.includes('?') ? '&' : '?'}${query}` : base
}
const p = (id: string) => `/projects/${encodeURIComponent(id)}`
export const studio = {
  models: (token: string) =>
    api.get<{ default: string; models: StudioModel[] }>('/projects/models', token),
  get: (token: string, id: string) => api.get<ProjectDetail>(p(id), token),
  patch: (token: string, id: string, data: { title?: string; pinnedAt?: string | null }) =>
    api.patch<ProjectSummary>(p(id), token, data),
  remove: (token: string, id: string) => api.delete<void>(p(id), token),
  prompt: (
    token: string,
    id: string,
    body: {
      text: string
      targets?: unknown[]
      scene?: string | null
      slide?: number | null
      uploads?: UploadRef[]
      options?: Record<string, unknown>
      answer?: import('./types').AskAnswer
      model?: string
      delivery?: 'queue' | 'steer'
      displayText?: string
    },
  ) =>
    api.post<{
      ok: boolean
      delivery: 'started' | 'queued' | 'steered'
      turn: number
      entryId: string
    }>(`${p(id)}/prompt`, token, body),
  rollback: (token: string, id: string, entryId: string) =>
    api.post<{ text: string; entries: Entry[]; project: ProjectSummary }>(
      `${p(id)}/rollback`,
      token,
      { entryId },
    ),
  stop: (token: string, id: string) => api.post<{ stopped: boolean }>(`${p(id)}/stop`, token),
  steerQueued: (token: string, id: string, entryId: string) =>
    api.post<{ steered: boolean }>(`${p(id)}/queue/${encodeURIComponent(entryId)}/steer`, token),
  messages: (token: string, id: string) =>
    api.get<{ entries: Entry[]; busy: boolean; activeModel: string | null }>(
      `${p(id)}/messages`,
      token,
    ),
  eventsUrl: (id: string, token: string) => mediaUrl(`${p(id)}/events`, token) as string,
  thumbnailUrl: (id: string, t: number, token: string, version: number) =>
    mediaUrl(`${p(id)}/thumbnail`, token, version, { t: String(t) }) as string,
  startExport: (token: string, id: string, body: Record<string, unknown> = {}) =>
    api.post<ExportStatus>(`${p(id)}/export`, token, body),
  getExport: (token: string, id: string) => api.get<ExportStatus>(`${p(id)}/export`, token),
  cancelExport: (token: string, id: string) =>
    api.post<{ cancelled: boolean }>(`${p(id)}/export/cancel`, token),
  share: (token: string, id: string) => api.post<ProjectSummary>(`${p(id)}/share`, token),
  unshare: (token: string, id: string) => api.delete<ProjectSummary>(`${p(id)}/share`, token),
  upload: (token: string, form: FormData) => api.postForm<UploadRef[]>('/uploads', token, form),
  assets: (token: string, id: string) => api.get<Asset[]>(`${p(id)}/assets`, token),
  addAssets: (token: string, id: string, uploads: UploadRef[]) =>
    api.post<Asset[]>(`${p(id)}/assets`, token, { uploads }),
  deleteAsset: (token: string, id: string, path: string) =>
    api.delete<{ removed: boolean }>(`${p(id)}/assets?path=${encodeURIComponent(path)}`, token),
}
export type { Asset, Entry, ExportStatus, FlowId, ProjectDetail, StudioModel, UploadRef }
