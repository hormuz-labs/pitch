/**
 * Pitch Studio server: auth, credits, projects, agent sessions, previews,
 * renders, sharing, MCP and admin (docs/studio-architecture.md).
 *
 * One image, four roles (worker/config.ts): `all` is the single-box layout
 * and the default; `api` replicas hold nothing and proxy to workers; `worker`
 * nodes own projects and answer only the worker contract and file requests;
 * `render` pods hold nothing and run the heavy host actions workers queue.
 */
import { mkdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { clerkMiddleware } from '@clerk/express'
import { createLogger, pickManager, setManagerBaseUrl } from '@saas/shared'
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
const {
  DRAIN_MS,
  IS_API,
  IS_RENDER,
  IS_WORKER,
  RENDER_MODE,
  ROLE,
  SHUTDOWN_GRACE_MS,
  WORKER_TOKEN,
} = await import('./worker/config.js')

// Which browser manager this process uses. One configured means no choice;
// a pool (a headless Service) means the one with the most room, re-picked
// now and then so a process outlives any single manager pod.
const pinManager = async () => {
  try {
    setManagerBaseUrl(await pickManager())
  } catch (err) {
    logger.warn({ err }, 'could not pick a browser manager; using the configured URL')
  }
}
await pinManager()
setInterval(() => void pinManager(), 5 * 60_000).unref()

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
const { router: voiceRoutes } = await import('./routes/voices.js')
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
// An API replica keeps no state on disk; a worker's (and a render pod's)
// two directories must be writable.
const stateDirs =
  IS_WORKER || IS_RENDER
    ? [
        process.env.PROJECTS_DIR || path.join(rootDir, 'projects'),
        process.env.PI_AGENT_DIR || path.join(homedir(), '.pi', 'agent'),
      ]
    : []
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

// The worker contract: authenticated by the shared token, never by Clerk, so
// it mounts before anything that would try to read a session from it.
if (IS_WORKER) {
  const { router: workerRoutes } = await import('./worker/routes.js')
  app.use('/internal/worker', workerRoutes)
}

if (ROLE === 'worker') {
  // A worker node serves only its contract and workspace files. The files
  // are public-ish on purpose: the CloakBrowser beside this worker loads
  // previews from here with the preview cookie, exactly as it did from the
  // single api container (PREVIEW_COOKIE_SECRET must match across nodes).
  app.use(cors({ origin: true, credentials: true }))
  app.use(cookieParser())
  app.use((req, _res, next) => {
    if (req.query.token && !req.headers.authorization && /^\/files\//.test(req.path))
      req.headers.authorization = `Bearer ${req.query.token}`
    next()
  })
  app.use(clerkMiddleware({ clockSkewInMs: 60_000 }))
  app.use('/files', filesRoutes)
}

// Clerk and Dodo webhooks need their untouched request bodies and must mount
// before express.json() and Clerk's session middleware.
if (IS_API) {
  // The autoscaler's read, behind the worker token rather than Clerk.
  const { router: scaleRoutes } = await import('./worker/scale.js')
  app.use('/internal/scale', scaleRoutes)
  app.use('/webhooks/clerk', clerkWebhookRoutes)
  app.use('/webhooks', webhookRoutes)

  // MCP + public REST API: API-key auth (Clerk must never see these Bearer
  // tokens) and base64 uploads above the default JSON limit.
  app.use('/mcp', mcpRoutes)
  app.use('/v1', cors({ origin: true }), v1Routes)

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
  app.use('/voices', voiceRoutes)
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
}

const PORT = process.env.PORT || 3000
const server = app.listen(PORT, () =>
  logger.info({ port: PORT, role: ROLE }, 'studio server started'),
)
// The render tier: claim jobs, run them, ship the files back. It registers
// nowhere and answers only /health.
const renderer = IS_RENDER ? await import('./renderer/runner.js') : null
if (renderer) renderer.startRenderer()
if (IS_WORKER && RENDER_MODE === 'remote') {
  const { setRemoteDispatcher } = await import('./studio/host-actions.js')
  const { dispatchRemote } = await import('./worker/remote.js')
  setRemoteDispatcher(dispatchRemote)
  logger.info('heavy host actions go to the render tier')
}
if (IS_API) {
  attachVncProxy(server)
  void resumePendingWebhooks()
  const { installEventForwarder } = await import('./worker/client.js')
  installEventForwarder()
  // The render tier's replica count is this process's job in a cluster.
  const { startRenderAutoscaler } = await import('./renderer/autoscale.js')
  startRenderAutoscaler()
}
const workerHost = IS_WORKER ? await import('./worker/host.js') : null
if (IS_WORKER) {
  const { registerWorker, startHeartbeat } = await import('./worker/registry.js')
  await registerWorker()
  startHeartbeat(reason => {
    logger.error({ reason }, 'worker lease lost — dropping every held project')
    void workerHost!.unloadAll(reason)
  })
  workerHost!.startHostLoops()
  if (!WORKER_TOKEN)
    logger.warn(
      'STUDIO_WORKER_TOKEN is not set: this process can hold projects itself but other nodes cannot reach it',
    )
}

// Checkpoint and release every held project so another worker (or this one,
// next boot) picks it up. With a drain window nothing is lost: the worker
// keeps serving until each turn ends. Without one, the turns in flight are.
const drainWorker = async () => {
  if (!workerHost) return
  try {
    // The loops stay up through the drain: busyAt and checkpoints keep
    // flowing for the projects still being served.
    await workerHost.drain(DRAIN_MS)
    workerHost.stopHostLoops()
    const { stopWorkerHeartbeat } = await import('./worker/registry.js')
    stopWorkerHeartbeat()
    const { closeBrowser } = await import('./projects/thumbnails.js')
    await closeBrowser()
  } catch (err) {
    logger.warn({ err }, 'studio shutdown failed')
  }
}

const gracefulShutdown = async (signal: string) => {
  if (draining) return
  draining = true // /health/ready answers 503 from here on
  logger.info({ signal, drainMs: DRAIN_MS }, 'shutting down studio')
  const deadline = setTimeout(() => process.exit(1), DRAIN_MS + SHUTDOWN_GRACE_MS)
  deadline.unref()
  // A gentle drain has to keep the server up: the API reaches held projects
  // through it until the last one is released.
  if (DRAIN_MS > 0) await drainWorker()
  // A render pod finishes the job it is on; the queue retries whatever it cannot.
  if (renderer) await renderer.stopRenderer()
  // Stop new requests before aborting sessions; SSE/WS must not hold shutdown forever.
  server.close()
  if (IS_API) {
    try {
      const { shutdownAllSessions } = await import('./services/browser-host.js')
      await shutdownAllSessions()
    } catch (err) {
      logger.warn({ err }, 'browser-host shutdown failed')
    }
  }
  if (DRAIN_MS <= 0) await drainWorker()
  await prisma.$disconnect().catch(err => logger.warn({ err }, 'database shutdown failed'))
  server.closeAllConnections()
  clearTimeout(deadline)
  process.exit(0)
}
process.on('SIGINT', () => gracefulShutdown('SIGINT'))
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))
