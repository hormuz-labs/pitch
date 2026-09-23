/**
 * The worker's side of the render tier: run a heavy host action elsewhere.
 *
 *   checkpoint   the workspace as it is right now (the render pod restores it)
 *   enqueue      a RenderJob naming the action, its params and that version
 *   wait         polling the row; progress flows to the caller, a cancel
 *                flows to the renderer, a dead renderer is retried by the queue
 *   merge        the files the action wrote, extracted over the hot copy
 *
 * From the action's point of view nothing happened: it was called with a
 * workspace and it returned a string. From the session's point of view the
 * files appeared, the watcher saw them, and the project is dirty again.
 */
import { createLogger } from '@saas/shared'
import * as queue from '../renderer/queue.js'
import { discardOutput, downloadOutput } from '../renderer/transfer.js'
import type { HostContext, RemoteDispatcher } from '../studio/host-actions.js'
import type { Workspace } from '../studio/paths.js'
import { RENDER_TIMEOUT_MS } from './config.js'
import { checkpointForRender, noteExternalWrite } from './host.js'

const logger = createLogger('studio:remote')

const POLL_MS = Math.max(10, Number(process.env.STUDIO_RENDER_POLL_MS || 1500))

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

export class RenderFailedError extends Error {
  jobId: string
  constructor(jobId: string, message: string) {
    super(message)
    this.jobId = jobId
  }
}

/** Wait for a job to finish, relaying progress and a cancel. Resolves with the final row. */
export async function awaitJob(
  jobId: string,
  ctx: HostContext,
  opts: { timeoutMs?: number; pollMs?: number } = {},
): Promise<queue.RenderJobRow> {
  const deadline = Date.now() + (opts.timeoutMs ?? RENDER_TIMEOUT_MS)
  const poll = opts.pollMs ?? POLL_MS
  let last = ''
  let withdrawn = false
  const onAbort = () => {
    if (withdrawn) return
    withdrawn = true
    void queue.withdraw(jobId).catch(() => {})
  }
  ctx.signal?.addEventListener('abort', onAbort, { once: true })
  try {
    for (;;) {
      const row = await queue.getJob(jobId)
      if (!row) throw new RenderFailedError(jobId, 'render job vanished')
      const line = `${row.stage ?? ''}:${row.progress}`
      if (line !== last && row.stage) {
        last = line
        ctx.progress?.(row.stage, row.progress)
      }
      if (row.status === 'done' || row.status === 'failed' || row.status === 'cancelled') return row
      if (ctx.signal?.aborted) onAbort()
      if (Date.now() > deadline) {
        onAbort()
        throw new RenderFailedError(jobId, 'the render did not finish in time')
      }
      await sleep(poll)
    }
  } finally {
    ctx.signal?.removeEventListener('abort', onAbort)
  }
}

/** The dispatcher a worker installs (studio/host-actions.ts → setRemoteDispatcher). */
export const dispatchRemote: RemoteDispatcher = async (ws, name, params, ctx) => {
  ctx.signal?.throwIfAborted()
  ctx.progress?.('checkpointing workspace', 0)
  logger.info({ workspace: ws.internal, action: name }, 'preparing render checkpoint')
  const { projectId, version } = await checkpointForRender(ws, ctx)
  ctx.signal?.throwIfAborted()
  const job = await queue.enqueue({ projectId, action: name, params, workspaceVersion: version })
  logger.info({ jobId: job.id, projectId, action: name, version }, 'render job queued')
  ctx.progress?.('queued', 0)
  const row = await awaitJob(job.id, ctx)
  if (row.status !== 'done') {
    logger.warn(
      { jobId: job.id, action: name, status: row.status, error: row.error },
      'render job did not complete',
    )
    throw new RenderFailedError(
      job.id,
      row.status === 'cancelled' ? 'cancelled' : (row.error ?? `render ${row.status}`),
    )
  }
  ctx.progress?.('merging', 100)
  const merged = await downloadOutput(job.id, ws.dir)
  if (merged) noteExternalWrite(projectId)
  void discardOutput(job.id)
  logger.info({ jobId: job.id, action: name, merged }, 'render job done')
  return row.result ?? ''
}

export type { Workspace }
