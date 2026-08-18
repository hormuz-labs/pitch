import * as db from '@saas/db'
import { createLogger, deriveJobTitle, JobStatus } from '@saas/shared'
import { Router } from 'express'

const logger = createLogger('api:share')

export const shareRouter = Router()

const APP_URL = (process.env.APP_URL || 'https://trypitch.co').replace(/\/$/, '')

// Short in-memory cache of the deployed SPA shell so a burst of crawler/bot
// hits on /d/:slug doesn't turn into a fetch to Vercel per request. Serves
// stale on fetch failure rather than erroring the whole page.
let cachedShell: { html: string; fetchedAt: number } | null = null
const SHELL_CACHE_TTL_MS = 60_000

async function getAppShellHtml(): Promise<string> {
  if (cachedShell && Date.now() - cachedShell.fetchedAt < SHELL_CACHE_TTL_MS) {
    return cachedShell.html
  }
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

/** Swap the homepage's OG/Twitter/title meta block for job-specific values.
 * Everything else in the fetched HTML (scripts, styles, asset links) is left
 * untouched, so the real, currently-deployed SPA still boots normally for
 * human visitors — only crawlers reading the raw response see the difference. */
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

// Unauthenticated, no DB writes — pure HTML+meta rendering for crawlers and
// the initial page load. apps/web/vercel.json rewrites /d/(.*) here (same
// mechanism as the existing /r/:code affiliate redirect). View counting
// happens separately in GET /jobs/public/:slug, which the React
// PublicDemoView calls once it boots, so repeated crawler/unfurl-bot hits on
// this route don't inflate shareViews.
shareRouter.get('/d/:slug', async (req, res) => {
  try {
    const html = await getAppShellHtml()
    const job = await db.getPublicJobBySlug(req.params.slug)

    if (!job || job.status !== JobStatus.COMPLETED || !job.videoUrl) {
      // Unknown/unshared/unfinished slug — serve the unmodified shell. The
      // React app owns rendering a "not found" state once it boots.
      res.set('Content-Type', 'text/html; charset=utf-8')
      return res.send(html)
    }

    const shareUrl = `${APP_URL}/d/${req.params.slug}`
    const rendered = injectShareMeta(html, {
      title: `${deriveJobTitle(job.parameters)} — made with Pitch`,
      description:
        'An AI-generated cinematic product demo, made with Pitch. Create your own free at trypitch.co.',
      image: job.thumbnailUrl || `${APP_URL}/tabLogoB.svg`,
      video: job.videoUrl,
      url: shareUrl,
    })

    res.set('Content-Type', 'text/html; charset=utf-8')
    res.send(rendered)
  } catch (error: any) {
    logger.error({ err: error, slug: req.params.slug }, 'Failed to render share page')
    res.status(500).send('Internal server error')
  }
})
