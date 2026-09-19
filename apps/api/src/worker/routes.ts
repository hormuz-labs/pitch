/**
 * The worker contract over HTTP: what an API replica asks the worker that
 * holds a project. Mounted at /internal/worker on every process that can own
 * projects, behind the shared STUDIO_WORKER_TOKEN. Nothing here checks a
 * user — the API did that before proxying, and the worker checks the lease.
 *
 * Errors come back as `{ error, code?, balance? }` with the status the
 * service would have used, so the client (worker/client.ts) can rethrow
 * them and the public routes answer exactly as they would have locally.
 */
import { createLogger } from '@saas/shared'
import express from 'express'
import { parseRow, rowById } from '../projects/rows.js'
import type { StudioEvent } from '../studio/events.js'
import { authorizedByWorkerToken } from './auth.js'
import { WORKER_ID, WORKER_TOKEN } from './config.js'
import { serveWorkspaceFile } from './files.js'
import * as host from './host.js'
import { currentEpoch } from './registry.js'

const logger = createLogger('studio:worker-routes')

export const router = express.Router()

router.use((req, res, next) => {
  if (!WORKER_TOKEN) return res.status(503).json({ error: 'STUDIO_WORKER_TOKEN is not configured' })
  if (!authorizedByWorkerToken(req.headers.authorization))
    return res.status(401).json({ error: 'Unauthorized' })
  next()
})
router.use(express.json({ limit: '50mb' }))

function fail(res: express.Response, err: any, what: string) {
  const status = err?.status ?? (err?.code === 'BUSY' ? 409 : 500)
  if (status >= 500) logger.error({ err }, what)
  const body: Record<string, unknown> = { error: err?.message ?? String(err) }
  if (err?.code) body.code = err.code
  if (typeof err?.balance === 'number') body.balance = err.balance
  res.status(status).json(body)
}

type Handler = (req: express.Request, res: express.Response) => Promise<unknown>
const route =
  (what: string, fn: Handler) => async (req: express.Request, res: express.Response) => {
    try {
      const out = await fn(req, res)
      if (res.headersSent) return
      if (Buffer.isBuffer(out)) {
        res.setHeader('Content-Type', 'image/jpeg')
        res.end(out)
      } else if (out === null || out === undefined) res.status(204).end()
      else res.json(out)
    } catch (err) {
      if (!res.headersSent) fail(res, err, what)
    }
  }

router.get('/health', (_req, res) =>
  res.json({ id: WORKER_ID, epoch: currentEpoch(), held: host.heldProjects().length }),
)

router.post(
  '/projects/:id/prepare',
  route('prepare', async req => {
    const { options, uploads } = req.body ?? {}
    await host.prepare(req.params.id, options ?? {}, Array.isArray(uploads) ? uploads : [])
    return { ok: true }
  }),
)

router.post(
  '/projects/:id/prompt',
  route('prompt', async req => {
    const text = String(req.body?.text ?? '')
    return host.prompt(req.params.id, text, req.body?.opts ?? {})
  }),
)

router.post(
  '/projects/:id/stop',
  route('stop', async req => ({ stopped: await host.stop(req.params.id) })),
)

router.post(
  '/projects/:id/steer',
  route('steer', async req => ({
    steered: await host.steer(req.params.id, String(req.body?.entryId ?? '')),
  })),
)

router.post(
  '/projects/:id/rollback',
  route('rollback', async req => host.rollback(req.params.id, String(req.body?.entryId ?? ''))),
)

router.get(
  '/projects/:id/entries',
  route('entries', async req => host.entries(req.params.id)),
)
router.get(
  '/projects/:id/describe',
  route('describe', async req => host.describe(req.params.id)),
)
router.get(
  '/projects/:id/busy',
  route('busy', async req => ({ busy: await host.busy(req.params.id) })),
)

router.get(
  '/projects/:id/thumbnail',
  route('thumbnail', async (req, res) => {
    const t = Math.max(0, Number(req.query.t ?? 0))
    const buf = await host.thumbnail(req.params.id, Number.isFinite(t) ? t : 0)
    if (!buf) {
      res.status(404).json({ error: 'no preview' })
      return
    }
    return buf
  }),
)

router.get(
  '/projects/:id/assets',
  route('assets', async req => host.listAssets(req.params.id)),
)
router.post(
  '/projects/:id/assets',
  route('add assets', async req =>
    host.addAssets(req.params.id, Array.isArray(req.body?.uploads) ? req.body.uploads : []),
  ),
)
router.post(
  '/projects/:id/deck',
  route('save deck', async req => host.saveDeck(req.params.id, String(req.body?.html ?? ''))),
)
router.post(
  '/projects/:id/deck/render',
  route('render deck', async req => host.renderDeck(req.params.id)),
)
router.delete(
  '/projects/:id/assets',
  route('delete asset', async req => ({
    removed: await host.deleteAsset(req.params.id, String(req.query.path ?? '')),
  })),
)
router.get(
  '/projects/:id/assets/thumb',
  route('asset thumbnail', async (req, res) => {
    const at = req.query.at === undefined ? undefined : Number(req.query.at)
    const buf = await host.assetThumbnail(req.params.id, {
      path: String(req.query.path ?? ''),
      at: Number.isFinite(at) ? at : undefined,
    })
    if (!buf) {
      res.status(404).end()
      return
    }
    return buf
  }),
)

router.post(
  '/projects/:id/export',
  route('export', async req => host.startExport(req.params.id, req.body ?? {})),
)
router.get(
  '/projects/:id/export',
  route('export status', async req => host.exportStatus(req.params.id)),
)
router.post(
  '/projects/:id/export/cancel',
  route('export cancel', async req => ({
    cancelled: await host.stopExport(req.params.id),
  })),
)

router.get('/projects/:id/events', async (req, res) => {
  let off: (() => void) | undefined
  const pending: StudioEvent[] = []
  let ready = false
  const send = (ev: StudioEvent) => {
    if (ready) res.write(`data: ${JSON.stringify(ev)}\n\n`)
    else pending.push(ev)
  }
  try {
    off = await host.subscribe(req.params.id, send)
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    })
    ready = true
    for (const ev of pending) send(ev)
  } catch (err) {
    return fail(res, err, 'events')
  }
  const keepAlive = setInterval(() => res.write(': ping\n\n'), 15000)
  req.on('close', () => {
    clearInterval(keepAlive)
    off?.()
  })
})

router.post(
  '/projects/:id/emit',
  route('emit', async req => {
    const ev = req.body?.event
    if (!ev || typeof ev.type !== 'string')
      throw Object.assign(new Error('event is required'), { status: 400 })
    return { delivered: host.emit(req.params.id, ev) }
  }),
)

router.post(
  '/projects/:id/release',
  route('release', async req => {
    await host.release(req.params.id)
    return { ok: true }
  }),
)

router.delete(
  '/projects/:id',
  route('remove', async req => {
    const raw = req.body?.row
    if (!raw || raw.id !== req.params.id)
      throw Object.assign(new Error('matching project row is required'), { status: 400 })
    await host.remove(parseRow(raw))
    return { ok: true }
  }),
)

/** Workspace files by project id; the API resolved the user and the project. */
router.use('/files/:id', async (req, res, next) => {
  try {
    const row = await rowById(req.params.id)
    const dir = await host.workspaceDir(row)
    serveWorkspaceFile(dir, req, res, next)
  } catch (err) {
    fail(res, err, 'file')
  }
})
