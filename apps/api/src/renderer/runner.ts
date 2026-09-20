/**
 * The render tier: a process that runs heavy host actions for workers.
 *
 * It holds no project and answers no request. It claims a RenderJob, puts
 * the checkpoint the job names on its own disk (warm if it rendered this
 * project before), runs the named host action with the job's params —
 * the very same code a single-box studio runs in-process — ships whatever
 * the action wrote back through the bucket, and marks the job done.
 *
 * Heartbeats keep the claim; a cancel asked for by the worker arrives on
 * the next heartbeat and aborts the action's signal. SIGTERM stops
 * claiming and lets the running job finish inside the grace period.
 */
import { existsSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { createLogger } from '@saas/shared'
import { rowById, workspaceOf } from '../projects/rows.js'
import { callHostAction, hostActionNames, isRemoteAction } from '../studio/host-actions.js'
import { PROJECTS_DIR } from '../studio/paths.js'
import { readMarker, restoreCheckpoint } from '../worker/checkpoint.js'
import { RENDER_CONCURRENCY, RENDER_ID } from '../worker/config.js'
import * as queue from './queue.js'
import { changedSince, uploadOutput } from './transfer.js'

const logger = createLogger('studio:renderer')

const IDLE_POLL_MS = Math.max(500, Number(process.env.STUDIO_RENDER_IDLE_POLL_MS || 2000))
const HEARTBEAT_MS = 15_000

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

let stopping = false
const running = new Set<Promise<void>>()

/** The checkpoint on this disk, restored only when the marker disagrees. */
async function materialise(projectId: string, version: number) {
  const row = await rowById(projectId)
  const ws = workspaceOf(row)
  const marker = await readMarker(ws.dir)
  if (marker?.projectId === projectId && marker.version === version && existsSync(ws.dir)) {
    logger.info({ projectId, version }, 'workspace already on disk')
    return ws
  }
  await mkdir(PROJECTS_DIR, { recursive: true })
  await restoreCheckpoint(projectId, ws, version)
  return ws
}

export async function runJob(job: queue.RenderJobRow): Promise<void> {
  const log = logger.child({ jobId: job.id, projectId: job.projectId, action: job.action })
  const controller = new AbortController()
  const beat = setInterval(() => {
    void queue
      .heartbeat(job.id, RENDER_ID)
      .then(({ cancel }) => {
        if (cancel && !controller.signal.aborted) {
          log.warn('cancel requested — aborting the action')
          controller.abort()
        }
      })
      .catch(err => log.warn({ err }, 'heartbeat failed'))
  }, HEARTBEAT_MS)
  beat.unref()
  let lastProgress = 0
  try {
    if (!isRemoteAction(job.action))
      throw new Error(
        `"${job.action}" is not a render action (have: ${hostActionNames().join(', ')})`,
      )
    await queue.progress(job.id, 'restoring')
    const ws = await materialise(job.projectId, job.workspaceVersion)
    const since = Date.now()
    await queue.progress(job.id, 'running')
    const params = JSON.parse(job.params || '{}') as Record<string, unknown>
    const result = await callHostAction(ws.dir, job.action, params, {
      signal: controller.signal,
      progress: (stage, percent) => {
        const now = Date.now()
        if (now - lastProgress < 1000 && percent !== 100) return
        lastProgress = now
        void queue.progress(job.id, stage, percent)
      },
    })
    await queue.progress(job.id, 'shipping', 100)
    const files = await changedSince(ws.dir, since)
    const shipped = await uploadOutput(job.id, ws.dir, files)
    const ok = await queue.complete(job.id, RENDER_ID, result)
    log.info(
      { shipped, ok, ms: Date.now() - since },
      ok ? 'render job done' : 'render job finished but the claim was lost',
    )
  } catch (err: any) {
    const message = controller.signal.aborted ? 'cancelled' : (err?.message ?? String(err))
    log.warn({ err: message }, 'render job failed')
    await queue.fail(job.id, RENDER_ID, message).catch(() => {})
  } finally {
    clearInterval(beat)
  }
}

async function loop(slot: number): Promise<void> {
  const log = logger.child({ slot })
  while (!stopping) {
    let job: queue.RenderJobRow | null = null
    try {
      if (slot === 0) await queue.reapAbandoned()
      job = await queue.claimNext(RENDER_ID)
    } catch (err) {
      log.warn({ err }, 'claim failed')
      await sleep(IDLE_POLL_MS * 2)
      continue
    }
    if (!job) {
      await sleep(IDLE_POLL_MS)
      continue
    }
    const run = runJob(job)
    running.add(run)
    await run.finally(() => running.delete(run))
  }
}

export function startRenderer(): void {
  logger.info({ renderer: RENDER_ID, concurrency: RENDER_CONCURRENCY }, 'render tier started')
  for (let i = 0; i < RENDER_CONCURRENCY; i++) void loop(i)
  const prune = setInterval(() => void queue.pruneFinished().catch(() => {}), 3_600_000)
  prune.unref()
}

/** Stop claiming; resolve once the jobs in flight are finished. */
export async function stopRenderer(): Promise<void> {
  stopping = true
  await Promise.allSettled([...running])
}

/** Jobs this process is running right now (the readiness probe reports it). */
export function inFlight(): number {
  return running.size
}
