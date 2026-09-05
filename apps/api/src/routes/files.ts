/**
 * Workspace files, the shots.js engine and the music library.
 *
 * A live preview is an iframe of a workspace page whose subresources cannot
 * carry a Clerk token, so the first authenticated hit sets the signed,
 * path-scoped preview cookie (lib/preview-auth.ts) that every later request
 * presents. Grants name the user, so `<userId>--` isolation still holds.
 */
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import express from 'express'
import { PREVIEW_COOKIE, setPreviewCookie, verifyPreviewGrant } from '../lib/preview-auth.js'
import { requireAuth } from '../middleware/auth.js'
import { ASSETS_DIR, ENGINE_DIR, MUSIC_DIR, ownsInternal, PROJECTS_DIR } from '../studio/paths.js'

export const router = express.Router()

/**
 * The `<script>` pair that turns a previewed page into a selectable one.
 *
 * `pagePath` is the path BELOW `/files/projects/<internal>` (e.g. `/deck.html`
 * or `/build/output.html`). The src is deliberately relative: the web app may
 * reach this router under a prefix — the dev server proxies it at `/api/files`
 * — and an absolute `/files/...` would resolve outside that prefix, quietly
 * return the app's index.html instead of the script, and leave the page
 * unselectable with nothing in the console to explain why.
 */
export function inspectorTag(pagePath: string, container: string, token?: string): string {
  const depth = 1 + pagePath.replace(/^\/+/, '').split('/').length
  const query = token ? `?token=${encodeURIComponent(token)}` : ''
  const src = `${'../'.repeat(depth)}engine/js/inspector.js${query}`
  return (
    `<script>window.STUDIO_INSPECTOR={container:${JSON.stringify(container)}}</script>` +
    `<script src="${src}"></script>`
  )
}

function previewAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  let userId = verifyPreviewGrant(req.cookies?.[PREVIEW_COOKIE])
  if (!userId) {
    userId = requireAuth(req, res)
    if (!userId) return
    setPreviewCookie(req, res, userId)
  }
  ;(req as any).previewUserId = userId
  next()
}

router.use('/projects/:internal', previewAuth, (req, res, next) => {
  const userId = (req as any).previewUserId as string
  const { internal } = req.params
  if (!ownsInternal(userId, internal)) return res.status(404).end()
  const dir = path.join(PROJECTS_DIR, internal)
  if (!existsSync(dir)) return res.status(404).end()
  res.setHeader('Cache-Control', 'no-store')
  // A page the studio previews with the generic inspector: inject it so the
  // user can point at elements (the launch engine carries its own).
  if (req.query.studio === '1' && /\.html$/i.test(req.path)) {
    const file = path.join(dir, decodeURIComponent(req.path))
    if (!file.startsWith(dir) || !existsSync(file)) return res.status(404).end()
    void readFile(file, 'utf8').then(
      html => {
        const container = typeof req.query.container === 'string' ? req.query.container : '.slide'
        const tag = inspectorTag(
          req.path,
          container,
          typeof req.query.token === 'string' ? req.query.token : undefined,
        )
        const out = /<\/body>/i.test(html) ? html.replace(/<\/body>/i, `${tag}</body>`) : html + tag
        res.setHeader('Content-Type', 'text/html; charset=utf-8')
        res.send(out)
      },
      () => res.status(500).end(),
    )
    return
  }
  // A download link names the file it should save as; the browser ignores
  // the `download` attribute across origins, so the header has to say it.
  const saveAs = typeof req.query.download === 'string' ? req.query.download : null
  express.static(dir, {
    dotfiles: 'deny',
    setHeaders: saveAs
      ? r =>
          r.setHeader(
            'Content-Disposition',
            `attachment; filename*=UTF-8''${encodeURIComponent(saveAs)}`,
          )
      : undefined,
  })(req, res, next)
})

router.use('/engine', previewAuth, express.static(ENGINE_DIR, { maxAge: '5m' }))
// The GSAP runtime, shared. index.html reaches it as ../../assets/gsap/…,
// which from /files/projects/<internal>/ resolves here — the same trick
// ../../engine/ uses. It used to be copied into every workspace.
router.use('/assets', previewAuth, express.static(ASSETS_DIR, { maxAge: '5m' }))
router.use('/music', previewAuth, express.static(MUSIC_DIR))
