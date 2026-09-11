/**
 * Pitch Studio server: auth, credits, projects, agent sessions, previews,
 * renders, sharing, MCP and admin — one process (docs/studio-architecture.md).
 */
import { mkdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { clerkMiddleware } from '@clerk/express'
import { createLogger } from '@saas/shared'
import cookieParser from 'cookie-parser'
import cors from 'cors'
import dotenv from 'dotenv'
import express from 'express'
import type { IncomingMessage, ServerResponse } from 'http'
import { type Options as PinoHttpOptions, pinoHttp } from 'pino-http'
import { checkWritableDirectory, healthRouter } from './lib/health.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '../../..')
dotenv.config({ path: path.join(rootDir, '.env') })
if (!process.env.CLERK_PUBLISHABLE_KEY && process.env.VITE_CLERK_PUBLISHABLE_KEY) {
  process.env.CLERK_PUBLISHABLE_KEY = process.env.VITE_CLERK_PUBLISHABLE_KEY
}

const logger = createLogger('studio')

// The pipelines register their host actions (and the launch exporter) on
// import. There is one agent and it can reach all of them; a pipeline that
// fails to load costs the studio that capability, not the whole app.
await import('./pipelines/media.js')
await import('./pipelines/video-gen.js')
await import('./pipelines/elevenlabs.js')
await import('./flows/launch-video/index.js')
await import('./flows/deck/index.js').catch(err =>
  logger.warn({ err }, 'deck pipeline unavailable'),
)
await import('./flows/demo-video/index.js').catch(err =>
  logger.warn({ err }, 'demo pipeline unavailable'),
)
await import('./flows/recording-edit/index.js').catch(err =>
  logger.warn({ err }, 'recording-edit pipeline unavailable'),
)

const { attachVncProxy } = await import('./lib/vnc-proxy.js')
const { resumePendingWebhooks } = await import('./lib/webhooks.js')
const adminRoutes = (await import('./routes/admin.js')).default
const { router: affiliateRoutes, redirectRouter } = await import('./routes/affiliate.js')
const { router: apiKeyRoutes } = await import('./routes/api-keys.js')
const { router: browserRoutes } = await import('./routes/browser.js')
const { router: checkoutRoutes } = await import('./routes/checkout.js')
const { router: creditRoutes } = await import('./routes/credits.js')
const { router: filesRoutes } = await import('./routes/files.js')
const { router: mcpRoutes } = await import('./routes/mcp.js')
const { router: musicRoutes } = await import('./routes/music.js')
const { router: newsletterRoutes } = await import('./routes/newsletter.js')
const { router: promoRoutes } = await import('./routes/promo.js')
const { router: projectRoutes, publicRouter: publicProjectRoutes } = await import(
  './routes/projects.js'
)
const { shareRouter } = await import('./routes/share.js')
const { router: uploadRoutes } = await import('./routes/uploads.js')
const { router: userRoutes } = await import('./routes/users.js')
const { router: v1Routes } = await import('./routes/v1.js')
const { router: webhookRoutes } = await import('./routes/webhooks.js')
const { router: clerkWebhookRoutes } = await import('./routes/clerk-webhooks.js')
const { router: internalDiscordRoutes } = await import('./routes/internal-discord.js')

export const app = express()
const { prisma } = await import('@saas/db')
const stateDirs = [
  process.env.PROJECTS_DIR || path.join(rootDir, 'projects'),
  process.env.PI_AGENT_DIR || path.join(homedir(), '.pi', 'agent'),
]
await Promise.all(stateDirs.map(dir => mkdir(dir, { recursive: true })))
let draining = false
// Probe traffic must not depend on Clerk or trigger authentication/network calls.
app.use(
  '/health',
  healthRouter({
    isDraining: () => draining,
    check: () =>
      Promise.all([prisma.$queryRaw`SELECT 1`, ...stateDirs.map(checkWritableDirectory)]),
  }),
)

// Clerk and Dodo webhooks need their untouched request bodies and must mount
// before express.json() and Clerk's session middleware.
app.use('/webhooks/clerk', clerkWebhookRoutes)
app.use('/webhooks', webhookRoutes)

// MCP + public REST API: API-key auth (Clerk must never see these Bearer
// tokens) and base64 uploads above the default JSON limit.
app.use('/mcp', express.json({ limit: '750mb' }), mcpRoutes)
app.use('/v1', cors({ origin: true }), express.json({ limit: '750mb' }), v1Routes)

app.use(express.json({ limit: '50mb' }))
app.use(cors({ origin: true, credentials: true }))
app.use(cookieParser())

// Service-to-service bot API. It owns Discord identity resolution and still
// delegates project creation to the studio's one canonical creation path.
app.use('/internal/discord', internalDiscordRoutes)

// EventSource / <video> / <img> / <iframe> can't set Authorization headers, so
// a Clerk session token may ride in ?token= for streams and files.
const TOKEN_QUERY_PATHS = [
  /^\/projects\/[^/]+\/(events|thumbnail)$/,
  /^\/projects\/[^/]+\/assets\/thumb$/,
  /^\/files\//,
]
app.use((req, _res, next) => {
  if (
    req.query.token &&
    !req.headers.authorization &&
    TOKEN_QUERY_PATHS.some(re => re.test(req.path))
  ) {
    req.headers.authorization = `Bearer ${req.query.token}`
  }
  next()
})

app.use(clerkMiddleware({ clockSkewInMs: 60_000 }))

app.use(
  pinoHttp({
    logger,
    autoLogging: {
      ignore: (req: IncomingMessage) =>
        /\/events(\?|$)/.test(req.url ?? '') || /^\/files\//.test(req.url ?? ''),
    },
    customLogLevel: (_req: IncomingMessage, res: ServerResponse) =>
      res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info',
    serializers: {
      req(req: IncomingMessage) {
        return { method: (req as any).method, url: (req as any).url }
      },
      res(res: ServerResponse) {
        return { statusCode: res.statusCode }
      },
    },
  } as PinoHttpOptions),
)

app.use('/projects', publicProjectRoutes)
app.use('/projects', projectRoutes)
app.use('/files', filesRoutes)
app.use('/music', musicRoutes)
app.use('/uploads', uploadRoutes)
app.use('/api-keys', apiKeyRoutes)
app.use('/credits', creditRoutes)
app.use('/users', userRoutes)
app.use('/checkout', checkoutRoutes)
app.use('/promo', promoRoutes)
app.use(redirectRouter)
app.use(shareRouter)
app.use('/affiliate', affiliateRoutes)
app.use('/admin', adminRoutes)
app.use('/newsletter', newsletterRoutes)
app.use('/browser', browserRoutes)

const PORT = process.env.PORT || 3000
const server = app.listen(PORT, () => logger.info({ port: PORT }, 'studio server started'))
attachVncProxy(server)
void resumePendingWebhooks()

const gracefulShutdown = async (signal: string) => {
  if (draining) return
  draining = true
  logger.info({ signal }, 'shutting down studio')
  // Stop new requests before aborting sessions; SSE/WS must not hold shutdown forever.
  server.close()
  const deadline = setTimeout(() => process.exit(1), 25_000)
  deadline.unref()
  try {
    const { shutdownAllSessions } = await import('./services/browser-host.js')
    await shutdownAllSessions()
  } catch (err) {
    logger.warn({ err }, 'browser-host shutdown failed')
  }
  try {
    const { closeStudio } = await import('./studio/session.js')
    await closeStudio()
    const { closeBrowser } = await import('./projects/thumbnails.js')
    await closeBrowser()
  } catch (err) {
    logger.warn({ err }, 'studio shutdown failed')
  }
  await prisma.$disconnect().catch(err => logger.warn({ err }, 'database shutdown failed'))
  server.closeAllConnections()
  clearTimeout(deadline)
  process.exit(0)
}
process.on('SIGINT', () => gracefulShutdown('SIGINT'))
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))
