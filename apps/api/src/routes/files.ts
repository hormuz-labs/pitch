/**
 * Workspace files, the shots.js engine and the music library.
 *
 * A live preview is an iframe of a workspace page whose subresources cannot
 * carry a Clerk token, so the first authenticated hit sets the signed,
 * path-scoped preview cookie (lib/preview-auth.ts) that every later request
 * presents. Grants name the user, so `<userId>--` isolation still holds.
 *
 * The files themselves live on the worker holding the project. When that is
 * this process they are served from disk; otherwise the request is proxied
 * to the worker over the private network, range requests and all.
 */
import * as db from '@saas/db'
import express from 'express'
import { PREVIEW_COOKIE, setPreviewCookie, verifyPreviewGrant } from '../lib/preview-auth.js'
import { requireAuth } from '../middleware/auth.js'
import { parseRow } from '../projects/rows.js'
import { ASSETS_DIR, ENGINE_DIR, MUSIC_DIR, ownsInternal, parseInternal } from '../studio/paths.js'
import { withOwner } from '../worker/client.js'

export { inspectorTag } from '../worker/files.js'

export const router = express.Router()

function previewAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  // Authentication and ownership failures happen before the worker's static
  // handler, so protect those responses from becoming persistent cached 404s.
  res.setHeader('Cache-Control', 'no-store')
  // An explicit session token is authoritative. A signed preview cookie may
  // belong to a previous account in the same browser; preferring it would
  // mask every valid file request for the current account as a 404.
  const explicitAuth = !!req.headers.authorization
  const cookieUserId = explicitAuth ? null : verifyPreviewGrant(req.cookies?.[PREVIEW_COOKIE])
  let userId = explicitAuth ? requireAuth(req, res) : cookieUserId
  if (explicitAuth && !userId) return
  if (!userId) {
    userId = requireAuth(req, res)
    if (!userId) return
  }
  if (!cookieUserId) setPreviewCookie(req, res, userId)
  ;(req as any).previewUserId = userId
  next()
}

router.use('/projects/:internal', previewAuth, async (req, res, next) => {
  const userId = (req as any).previewUserId as string
  const { internal } = req.params
  if (!ownsInternal(userId, internal)) return res.status(404).end()
  const ws = parseInternal(internal)
  if (!ws) return res.status(404).end()
  try {
    const row = await db.prisma.project.findFirst({
      where: { userId: ws.userId, name: ws.name, flow: ws.flow },
    })
    if (!row) return res.status(404).end()
    await withOwner(row.id, w => w.file(parseRow(row), req, res, next))
  } catch (err: any) {
    if (res.headersSent) return
    res.status(err?.status ?? 500).json({ error: err?.message ?? 'file unavailable' })
  }
})

router.use('/engine', previewAuth, express.static(ENGINE_DIR, { maxAge: '5m' }))
// The GSAP runtime, shared. index.html reaches it as ../../assets/gsap/…,
// which from /files/projects/<internal>/ resolves here — the same trick
// ../../engine/ uses. It used to be copied into every workspace.
router.use('/assets', previewAuth, express.static(ASSETS_DIR, { maxAge: '5m' }))
router.use('/music', previewAuth, express.static(MUSIC_DIR))
