/**
 * /d/:slug — the public share page. Serves the deployed SPA shell with
 * project-specific OG/Twitter meta injected so links unfurl; the React app
 * fetches /projects/public/:slug once it boots.
 */
import * as db from '@saas/db'
import { createLogger } from '@saas/shared'
import { Router } from 'express'
import { getPublicProject } from '../projects/service.js'

const logger = createLogger('studio:share')
export const shareRouter = Router()

const APP_URL = (process.env.APP_URL || 'https://trypitch.co').replace(/\/$/, '')

let cachedShell: { html: string; fetchedAt: number } | null = null
const SHELL_CACHE_TTL_MS = 60_000

async function getAppShellHtml(): Promise<string> {
  if (cachedShell && Date.now() - cachedShell.fetchedAt < SHELL_CACHE_TTL_MS)
    return cachedShell.html
  try {
    const html = await fetch(`${APP_URL}/`, { signal: AbortSignal.timeout(5000) }).then(r =>
      r.text(),
    )
    cachedShell = { html, fetchedAt: Date.now() }
    return html
  } catch (error) {
    if (cachedShell) return cachedShell.html
    throw error
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function injectShareMeta(
  html: string,
  meta: { title: string; description: string; image: string; video?: string; url: string },
): string {
  const title = escapeHtml(meta.title)
  const description = escapeHtml(meta.description)
  const image = escapeHtml(meta.image)
  const url = escapeHtml(meta.url)
  let out = html
    .replace(/<title>[^<]*<\/title>/, `<title>${title}</title>`)
    .replace(
      /<meta property="og:title" content="[^"]*" \/>/,
      `<meta property="og:title" content="${title}" />`,
    )
    .replace(
      /<meta property="og:description" content="[^"]*" \/>/,
      `<meta property="og:description" content="${description}" />`,
    )
    .replace(
      /<meta property="og:url" content="[^"]*" \/>/,
      `<meta property="og:url" content="${url}" />`,
    )
    .replace(
      /<meta property="og:image" content="[^"]*" \/>/,
      `<meta property="og:image" content="${image}" />`,
    )
    .replace(
      /<meta name="twitter:title" content="[^"]*" \/>/,
      `<meta name="twitter:title" content="${title}" />`,
    )
    .replace(
      /<meta name="twitter:description" content="[^"]*" \/>/,
      `<meta name="twitter:description" content="${description}" />`,
    )
    .replace(/<link rel="canonical" href="[^"]*" \/>/, `<link rel="canonical" href="${url}" />`)
  if (meta.video) {
    const video = escapeHtml(meta.video)
    out = out.replace(
      '<meta name="twitter:card" content="summary_large_image" />',
      [
        '<meta name="twitter:card" content="player" />',
        `<meta property="og:video" content="${video}" />`,
        '<meta property="og:video:type" content="video/mp4" />',
        `<meta property="og:video:secure_url" content="${video}" />`,
      ].join('\n    '),
    )
  }
  return out
}

shareRouter.get('/d/:slug', async (req, res) => {
  try {
    const html = await getAppShellHtml()
    const project = await getPublicProject(req.params.slug)
    let meta: { title: string; image: string; video?: string } | null = null
    if (project) {
      const video = project.outputs.find(o => o.kind === 'video')?.url
      meta = {
        title: project.title,
        image: project.thumbnailUrl || `${APP_URL}/tabLogoB.svg`,
        video,
      }
    } else {
      // Links minted before the studio point at Job rows.
      const job = await db.getPublicJobBySlug(req.params.slug).catch(() => null)
      if (job?.videoUrl)
        meta = {
          title: job.parameters?.projectName || job.parameters?.url || 'Pitch demo',
          image: job.thumbnailUrl || `${APP_URL}/tabLogoB.svg`,
          video: job.videoUrl,
        }
    }
    res.set('Content-Type', 'text/html; charset=utf-8')
    if (!meta) return res.send(html)
    res.send(
      injectShareMeta(html, {
        title: `${meta.title} — made with Pitch`,
        description:
          'Made with Pitch, the AI studio for product videos and decks. Create your own free at trypitch.co.',
        image: meta.image,
        video: meta.video,
        url: `${APP_URL}/d/${req.params.slug}`,
      }),
    )
  } catch (error: any) {
    logger.error({ err: error, slug: req.params.slug }, 'Failed to render share page')
    res.status(500).send('Internal server error')
  }
})
