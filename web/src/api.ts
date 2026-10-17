// Client for the studio server. Shapes mirror crates/od/src/api.rs.

export const APP_NAME = 'Pitch Studio';

export type Project = {
  id: string;
  name: string;
  skillId: string | null;
  designSystemId: string | null;
  pendingPrompt: string | null;
  metadata: Record<string, unknown> & { kind?: string };
  customInstructions: string | null;
  createdAt: number;
  updatedAt: number;
  status?: { value: string; updatedAt?: number; runId?: string };
};

export type Conversation = {
  id: string;
  projectId: string;
  title: string | null;
  sessionMode: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
};

/** A persisted turn event. Live SSE frames are folded into this shape. */
export type TurnEvent =
  | { kind: 'text'; text: string }
  | { kind: 'thinking'; text: string }
  | { kind: 'tool_use'; id: string; name: string; input: Record<string, unknown>; startedAt?: number }
  | { kind: 'tool_result'; toolUseId: string; content: string; isError?: boolean; completedAt?: number }
  | { kind: 'status'; label: string; detail?: string }
  | { kind: 'usage'; usage: Record<string, unknown> }
  | { kind: 'done_key'; key: string }
  | { kind: 'next_steps'; suggestions: string[] }
  | { kind: 'artifact_focus'; open?: string | null; show?: string[] | null }
  | { kind: 'conversation_title'; title: string };

export type ProjectFile = {
  name: string;
  path: string;
  size: number;
  mtime: number;
  kind: string;
  mime: string;
  artifactManifest?: { kind?: string; renderer?: string; title?: string } | null;
};

export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  events: TurnEvent[];
  attachments: { path: string; name?: string }[];
  producedFiles: ProjectFile[];
  runId: string | null;
  runStatus: string | null;
  startedAt: number | null;
  endedAt: number | null;
  createdAt: number;
};

export type Skill = {
  id: string;
  name: string;
  description: string;
  source: 'skill' | 'template';
  mode: string | null;
  surface: string | null;
  scenario: string | null;
  category: string | null;
  platform: string | null;
  tags: string[];
  examplePrompt: string | null;
  previewEntry: string | null;
  requiresDesignSystem: boolean;
  craft: string[];
  featured: boolean;
};

export type DesignSystem = {
  id: string;
  name: string;
  category: string | null;
  description: string | null;
  previewPages: { path: string; role?: string; title?: string }[];
};

export type DesignSystemDetail = DesignSystem & {
  designMd: string | null;
  tokensCss: string | null;
  manifest: Record<string, unknown>;
};

export type RunEvent = { id: number; event: string; data: any };

export type ModelSettings = {
  protocol: 'openai' | 'anthropic' | 'gemini';
  baseUrl: string;
  effectiveBaseUrl: string;
  model: string;
  models: string[];
  hasKey: boolean;
};

function token(): string | null {
  try {
    return localStorage.getItem('studio:token');
  } catch {
    return null;
  }
}

function headers(extra?: Record<string, string>): Record<string, string> {
  const h: Record<string, string> = { ...extra };
  const t = token();
  if (t) h.authorization = `Bearer ${t}`;
  return h;
}

/** Append the API token to URLs the browser loads by itself (iframes, downloads). */
export function withToken(url: string): string {
  const t = token();
  if (!t) return url;
  return url + (url.includes('?') ? '&' : '?') + 'token=' + encodeURIComponent(t);
}

export class ApiError extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message);
  }
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    headers: headers(body === undefined ? undefined : { 'content-type': 'application/json' }),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    let message = res.statusText;
    let code: string | undefined;
    try {
      const j = await res.json();
      message = j?.error?.message ?? message;
      code = j?.error?.code;
    } catch {}
    throw new ApiError(res.status, message, code);
  }
  return res.json() as Promise<T>;
}

export const api = {
  config: () => call<{ models: string[]; defaultModel: string; previewPort?: number; previewOrigin?: string | null }>('GET', '/config'),
  settings: () => call<ModelSettings>('GET', '/settings'),
  saveSettings: (body: { protocol: string; baseUrl: string | null; model: string; models: string[]; apiKey?: string }) =>
    call<ModelSettings>('PUT', '/settings', body),
  providerModels: (body: { protocol: string; baseUrl?: string; apiKey?: string }) =>
    call<{ models: string[] }>('POST', '/settings/models', body),
  skills: () => call<{ skills: Skill[] }>('GET', '/skills').then((r) => r.skills),
  skill: (id: string) => call<{ skill: Skill & { body: string; hasExample: boolean } }>('GET', `/skills/${id}`).then((r) => r.skill),
  designSystems: () => call<{ designSystems: DesignSystem[] }>('GET', '/design-systems').then((r) => r.designSystems),
  designSystem: (id: string) => call<{ designSystem: DesignSystemDetail }>('GET', `/design-systems/${id}`).then((r) => r.designSystem),
  projects: () => call<{ projects: Project[] }>('GET', '/projects').then((r) => r.projects),
  project: (id: string) => call<{ project: Project }>('GET', `/projects/${id}`).then((r) => r.project),
  createProject: (body: Partial<Project> & { pendingPrompt?: string }) =>
    call<{ project: Project; conversationId: string }>('POST', '/projects', body),
  patchProject: (id: string, body: Record<string, unknown>) =>
    call<{ project: Project }>('PATCH', `/projects/${id}`, body).then((r) => r.project),
  deleteProject: (id: string) => call<{ ok: true }>('DELETE', `/projects/${id}`),
  conversations: (id: string) =>
    call<{ conversations: Conversation[] }>('GET', `/projects/${id}/conversations`).then((r) => r.conversations),
  createConversation: (id: string, body: { title?: string; sessionMode?: string } = {}) =>
    call<{ conversation: Conversation }>('POST', `/projects/${id}/conversations`, body).then((r) => r.conversation),
  patchConversation: (id: string, cid: string, body: { title?: string; sessionMode?: string }) =>
    call<{ conversation: Conversation }>('PATCH', `/projects/${id}/conversations/${cid}`, body),
  messages: (id: string, cid: string) =>
    call<{ messages: ChatMessage[] }>('GET', `/projects/${id}/conversations/${cid}/messages`).then((r) => r.messages),
  files: (id: string) => call<{ files: ProjectFile[] }>('GET', `/projects/${id}/files`).then((r) => r.files),
  deleteFile: (id: string, path: string) => call<{ ok: true }>('DELETE', `/projects/${id}/files/${encodePath(path)}`),
  runs: (q: { projectId?: string; conversationId?: string; status?: string }) =>
    call<{ runs: { id: string; status: string; conversationId: string; assistantMessageId: string }[] }>(
      'GET',
      `/runs?${new URLSearchParams(q as Record<string, string>)}`,
    ).then((r) => r.runs),
  createRun: (body: {
    projectId: string;
    conversationId: string;
    message: string;
    userMessageId: string;
    assistantMessageId: string;
    attachments?: string[];
    model?: string;
    sessionMode?: string;
    locale?: string;
  }) => call<{ runId: string; assistantMessageId: string }>('POST', '/runs', body),
  cancelRun: (runId: string) => call<{ ok: true }>('POST', `/runs/${runId}/cancel`),
  async upload(id: string, files: File[], dir = ''): Promise<ProjectFile[]> {
    const form = new FormData();
    if (dir) form.append('dir', dir);
    for (const f of files) form.append('files', f, f.name);
    const res = await fetch(`/api/projects/${id}/upload`, { method: 'POST', headers: headers(), body: form });
    if (!res.ok) throw new ApiError(res.status, 'upload failed');
    return (await res.json()).files;
  },
  async exportHtml(id: string, fileName: string): Promise<Blob> {
    const res = await fetch(`/api/projects/${id}/export/html`, {
      method: 'POST',
      headers: headers({ 'content-type': 'application/json' }),
      body: JSON.stringify({ fileName }),
    });
    if (!res.ok) throw new ApiError(res.status, 'export failed');
    return res.blob();
  },
};

export function encodePath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/');
}

// Agent-written files are served from a separate origin so they can never
// act as the studio. Set once at startup from /api/config.
let previewBase = '';

export async function initPreviewOrigin(): Promise<void> {
  try {
    const c = await call<{ previewPort?: number; previewOrigin?: string | null }>('GET', '/config');
    previewBase = c.previewOrigin?.replace(/\/$/, '') || (c.previewPort ? `${location.protocol}//${location.hostname}:${c.previewPort}` : '');
  } catch {}
}

/** A URL on the preview origin, e.g. `/skills/x/example`. */
export function previewUrl(path: string): string {
  return withToken(`${previewBase}${path}`);
}

export function rawUrl(projectId: string, path: string, bust?: number): string {
  return previewUrl(`/p/${projectId}/${encodePath(path)}${bust ? `?v=${bust}` : ''}`);
}

/** Sandbox flags for frames showing preview-origin pages. */
export const PREVIEW_SANDBOX = 'allow-scripts allow-same-origin allow-popups allow-forms allow-modals allow-downloads';

/**
 * Read a run's event stream. Resumes from `after`; reconnects with backoff
 * on network errors until the run's `end` frame arrives or `signal` aborts.
 */
export async function streamRun(
  runId: string,
  onEvent: (ev: RunEvent) => void,
  opts: { after?: number; signal?: AbortSignal } = {},
): Promise<void> {
  let after = opts.after ?? 0;
  let attempts = 0;
  for (;;) {
    let ended = false;
    try {
      const res = await fetch(`/api/runs/${runId}/events?after=${after}`, {
        headers: headers({ accept: 'text/event-stream' }),
        signal: opts.signal,
      });
      if (!res.ok || !res.body) throw new ApiError(res.status, `stream failed (${res.status})`);
      attempts = 0;
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let idx: number;
        while ((idx = buf.indexOf('\n\n')) >= 0) {
          const frame = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          let id = 0;
          let event = 'message';
          const data: string[] = [];
          for (const line of frame.split('\n')) {
            if (line.startsWith(':')) continue;
            if (line.startsWith('id:')) id = Number(line.slice(3).trim());
            else if (line.startsWith('event:')) event = line.slice(6).trim();
            else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''));
          }
          if (!data.length) continue;
          if (id) after = id;
          let parsed: unknown = null;
          try {
            parsed = JSON.parse(data.join('\n'));
          } catch {}
          onEvent({ id, event, data: parsed });
          if (event === 'end') ended = true;
        }
      }
    } catch (err) {
      if (opts.signal?.aborted) return;
      if (err instanceof ApiError && err.status >= 400 && err.status < 500) throw err;
    }
    if (ended || opts.signal?.aborted) return;
    attempts += 1;
    if (attempts > 6) throw new Error('lost the connection to the run');
    await new Promise((r) => setTimeout(r, Math.min(500 * 2 ** attempts, 8000)));
  }
}

export function newId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let s = '';
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  for (const b of bytes) s += chars[b % chars.length];
  return s;
}

export function timeAgo(ms: number): string {
  const s = Math.max(0, (Date.now() - ms) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)}d ago`;
  return new Date(ms).toLocaleDateString();
}
