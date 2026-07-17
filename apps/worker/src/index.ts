import { createLogger, EDIT_QUEUE_NAME, ENHANCE_QUEUE_NAME, QUEUE_NAME } from '@saas/shared'
import { Worker } from 'bullmq'
import dotenv from 'dotenv'
import { Redis } from 'ioredis'
import path from 'path'
import { fileURLToPath } from 'url'
import { processEditJob } from './edit-job-processor.js'
import { processEnhanceJob } from './enhance-job-processor.js'
import { createJobProcessor, startCancellationListener } from './job-processor.js'
import { acquireOpencode, currentClient, forceCloseOpencode } from './opencode.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '../../..')

dotenv.config({ path: path.resolve(rootDir, '.env') })

const logger = createLogger('worker')

const connection = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
})

const targetDir = process.env.WORKSPACE_DIR || rootDir

// ── Lazy OpenCode server lifecycle ──────────────────────────────────────────
// The OpenCode server is NOT started at boot. Each worker handler acquires the
// shared server when a job arrives (starting it on the first job) and releases
// it when the job finishes; the manager stops the server once the last running
// job releases it. Overlapping jobs reuse the already-running server. Result:
// an idle worker runs no OpenCode process and holds no idle RAM.

const processJob = createJobProcessor(connection, targetDir)

// Dedicated Redis subscriber that listens for job cancellations published by the
// API when a user deletes a running job. The listener aborts and deletes the
// active OpenCode session for any matching in-flight job. `currentClient()` is
// undefined while idle (no server); the listener no-ops unless a job has an
// active session, so a missing client is harmless.
const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379'
const cancellationSubscriber = startCancellationListener(redisUrl, () => currentClient(), targetDir)

let isShuttingDown = false

async function shutdown(signal: string) {
  if (isShuttingDown) return
  isShuttingDown = true

  logger.info({ signal }, 'Shutting down worker')
  try {
    await worker.close()
  } catch (e) {
    logger.error({ err: e }, 'Error closing worker')
  }
  try {
    await enhanceWorker.close()
  } catch (e) {
    logger.error({ err: e }, 'Error closing enhance worker')
  }
  try {
    await editWorker.close()
  } catch (e) {
    logger.error({ err: e }, 'Error closing edit worker')
  }
  try {
    await forceCloseOpencode()
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

// ── BullMQ Worker ───────────────────────────────────────────────────────────
// BullMQ renews each job's Redis lock every lockDuration/2 while the handler
// runs. The 30s default expires whenever this process is frozen long enough
// (laptop sleep, or a CPU-starved event loop under ffmpeg load); BullMQ then
// fires lockRenewalFailed and its stalled checker requeues the job while the
// original run is still in flight — a duplicate run. 5 minutes covers
// ordinary stalls; longer interruptions are handled by the terminal-status
// guard in each processor (see utils/job-guard.ts).
const lockDuration = 5 * 60 * 1000

const worker = new Worker(
  QUEUE_NAME,
  async job => {
    if (job.data?.mode === 'plan') {
      await processJob(job)
      return
    }
    const handle = await acquireOpencode(targetDir)
    try {
      await processJob(job, handle.client)
    } finally {
      await handle.release()
    }
  },
  { connection: connection as any, lockDuration },
)

worker.on('completed', job => {
  logger.info({ jobId: job.id }, 'Job completed')
})

worker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err }, 'Job failed')
})

// When a job's lock can't be renewed (e.g. the process was frozen through a
// laptop sleep or a long event-loop stall), BullMQ fires this event and its
// stalled checker will eventually move the job back to the wait list. The
// in-flight run keeps going regardless and saves its result directly via
// pushJobResult; the requeued copy is skipped by each processor's
// terminal-status guard (utils/job-guard.ts), so no duplicate work happens.
worker.on('lockRenewalFailed', async (jobIds: string[]) => {
  logger.warn(
    { jobIds },
    'Lock renewal failed — in-flight run continues; requeued copy will be skipped',
  )
})

// BullMQ LockManager emits 'error' for every lockRenewalFailed as well as
// other genuine errors.  Suppress lock-renewal noise; log everything else.
worker.on('error', err => {
  const msg = (err as Error)?.message || String(err)
  if (msg.includes('could not renew lock')) return
  logger.error({ err }, 'Worker error')
})

// ── Enhance Queue Worker ─────────────────────────────────────────────────────
// Dedicated queue for presentation enhancement jobs. Runs with higher
// concurrency so many users can enhance simultaneously without blocking
// the main video queue. All concurrent enhance jobs share the single OpenCode
// server; it stays up until the last one releases it.
const enhanceConcurrency = Number(process.env.ENHANCE_WORKER_CONCURRENCY ?? '3')
const enhanceWorker = new Worker(
  ENHANCE_QUEUE_NAME,
  async job => {
    const handle = await acquireOpencode(targetDir)
    try {
      await processEnhanceJob(job, handle.client, connection, targetDir)
    } finally {
      await handle.release()
    }
  },
  { connection: connection as any, concurrency: enhanceConcurrency, lockDuration },
)

enhanceWorker.on('completed', job => {
  logger.info({ jobId: job.id }, 'Enhance job completed')
})

enhanceWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err }, 'Enhance job failed')
})

enhanceWorker.on('error', err => {
  const msg = (err as Error)?.message || String(err)
  if (msg.includes('could not renew lock')) return
  logger.error({ err }, 'Enhance worker error')
})

logger.info(
  { concurrency: enhanceConcurrency },
  'Enhance worker started, listening for enhance jobs',
)

// ── Edit-Recording Queue Worker ────────────────────────────────────────────────
// "Edit my recording" jobs: the recording-editor agent reconstructs
// demo-state.json from an uploaded narrated recording, then the standard render
// chain finishes it. Concurrency 1 — the agent writes to the shared recordings/
// directory, same constraint as the main video worker.
const editWorker = new Worker(
  EDIT_QUEUE_NAME,
  async job => {
    const handle = await acquireOpencode(targetDir)
    try {
      await processEditJob(job, handle.client, connection, targetDir)
    } finally {
      await handle.release()
    }
  },
  { connection: connection as any, concurrency: 1, lockDuration },
)

editWorker.on('completed', job => {
  logger.info({ jobId: job.id }, 'Edit job completed')
})

editWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err }, 'Edit job failed')
})

editWorker.on('error', err => {
  const msg = (err as Error)?.message || String(err)
  if (msg.includes('could not renew lock')) return
  logger.error({ err }, 'Edit worker error')
})

logger.info('Edit worker started, listening for edit-recording jobs')

logger.info('Worker started, listening for jobs (OpenCode server starts on first job)')
