/**
 * Serving one workspace file. Shared by the public /files route (the owner's
 * browser, or a preview cookie) and the worker contract (an API replica
 * proxying on that browser's behalf): the same handler, the same inspector
 * injection, the same rules about what may be read.
 */
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import express from 'express'

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

/** Serve `req.path` from `dir` (a workspace), with the studio's inspector and download rules. */
export function serveWorkspaceFile(
  dir: string,
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
): void {
  if (!existsSync(dir)) {
    res.status(404).end()
    return
  }
  res.setHeader('Cache-Control', 'no-store')
  // A page the studio previews with the generic inspector: inject it so the
  // user can point at elements (the launch engine carries its own).
  if (req.query.studio === '1' && /\.html$/i.test(req.path)) {
    const file = path.join(dir, decodeURIComponent(req.path))
    if (!file.startsWith(dir) || !existsSync(file)) {
      res.status(404).end()
      return
    }
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
}
