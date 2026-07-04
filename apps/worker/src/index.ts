import type { OpencodeClient } from '@opencode-ai/sdk'
import { createLogger, QUEUE_NAME } from '@saas/shared'
import { Worker } from 'bullmq'
import dotenv from 'dotenv'
import { Redis } from 'ioredis'
import path from 'path'
import { fileURLToPath } from 'url'
import { createJobProcessor, startCancellationListener } from './job-processor.js'
import { checkServerHealth, type OpencodeServer, restartServer, startServer } from './opencode.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '../../..')

dotenv.config({ path: path.resolve(rootDir, '.env') })

const logger = createLogger('worker')

const connection = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
})

const targetDir = process.env.WORKSPACE_DIR || rootDir

// ── Healthcheck configuration ───────────────────────────────────────
const HEALTHCHECK_INTERVAL_MS = Number(process.env.HEALTHCHECK_INTERVAL_MS || '10000')
const HEALTHCHECK_TIMEOUT_MS = Number(process.env.HEALTHCHECK_TIMEOUT_MS || '5000')
const HEALTHCHECK_MAX_FAILURES = Number(process.env.HEALTHCHECK_MAX_FAILURES || '3')
const SERVER_RESTART_MAX_RETRIES = Number(process.env.SERVER_RESTART_MAX_RETRIES || '3')

// ── Singleton OpenCode server & client ──────────────────────────────
// The OpenCode server supports multiple concurrent sessions. Starting one
// server per worker process and creating a session per job eliminates the
// massive overhead of spawning/killing a child process for every job.
let server: OpencodeServer
let client: OpencodeClient

async function initServer() {
  const result = await startServer(targetDir)
  server = result.server
  client = result.client
}

await initServer()

const processJob = createJobProcessor(connection, targetDir)

// Start a dedicated Redis subscriber that listens for job cancellations
// published by the API when a user deletes a running job. The listener will
// abort and delete the active OpenCode session for any matching in-flight job.
const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379'
const cancellationSubscriber = startCancellationListener(redisUrl, () => client, targetDir)

let isProcessingJob = false
let isShuttingDown = false
let consecutiveFailures = 0
let healthCheckTimer: ReturnType<typeof setInterval> | null = null

// ── Background healthcheck ──────────────────────────────────────────
function startHealthCheck() {
  healthCheckTimer = setInterval(async () => {
    if (isShuttingDown || isProcessingJob) return

    const healthy = await checkServerHealth(server, HEALTHCHECK_TIMEOUT_MS)
    if (healthy) {
      if (consecutiveFailures > 0) {
        logger.info('OpenCode server healthcheck recovered')
      }
      consecutiveFailures = 0
      return
    }

    consecutiveFailures++
    logger.error(
      { consecutiveFailures, maxFailures: HEALTHCHECK_MAX_FAILURES },
      'OpenCode server healthcheck failed',
    )

    if (consecutiveFailures >= HEALTHCHECK_MAX_FAILURES) {
      try {
        const result = await restartServer(server, targetDir, SERVER_RESTART_MAX_RETRIES)
        server = result.server
        client = result.client
        consecutiveFailures = 0
        logger.info({ url: server.url }, 'OpenCode server restarted successfully')
      } catch {
        await shutdown('HEALTHCHECK_FAILURE')
      }
    }
  }, HEALTHCHECK_INTERVAL_MS)
}

function stopHealthCheck() {
  if (healthCheckTimer) {
    clearInterval(healthCheckTimer)
    healthCheckTimer = null
  }
}

startHealthCheck()

async function shutdown(signal: string) {
  if (isShuttingDown) return
  isShuttingDown = true

  logger.info({ signal }, 'Shutting down worker')
  stopHealthCheck()
  try {
    await worker.close()
  } catch (e) {
    logger.error({ err: e }, 'Error closing worker')
  }
  try {
    server.close()
  } catch {
    // ignore
  }
  try {
    await cancellationSubscriber.quit()
  } catch {
    // ignore
  }
  try {
    await connection.quit()
  } catch {
    // ignore
  }
  process.exit(0)
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))

// ── BullMQ Worker ───────────────────────────────────────────────────
const worker = new Worker(
  QUEUE_NAME,
  async job => {
    isProcessingJob = true
    try {
      // Quick pre-flight healthcheck. If the server died while we were idle,
      // try to restart it before accepting the job.
      const healthy = await checkServerHealth(server, HEALTHCHECK_TIMEOUT_MS)
      if (!healthy) {
        try {
          const result = await restartServer(server, targetDir, SERVER_RESTART_MAX_RETRIES)
          server = result.server
          client = result.client
          logger.info({ url: server.url }, 'OpenCode server restarted before job')
        } catch {
          throw new Error('OpenCode server is not responding and could not be restarted')
        }
      }

      await processJob(job, client)
    } finally {
      isProcessingJob = false

      // Post-job healthcheck: if the server died during the job, trigger a
      // restart now while we are idle so the next job starts on a fresh server.
      const healthy = await checkServerHealth(server, HEALTHCHECK_TIMEOUT_MS)
      if (!healthy) {
        logger.error('OpenCode server unresponsive after job; attempting restart')
        try {
          const result = await restartServer(server, targetDir, SERVER_RESTART_MAX_RETRIES)
          server = result.server
          client = result.client
        } catch {
          await shutdown('POST_JOB_FAILURE')
        }
      }
    }
  },
  { connection: connection as any },
)

worker.on('completed', job => {
  logger.info({ jobId: job.id }, 'Job completed')
})

worker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err }, 'Job failed')
})

// When a job's lock can't be renewed (e.g. long video generation exceeded
// the lock window), BullMQ fires this event then spams error logs via the
// 'error' event.  Remove the job immediately to clear the queue — the
// in-flight worker still finishes and saves the result via pushJobResult.
worker.on('lockRenewalFailed', async (jobIds: string[]) => {
  logger.warn({ jobIds }, 'Lock renewal failed')
})

// BullMQ LockManager emits 'error' for every lockRenewalFailed as well as
// other genuine errors.  Suppress lock-renewal noise; log everything else.
worker.on('error', err => {
  const msg = (err as Error)?.message || String(err)
  if (msg.includes('could not renew lock')) return
  logger.error({ err }, 'Worker error')
})

logger.info('Worker started, listening for jobs')
