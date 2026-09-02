import { clerkMiddleware } from '@clerk/express'
import * as db from '@saas/db'
import { createLogger, JOB_UPDATES_CHANNEL } from '@saas/shared'
import cookieParser from 'cookie-parser'
import cors from 'cors'
import dotenv from 'dotenv'
import express from 'express'
import type { IncomingMessage, ServerResponse } from 'http'
import path from 'path'
import { type Options as PinoHttpOptions, pinoHttp } from 'pino-http'
import { fileURLToPath } from 'url'
import { subscriber, webhookQueue } from './config.js'
import { attachVncProxy } from './lib/vnc-proxy.js'
import adminRoutes from './routes/admin.js'
import { router as affiliateRoutes, redirectRouter } from './routes/affiliate.js'
import { router as apiKeyRoutes } from './routes/api-keys.js'
import { router as browserRoutes } from './routes/browser.js'
import { router as checkoutRoutes } from './routes/checkout.js'
import { router as clerkWebhookRoutes } from './routes/clerk-webhooks.js'
import { router as creditRoutes } from './routes/credits.js'
import { router as editJobRoutes } from './routes/edit-jobs.js'
import { router as enhanceJobRoutes } from './routes/enhance-jobs.js'
import { router as jobRoutes } from './routes/jobs.js'
import { router as launchVideoRoutes } from './routes/launch-video.js'
import { router as mcpRoutes } from './routes/mcp.js'
import { router as newsletterRoutes } from './routes/newsletter.js'
import { router as pdfJobRoutes } from './routes/pdf-jobs.js'
import { shareRouter } from './routes/share.js'
import { router as uploadRoutes } from './routes/uploads.js'
import { router as userRoutes } from './routes/users.js'
import { router as v1Routes } from './routes/v1.js'
import { router as webhookRoutes } from './routes/webhooks.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '../../..')

dotenv.config({ path: path.join(rootDir, '.env') })

if (!process.env.CLERK_PUBLISHABLE_KEY && process.env.VITE_CLERK_PUBLISHABLE_KEY) {
  process.env.CLERK_PUBLISHABLE_KEY = process.env.VITE_CLERK_PUBLISHABLE_KEY
}

const logger = createLogger('api')

export const app = express()

// Clerk and Dodo webhooks need their untouched request bodies and must mount
// before express.json() and Clerk's session middleware.
app.use('/webhooks/clerk', clerkWebhookRoutes)
app.use('/webhooks', webhookRoutes)

// MCP endpoint: API-key auth (Clerk must never see these Bearer tokens) and
// base64 file uploads that exceed the default JSON limit, so it mounts with
// its own parser before the global express.json() and clerkMiddleware().
app.use('/mcp', express.json({ limit: '750mb' }), mcpRoutes)

// Public REST API. Same API-key auth and same base64 upload ceiling as /mcp, so
// it mounts alongside it, ahead of Clerk.
app.use('/v1', cors({ origin: true }), express.json({ limit: '750mb' }), v1Routes)

app.use(express.json({ limit: '50mb' }))
app.use(cors({ origin: true, credentials: true }))
app.use(cookieParser())

// EventSource / <video> / <audio> can't set Authorization headers, so allow a
// Clerk session token via ?token= for the SSE stream and the auth-gated static
// files (same pattern as /jobs/stream).
const TOKEN_QUERY_PATHS = [
  /^\/jobs\/stream$/,
  /^\/launch-video\/(files\/|projects\/[^/]+\/events$)/,
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
        req.url === '/jobs/stream' ||
        /^\/launch-video\/projects\/[^/]+\/events/.test(req.url ?? ''),
    },
    customLogLevel: (_req: IncomingMessage, res: ServerResponse) => {
      if (res.statusCode >= 500) return 'error'
      if (res.statusCode >= 400) return 'warn'
      return 'info'
    },
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

app.use('/demo', express.static(path.join(rootDir, 'demo')))

app.use('/jobs', jobRoutes)
app.use('/pdf-jobs', pdfJobRoutes)
app.use('/enhance-jobs', enhanceJobRoutes)
app.use('/edit-jobs', editJobRoutes)
app.use('/api-keys', apiKeyRoutes)
app.use('/credits', creditRoutes)
app.use('/users', userRoutes)
app.use('/uploads', uploadRoutes)
app.use('/checkout', checkoutRoutes)
app.use(redirectRouter)
app.use(shareRouter)
app.use('/affiliate', affiliateRoutes)
app.use('/admin', adminRoutes)
app.use('/newsletter', newsletterRoutes)
app.use('/browser', browserRoutes)
app.use('/launch-video', launchVideoRoutes)

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

const PORT = process.env.PORT || 3000
const server = app.listen(PORT, () => {
  logger.info({ port: PORT }, 'API server started')
})

// Bridge browser VNC WebSockets to the CloakBrowser Manager (handles manager
// auth + CSWSH so the browser never talks to the manager directly).
attachVncProxy(server)

// Subscribe to job updates to dispatch webhooks when jobs complete or fail
subscriber.subscribe(JOB_UPDATES_CHANNEL)
subscriber.on('message', (channel, message) => {
  if (channel === JOB_UPDATES_CHANNEL) {
    try {
      const jobData = JSON.parse(message)
      if (jobData && (jobData.status === 'COMPLETED' || jobData.status === 'FAILED')) {
        db.dispatchJobWebhooks(jobData, webhookQueue).catch(err => {
          logger.error({ err, jobId: jobData.id }, 'Error dispatching job webhooks')
        })
      }
    } catch {
      // ignore
    }
  }
})

const gracefulShutdown = async (signal: string) => {
  logger.info({ signal }, 'shutting down API — closing browser sessions')
  try {
    const { shutdownAllSessions } = await import('./services/browser-host.js')
    await shutdownAllSessions()
  } catch (err) {
    logger.warn({ err }, 'browser-host shutdown failed')
  }
  try {
    const { closeOpencode } = await import('./lib/launch-video/opencode.js')
    closeOpencode()
  } catch (err) {
    logger.warn({ err }, 'launch-video opencode shutdown failed')
  }
  process.exit(0)
}
process.on('SIGINT', () => gracefulShutdown('SIGINT'))
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))
