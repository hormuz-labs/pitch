/**
 * Typed client for the /launch-video backend endpoints.
 * All calls go through the shared api client (Clerk JWT injected per call);
 * SSE uses an EventSource with a ?token= query param, same as /jobs/stream.
 */
import { API_URL } from '../config'
import { api } from '../lib/api'

export interface LaunchProjectInfo {
  name: string
  hasVideo: boolean
  videoUrl: string | null
  sceneCount: number
}

export interface LaunchScene {
  id: string
  index: number
  start: number
  end: number
  dur: number
  draftUrl?: string | null
}

export interface LaunchProjectDetail {
  name: string
  duration: number
  videoUrl?: string | null
  scenes: LaunchScene[]
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  /** partId -> raw text; assistant text streams in part by part */
  partTexts: Record<string, string>
  /** Unix timestamp (ms) when the message was created */
  created?: number
}

/** Raw text of a message (all parts joined). */
export function rawText(m: ChatMessage): string {
  return Object.values(m.partTexts).join('\n')
}

/** Display text: any stray ```options blocks stripped. */
export function messageText(m: ChatMessage): string {
  return rawText(m)
    .replace(/```options\s*\n[\s\S]*?```/g, '')
    .replace(/```options[\s\S]*$/, '')
    .trim()
}

export interface MusicTrack {
  name: string
  file: string
  url: string
  duration: number | null
}

export interface StudioEvent {
  type: string
  properties?: Record<string, any>
}

export interface SessionMessagesResponse
  extends Array<{
    info: { id: string; role: string; time?: { created: number } }
    parts: Array<{ id: string; type: string; text?: string }>
  }> {}

/**
 * Video/music URLs come back as API-relative paths (/launch-video/files/…).
 * Prepend API_URL so they go through the correct proxy/base (e.g. /api).
 * Absolute URLs (https?://) are returned unchanged.
 */
export function resolveFileUrl(path: string | null | undefined): string | null {
  if (!path) return null
  if (/^https?:\/\//.test(path)) return path
  // path is already a root-relative API path like /launch-video/files/videos/…
  // Prepend API_URL (e.g. "/api") so Vite's proxy rule picks it up.
  const base = API_URL.replace(/\/$/, '')
  return `${base}${path}`
}

export const launchApi = {
  listProjects: (token: string) => api.get<LaunchProjectInfo[]>('/launch-video/projects', token),

  getProject: (token: string, name: string) =>
    api.get<LaunchProjectDetail>(
      `/launch-video/projects/${encodeURIComponent(name)}/scenes`,
      token,
    ),

  sendPrompt: (token: string, name: string, text: string, music?: string) =>
    api.post<{ sessionId: string }>(
      `/launch-video/projects/${encodeURIComponent(name)}/prompt`,
      token,
      { text, music: music || undefined },
    ),

  sendScenePrompt: (token: string, name: string, sceneId: string, text: string) =>
    api.post<{ sessionId: string }>(
      `/launch-video/projects/${encodeURIComponent(name)}/scenes/${encodeURIComponent(sceneId)}/prompt`,
      token,
      { text },
    ),

  getMessages: (token: string, sessionId: string) =>
    api.get<SessionMessagesResponse>(
      `/launch-video/sessions/${encodeURIComponent(sessionId)}/messages`,
      token,
    ),

  getMusic: (token: string) => api.get<MusicTrack[]>('/launch-video/music', token),

  /** EventSource URL for the project's opencode event stream. */
  eventsUrl: (name: string, token: string) =>
    `${API_URL}/launch-video/projects/${encodeURIComponent(name)}/events?token=${encodeURIComponent(token)}`,
}
