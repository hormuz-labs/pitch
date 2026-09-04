/**
 * Projects API (docs/studio-architecture.md → Routes).
 */
import { createLogger } from '@saas/shared'
import express from 'express'
import { requireAuth } from '../middleware/auth.js'
import { addAssets, assetThumbnail, deleteAsset, listAssets } from '../projects/assets.js'
import { cancelExport, exportProject, getExport } from '../projects/export.js'
import * as projects from '../projects/service.js'
import { projectThumbnail } from '../projects/thumbnails.js'
import { onProjectEvent } from '../studio/events.js'
import { isFlowId } from '../studio/paths.js'
import { peekSession } from '../studio/session.js'

const logger = createLogger('studio:routes')
export const router = express.Router()

function fail(res: express.Response, err: any, what: string) {
  const status = err?.status ?? (err?.code === 'BUSY' ? 409 : 500)
  if (status >= 500) logger.error({ err }, what)
  const body: Record<string, unknown> = { error: err?.message ?? String(err) }
  if (err instanceof projects.InsufficientCreditsError) body.balance = err.balance
  res.status(status).json(body)
}

router.get('/', async (req, res) => {
  const userId = requireAuth(req, res)
  if (!userId) return
  try {
    const flow =
      typeof req.query.flow === 'string' && isFlowId(req.query.flow) ? req.query.flow : undefined
    res.json(await projects.listProjects(userId, flow))
  } catch (err) {
    fail(res, err, 'list projects failed')
  }
})

// Kept for older clients: there is one agent now, and nothing is priced up
// front, so the answer no longer varies.
router.get('/flows', (_req, res) => {
  res.json([{ id: 'studio', title: 'Studio', basePrice: 0 }])
})

router.post('/', async (req, res) => {
  const userId = requireAuth(req, res)
  if (!userId) return
  try {
    const { prompt, options, uploads, name } = req.body ?? {}
    const project = await projects.createProject(userId, { prompt, options, uploads, name })
    res.status(201).json(project)
  } catch (err) {
    fail(res, err, 'create project failed')
  }
})

router.get('/:id', async (req, res) => {
  const userId = requireAuth(req, res)
  if (!userId) return
  try {
    res.json(await projects.getProject(userId, req.params.id))
  } catch (err) {
    fail(res, err, 'get project failed')
  }
})

router.patch('/:id', async (req, res) => {
  const userId = requireAuth(req, res)
  if (!userId) return
  try {
    res.json(await projects.updateProject(userId, req.params.id, req.body ?? {}))
  } catch (err) {
    fail(res, err, 'update project failed')
  }
})

router.delete('/:id', async (req, res) => {
  const userId = requireAuth(req, res)
  if (!userId) return
  try {
    await projects.deleteProject(userId, req.params.id)
    res.status(204).end()
  } catch (err) {
    fail(res, err, 'delete project failed')
  }
})

/**
 * The project's material: what the agent has to work WITH. Derived from the
 * workspace every time rather than stored, because the agent adds to it —
 * a generated clip, a harvested logo — without telling anyone.
 */
router.get('/:id/assets', async (req, res) => {
  const userId = requireAuth(req, res)
  if (!userId) return
  try {
    const p = await projects.getRow(userId, req.params.id)
    res.json(await listAssets(projects.workspaceOf(p), p.id))
  } catch (err) {
    fail(res, err, 'list assets failed')
  }
})

/** Add files mid-session. Takes refs from /uploads; runs no turn and costs nothing. */
router.post('/:id/assets', async (req, res) => {
  const userId = requireAuth(req, res)
  if (!userId) return
  try {
    const uploads = Array.isArray(req.body?.uploads) ? req.body.uploads : []
    if (!uploads.length) return res.status(400).json({ error: 'uploads is required' })
    const p = await projects.getRow(userId, req.params.id)
    res.json(await addAssets(projects.workspaceOf(p), p.id, uploads))
  } catch (err) {
    fail(res, err, 'add assets failed')
  }
})

/** Remove one file from the shelf. Only shelf material can be named. */
router.delete('/:id/assets', async (req, res) => {
  const userId = requireAuth(req, res)
  if (!userId) return
  try {
    const rel = String(req.query.path ?? '')
    if (!rel) return res.status(400).json({ error: 'path is required' })
    const p = await projects.getRow(userId, req.params.id)
    const removed = await deleteAsset(projects.workspaceOf(p), rel)
    res.json({ removed })
  } catch (err) {
    fail(res, err, 'delete asset failed')
  }
})

/**
 * A picture of one asset: a video frame, a PDF page, a scaled still. Served
 * like the other media routes (a `?token=` is accepted) because an <img> can
 * send no headers. Cached hard — the URL changes when the file does.
 */
router.get('/:id/assets/thumb', async (req, res) => {
  const userId = requireAuth(req, res)
  if (!userId) return
  try {
    const p = await projects.getRow(userId, req.params.id)
    const at = req.query.at === undefined ? undefined : Number(req.query.at)
    const buf = await assetThumbnail(projects.workspaceOf(p), {
      path: String(req.query.path ?? ''),
      at: Number.isFinite(at) ? at : undefined,
    })
    if (!buf) return res.status(404).end()
    res.setHeader('Content-Type', 'image/jpeg')
    res.setHeader('Cache-Control', 'private, max-age=60')
    res.end(buf)
  } catch (err) {
    fail(res, err, 'asset thumbnail failed')
  }
})

router.post('/:id/prompt', async (req, res) => {
  const userId = requireAuth(req, res)
  if (!userId) return
  try {
    const p = await projects.getRow(userId, req.params.id)
    const text = String(req.body?.text ?? '').trim()
    if (!text) return res.status(400).json({ error: 'text is required' })
    const targets = Array.isArray(req.body?.targets) ? req.body.targets.slice(0, 30) : []
    await projects.promptProject(p, text, {
      targets,
      scene: typeof req.body?.scene === 'string' ? req.body.scene : null,
      slide: typeof req.body?.slide === 'number' ? req.body.slide : null,
      uploads: Array.isArray(req.body?.uploads) ? req.body.uploads : undefined,
      options:
        req.body?.options && typeof req.body.options === 'object' ? req.body.options : undefined,
    })
    res.status(202).json({ ok: true })
  } catch (err) {
    fail(res, err, 'prompt failed')
  }
})

router.post('/:id/stop', async (req, res) => {
  const userId = requireAuth(req, res)
  if (!userId) return
  try {
    res.json({ stopped: await projects.stopProject(userId, req.params.id) })
  } catch (err) {
    fail(res, err, 'stop failed')
  }
})

router.get('/:id/messages', async (req, res) => {
  const userId = requireAuth(req, res)
  if (!userId) return
  try {
    const p = await projects.getRow(userId, req.params.id)
    res.json({ entries: projects.getEntries(p.id), busy: peekSession(p.id)?.busy ?? false })
  } catch (err) {
    fail(res, err, 'messages failed')
  }
})

router.get('/:id/events', async (req, res) => {
  const userId = requireAuth(req, res)
  if (!userId) return
  let p: projects.ProjectRow
  try {
    p = await projects.getRow(userId, req.params.id)
  } catch (err) {
    return fail(res, err, 'events failed')
  }
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  })
  const send = (ev: unknown) => res.write(`data: ${JSON.stringify(ev)}\n\n`)
  send({ type: 'hello', busy: peekSession(p.id)?.busy ?? false })
  const off = onProjectEvent(p.id, send)
  const keepAlive = setInterval(() => res.write(': ping\n\n'), 15000)
  req.on('close', () => {
    clearInterval(keepAlive)
    off()
  })
})

router.get('/:id/thumbnail', async (req, res) => {
  const userId = requireAuth(req, res)
  if (!userId) return
  try {
    const p = await projects.getRow(userId, req.params.id)
    const t = Math.max(0, Number(req.query.t ?? 0))
    const buf = await projectThumbnail(p, Number.isFinite(t) ? t : 0)
    if (!buf) return res.status(404).json({ error: 'no preview' })
    res.setHeader('Content-Type', 'image/jpeg')
    res.setHeader('Cache-Control', 'private, max-age=60')
    res.send(buf)
  } catch (err) {
    fail(res, err, 'thumbnail failed')
  }
})

router.post('/:id/export', async (req, res) => {
  const userId = requireAuth(req, res)
  if (!userId) return
  try {
    res.json(await exportProject(userId, req.params.id, req.body ?? {}))
  } catch (err) {
    fail(res, err, 'export failed')
  }
})

router.get('/:id/export', async (req, res) => {
  const userId = requireAuth(req, res)
  if (!userId) return
  try {
    const p = await projects.getRow(userId, req.params.id)
    res.json(getExport(p.id))
  } catch (err) {
    fail(res, err, 'export status failed')
  }
})

router.post('/:id/export/cancel', async (req, res) => {
  const userId = requireAuth(req, res)
  if (!userId) return
  try {
    const p = await projects.getRow(userId, req.params.id)
    res.json({ cancelled: cancelExport(p.id) })
  } catch (err) {
    fail(res, err, 'export cancel failed')
  }
})

router.post('/:id/share', async (req, res) => {
  const userId = requireAuth(req, res)
  if (!userId) return
  try {
    res.json(await projects.shareProject(userId, req.params.id))
  } catch (err) {
    fail(res, err, 'share failed')
  }
})

router.delete('/:id/share', async (req, res) => {
  const userId = requireAuth(req, res)
  if (!userId) return
  try {
    res.json(await projects.unshareProject(userId, req.params.id))
  } catch (err) {
    fail(res, err, 'unshare failed')
  }
})

/** Public share payload (no auth). */
export const publicRouter = express.Router()
publicRouter.get('/public/:slug', async (req, res) => {
  const p = await projects.getPublicProject(req.params.slug)
  if (!p) return res.status(404).json({ error: 'Not found' })
  const video = p.outputs.find(o => o.kind === 'video')
  const pdf = p.outputs.find(o => o.kind === 'pdf')
  res.json({
    id: p.id,
    flow: p.flow,
    title: p.title,
    videoUrl: video?.url ?? null,
    pdfUrl: pdf?.url ?? null,
    thumbnailUrl: p.thumbnailUrl,
    createdAt: p.createdAt,
  })
})
