/**
 * The worker contract as the API sees it.
 *
 * `ownerFor(projectId)` places the project if nobody holds it and returns a
 * client for the holder: the host module itself when that is this process,
 * otherwise an HTTP client for the worker's private URL. Routes and the
 * project service only ever talk to a WorkerClient, so the single-box layout
 * and a fleet of nodes run the same code — the only difference is which
 * implementation comes back.
 */

import { Readable } from 'node:stream'
import { createLogger } from '@saas/shared'
import type express from 'express'
import type { Description, UploadRef } from '../flows/types.js'
import type { Asset, ThumbRequest } from '../projects/assets.js'
import type { ExportStatus } from '../projects/export.js'
import type { ProjectRow } from '../projects/rows.js'
import { type StudioEvent, setEventForwarder } from '../studio/events.js'
import type { Entry } from '../studio/session.js'
import { IS_WORKER, WORKER_ID, WORKER_TOKEN } from './config.js'
import { serveWorkspaceFile } from './files.js'
import type { PromptOptions, PromptProjectResult, RollbackProjectResult } from './host.js'
import * as host from './host.js'
import { acquire, ownerOf, type WorkerRow } from './lease.js'

const logger = createLogger('studio:worker-client')

export interface WorkerClient {
  readonly id: string
  readonly local: boolean
  prepare(id: string, options: Record<string, any>, uploads: UploadRef[]): Promise<void>
  prompt(id: string, text: string, opts?: PromptOptions): Promise<PromptProjectResult>
  stop(id: string): Promise<boolean>
  steer(id: string, entryId: string): Promise<boolean>
  rollback(id: string, entryId: string): Promise<RollbackProjectResult>
  entries(id: string): Promise<{ entries: Entry[]; busy: boolean }>
  describe(id: string): Promise<Description>
  busy(id: string): Promise<boolean>
  thumbnail(id: string, t: number): Promise<Buffer | null>
  listAssets(id: string): Promise<Asset[]>
  addAssets(id: string, uploads: UploadRef[]): Promise<Asset[]>
  deleteAsset(id: string, rel: string): Promise<boolean>
  assetThumbnail(id: string, req: ThumbRequest): Promise<Buffer | null>
  startExport(id: string, body: Record<string, any>): Promise<ExportStatus>
  exportStatus(id: string): Promise<ExportStatus>
  cancelExport(id: string): Promise<boolean>
  /** Attach to the project's event stream; `send` gets `hello` first. */
  events(id: string, send: (ev: StudioEvent) => void, signal: AbortSignal): Promise<void>
  emit(id: string, ev: StudioEvent): Promise<void>
  release(id: string): Promise<void>
  remove(row: ProjectRow): Promise<void>
  /** Serve one workspace file (or proxy the request to the worker that has it). */
  file(
    row: ProjectRow,
    req: express.Request,
    res: express.Response,
    next: express.NextFunction,
  ): Promise<void>
}

export class WorkerError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
    public balance?: number,
  ) {
    super(message)
  }
}

// ── Local ─────────────────────────────────────────────────────────────────────

const local: WorkerClient = {
  id: WORKER_ID,
  local: true,
  prepare: host.prepare,
  prompt: host.prompt,
  stop: host.stop,
  steer: host.steer,
  rollback: host.rollback,
  entries: host.entries,
  describe: host.describe,
  busy: host.busy,
  thumbnail: host.thumbnail,
  listAssets: host.listAssets,
  addAssets: host.addAssets,
  deleteAsset: host.deleteAsset,
  assetThumbnail: host.assetThumbnail,
  startExport: host.startExport,
  exportStatus: host.exportStatus,
  cancelExport: host.stopExport,
  async events(id, send, signal) {
    const off = await host.subscribe(id, send)
    if (signal.aborted) off()
    else signal.addEventListener('abort', off, { once: true })
  },
  async emit(id, ev) {
    host.emit(id, ev)
  },
  release: host.release,
  remove: row => host.remove(row.id, row),
  async file(row, req, res, next) {
    const dir = await host.workspaceDir(row)
    serveWorkspaceFile(dir, req, res, next)
  },
}

// ── Remote ────────────────────────────────────────────────────────────────────

const CALL_TIMEOUT_MS = 120_000

async function call<T>(
  w: WorkerRow,
  method: 'GET' | 'POST' | 'DELETE',
  path: string,
  body?: unknown,
  timeoutMs = CALL_TIMEOUT_MS,
): Promise<T> {
  if (!WORKER_TOKEN)
    throw new WorkerError('STUDIO_WORKER_TOKEN is not set; cannot reach worker', 500)
  const url = `${w.url}/internal/worker${path}`
  let res: Response
  try {
    res = await fetch(url, {
      method,
      headers: {
        authorization: `Bearer ${WORKER_TOKEN}`,
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch (err: any) {
    logger.warn({ err, worker: w.id, url }, 'worker unreachable')
    throw new WorkerError(
      `Worker ${w.id} is unreachable: ${err?.message ?? err}`,
      502,
      'WORKER_UNREACHABLE',
    )
  }
  const type = res.headers.get('content-type') ?? ''
  if (!res.ok) {
    let detail: any = {}
    try {
      detail = type.includes('json') ? await res.json() : { error: await res.text() }
    } catch {
      /* empty body */
    }
    throw new WorkerError(
      String(detail?.error ?? `worker answered ${res.status}`),
      res.status,
      detail?.code,
      detail?.balance,
    )
  }
  if (res.status === 204) return undefined as T
  if (type.startsWith('image/') || type === 'application/octet-stream')
    return Buffer.from(await res.arrayBuffer()) as T
  return (await res.json()) as T
}

/** Headers a proxied file request carries through, in either direction. */
const REQUEST_HEADERS = ['range', 'if-none-match', 'if-modified-since', 'accept', 'accept-encoding']
const RESPONSE_HEADERS = [
  'content-type',
  'content-length',
  'content-range',
  'accept-ranges',
  'etag',
  'last-modified',
  'cache-control',
  'content-disposition',
  'content-encoding',
]

async function proxy(
  w: WorkerRow,
  path: string,
  req: express.Request,
  res: express.Response,
): Promise<void> {
  if (!WORKER_TOKEN) {
    res.status(500).json({ error: 'STUDIO_WORKER_TOKEN is not set' })
    return
  }
  const headers: Record<string, string> = { authorization: `Bearer ${WORKER_TOKEN}` }
  for (const h of REQUEST_HEADERS) {
    const v = req.headers[h]
    if (typeof v === 'string') headers[h] = v
  }
  const controller = new AbortController()
  res.on('close', () => controller.abort())
  let upstream: Response
  try {
    upstream = await fetch(`${w.url}/internal/worker${path}`, {
      method: req.method,
      headers,
      signal: controller.signal,
    })
  } catch (err: any) {
    if (controller.signal.aborted) return
    logger.warn({ err, worker: w.id, path }, 'file proxy failed')
    res.status(502).json({ error: `Worker ${w.id} is unreachable` })
    return
  }
  res.status(upstream.status)
  for (const h of RESPONSE_HEADERS) {
    const v = upstream.headers.get(h)
    if (v !== null) res.setHeader(h, v)
  }
  if (!upstream.body) {
    res.end()
    return
  }
  const body = Readable.fromWeb(upstream.body as any)
  body.on('error', () => res.destroy())
  body.pipe(res)
}

/** A picture the worker does not have is null here, as it is locally; anything else is an error. */
function absentAsNull(err: unknown): null {
  if ((err as WorkerError)?.status === 404) return null
  throw err
}

function pathOf(id: string, rest = ''): string {
  return `/projects/${encodeURIComponent(id)}${rest}`
}

function remote(w: WorkerRow): WorkerClient {
  return {
    id: w.id,
    local: false,
    prepare: (id, options, uploads) =>
      call(w, 'POST', pathOf(id, '/prepare'), { options, uploads }),
    prompt: (id, text, opts = {}) => call(w, 'POST', pathOf(id, '/prompt'), { text, opts }),
    stop: id => call<{ stopped: boolean }>(w, 'POST', pathOf(id, '/stop')).then(r => r.stopped),
    steer: (id, entryId) =>
      call<{ steered: boolean }>(w, 'POST', pathOf(id, '/steer'), { entryId }).then(r => r.steered),
    rollback: (id, entryId) => call(w, 'POST', pathOf(id, '/rollback'), { entryId }),
    entries: id => call(w, 'GET', pathOf(id, '/entries')),
    describe: id => call(w, 'GET', pathOf(id, '/describe')),
    busy: id => call<{ busy: boolean }>(w, 'GET', pathOf(id, '/busy')).then(r => r.busy),
    thumbnail: (id, t) =>
      call<Buffer | undefined>(w, 'GET', pathOf(id, `/thumbnail?t=${encodeURIComponent(t)}`)).then(
        b => (b?.length ? b : null),
        absentAsNull,
      ),
    listAssets: id => call(w, 'GET', pathOf(id, '/assets')),
    addAssets: (id, uploads) => call(w, 'POST', pathOf(id, '/assets'), { uploads }),
    deleteAsset: (id, rel) =>
      call<{ removed: boolean }>(
        w,
        'DELETE',
        pathOf(id, `/assets?path=${encodeURIComponent(rel)}`),
      ).then(r => r.removed),
    assetThumbnail: (id, r) =>
      call<Buffer | undefined>(
        w,
        'GET',
        pathOf(
          id,
          `/assets/thumb?path=${encodeURIComponent(r.path)}${r.at !== undefined ? `&at=${encodeURIComponent(r.at)}` : ''}`,
        ),
      ).then(b => (b?.length ? b : null), absentAsNull),
    startExport: (id, body) => call(w, 'POST', pathOf(id, '/export'), body),
    exportStatus: id => call(w, 'GET', pathOf(id, '/export')),
    cancelExport: id =>
      call<{ cancelled: boolean }>(w, 'POST', pathOf(id, '/export/cancel')).then(r => r.cancelled),
    async events(id, send, signal) {
      if (!WORKER_TOKEN) throw new WorkerError('STUDIO_WORKER_TOKEN is not set', 500)
      const res = await fetch(`${w.url}/internal/worker${pathOf(id, '/events')}`, {
        headers: { authorization: `Bearer ${WORKER_TOKEN}`, accept: 'text/event-stream' },
        signal,
      }).catch(err => {
        throw new WorkerError(
          `Worker ${w.id} is unreachable: ${err?.message ?? err}`,
          502,
          'WORKER_UNREACHABLE',
        )
      })
      if (!res.ok || !res.body) {
        const detail = await res.text().catch(() => '')
        throw new WorkerError(detail || `worker answered ${res.status}`, res.status)
      }
      // Consumed in the background: the caller keeps its response open and
      // ends it when `signal` aborts (the browser went away).
      void (async () => {
        const reader = res.body!.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        try {
          for (;;) {
            const { value, done } = await reader.read()
            if (done) break
            buffer += decoder.decode(value, { stream: true })
            let sep = buffer.indexOf('\n\n')
            while (sep >= 0) {
              const frame = buffer.slice(0, sep)
              buffer = buffer.slice(sep + 2)
              for (const line of frame.split('\n')) {
                if (!line.startsWith('data:')) continue
                try {
                  send(JSON.parse(line.slice(5).trim()))
                } catch {
                  /* not ours */
                }
              }
              sep = buffer.indexOf('\n\n')
            }
          }
          if (!signal.aborted)
            send({ type: 'error', message: 'The studio worker closed the stream' })
        } catch (err) {
          if (!signal.aborted) {
            logger.warn({ err, worker: w.id, projectId: id }, 'event stream broke')
            send({ type: 'error', message: 'Lost contact with the studio worker' })
          }
        }
      })()
    },
    emit: (id, ev) => call(w, 'POST', pathOf(id, '/emit'), { event: ev }, 10_000),
    release: id => call(w, 'POST', pathOf(id, '/release')),
    remove: row => call(w, 'DELETE', pathOf(row.id)),
    file: (row, req, res) =>
      proxy(
        w,
        `/files/${encodeURIComponent(row.id)}${req.url.startsWith('/') ? req.url : `/${req.url}`}`,
        req,
        res,
      ),
  }
}

// ── Resolution ────────────────────────────────────────────────────────────────

function clientFor(w: WorkerRow): WorkerClient {
  return IS_WORKER && w.id === WORKER_ID ? local : remote(w)
}

const OWNER_CACHE_MS = 2000
const cache = new Map<string, { at: number; client: WorkerClient }>()

/** The client for the worker holding the project, placing it if needed. */
export async function ownerFor(projectId: string): Promise<WorkerClient> {
  const hit = cache.get(projectId)
  if (hit && Date.now() - hit.at < OWNER_CACHE_MS) return hit.client
  const client = clientFor(await acquire(projectId))
  cache.set(projectId, { at: Date.now(), client })
  return client
}

/** The current holder without placing; null when unowned. */
export async function currentOwner(projectId: string): Promise<WorkerClient | null> {
  const w = await ownerOf(projectId)
  return w ? clientFor(w) : null
}

export function forgetOwner(projectId: string): void {
  cache.delete(projectId)
}

/**
 * Run an operation against the owner; if the worker turns out to be gone
 * (unreachable, or it no longer holds the lease), place the project again
 * once and retry. Anything else propagates.
 */
export async function withOwner<T>(
  projectId: string,
  fn: (client: WorkerClient) => Promise<T>,
): Promise<T> {
  try {
    return await fn(await ownerFor(projectId))
  } catch (err: any) {
    if (err?.code !== 'WORKER_UNREACHABLE' && err?.code !== 'NOT_OWNER') throw err
    forgetOwner(projectId)
    return fn(await ownerFor(projectId))
  }
}

/** Events raised on this process for a project someone else holds reach that worker. */
export function installEventForwarder(): void {
  setEventForwarder(async (projectId, ev) => {
    if (IS_WORKER && host.holds(projectId)) return
    const owner = await currentOwner(projectId)
    if (!owner || owner.local) return
    await owner.emit(projectId, ev)
  })
}
