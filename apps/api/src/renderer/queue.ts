/**
 * The render queue: RenderJob rows in Postgres.
 *
 * A job is a heavy host action a worker wants run elsewhere, against the
 * workspace checkpoint it names. Claiming is one UPDATE with SKIP LOCKED, so
 * any number of render pods pull from the same table without a broker; a
 * pod that dies mid-job stops heartbeating and the job is claimed again,
 * up to RENDER_ATTEMPTS times.
 *
 * This is the only queue in the studio, and it is one on purpose: a render
 * is short, stateless and retriable, which is exactly what a session is not
 * (docs/studio-architecture.md → Scaling).
 */
import { prisma } from '@saas/db'
import { RENDER_ATTEMPTS, RENDER_STALE_MS } from '../worker/config.js'

export type RenderStatus = 'queued' | 'running' | 'done' | 'failed' | 'cancelled'

export interface RenderJobRow {
  id: string
  projectId: string
  action: string
  params: string
  workspaceVersion: number
  status: string
  stage: string | null
  progress: number
  result: string | null
  error: string | null
  cancelRequested: boolean
  renderer: string | null
  attempts: number
  createdAt: Date
  startedAt: Date | null
  heartbeatAt: Date | null
  finishedAt: Date | null
}

export async function enqueue(input: {
  projectId: string
  action: string
  params: Record<string, unknown>
  workspaceVersion: number
}): Promise<RenderJobRow> {
  return prisma.renderJob.create({
    data: {
      projectId: input.projectId,
      action: input.action,
      params: JSON.stringify(input.params ?? {}),
      workspaceVersion: input.workspaceVersion,
    },
  })
}

export async function getJob(id: string): Promise<RenderJobRow | null> {
  return prisma.renderJob.findUnique({ where: { id } })
}

/**
 * Take the oldest job nobody is running: queued, or running under a renderer
 * whose heartbeat went stale. One statement, so two pods cannot both win.
 */
export async function claimNext(renderer: string): Promise<RenderJobRow | null> {
  const stale = new Date(Date.now() - RENDER_STALE_MS)
  const rows = await prisma.$queryRaw<RenderJobRow[]>`
    UPDATE "RenderJob" SET
      "status" = 'running', "renderer" = ${renderer}, "attempts" = "attempts" + 1,
      "startedAt" = now(), "heartbeatAt" = now(), "stage" = 'starting', "progress" = 0
    WHERE "id" = (
      SELECT "id" FROM "RenderJob"
      WHERE "status" = 'queued'
         OR ("status" = 'running' AND "heartbeatAt" < ${stale} AND "attempts" < ${RENDER_ATTEMPTS})
      ORDER BY "createdAt"
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    RETURNING *`
  return rows[0] ?? null
}

/** Jobs whose renderer died for the last time: nobody will claim them, so fail them. */
export async function reapAbandoned(): Promise<number> {
  const stale = new Date(Date.now() - RENDER_STALE_MS)
  const r = await prisma.renderJob.updateMany({
    where: { status: 'running', heartbeatAt: { lt: stale }, attempts: { gte: RENDER_ATTEMPTS } },
    data: {
      status: 'failed',
      error: 'the render pod running this job went away',
      finishedAt: new Date(),
    },
  })
  return r.count
}

/** Fresh heartbeat; returns whether a cancel was asked for meanwhile. */
export async function heartbeat(id: string, renderer: string): Promise<{ cancel: boolean }> {
  await prisma.renderJob.updateMany({
    where: { id, renderer, status: 'running' },
    data: { heartbeatAt: new Date() },
  })
  const row = await prisma.renderJob.findUnique({
    where: { id },
    select: { cancelRequested: true, status: true, renderer: true },
  })
  return {
    cancel: !row || row.cancelRequested || row.status !== 'running' || row.renderer !== renderer,
  }
}

export async function progress(id: string, stage: string, percent?: number): Promise<void> {
  await prisma.renderJob
    .updateMany({
      where: { id, status: 'running' },
      data: {
        stage,
        ...(percent === undefined
          ? {}
          : { progress: Math.max(0, Math.min(100, Math.round(percent))) }),
      },
    })
    .catch(() => {})
}

export async function complete(id: string, renderer: string, result: string): Promise<boolean> {
  const r = await prisma.renderJob.updateMany({
    where: { id, renderer, status: 'running' },
    data: { status: 'done', result, progress: 100, stage: 'done', finishedAt: new Date() },
  })
  return r.count > 0
}

export async function fail(id: string, renderer: string, error: string): Promise<boolean> {
  const r = await prisma.renderJob.updateMany({
    where: { id, renderer, status: 'running' },
    data: {
      status: 'failed',
      error: error.slice(0, 2000),
      stage: 'failed',
      finishedAt: new Date(),
    },
  })
  return r.count > 0
}

/** The waiting side gave up: a queued job is dropped, a running one is asked to stop. */
export async function withdraw(id: string): Promise<void> {
  await prisma.renderJob.updateMany({
    where: { id, status: 'queued' },
    data: { status: 'cancelled', finishedAt: new Date() },
  })
  await prisma.renderJob.updateMany({
    where: { id, status: 'running' },
    data: { cancelRequested: true },
  })
}

export interface RenderDemand {
  queued: number
  running: number
  /** Render pods the fleet should have: one per job in flight. */
  wanted: number
}

/** What the render autoscaler follows (renderer/autoscale.ts; shown on /internal/scale). */
export async function renderDemand(min = 0, max = 8): Promise<RenderDemand> {
  const [queued, running] = await Promise.all([
    prisma.renderJob.count({ where: { status: 'queued' } }),
    prisma.renderJob.count({ where: { status: 'running' } }),
  ])
  return { queued, running, wanted: Math.max(min, Math.min(max, queued + running)) }
}

/** Finished jobs older than `days` are history nobody reads; drop them. */
export async function pruneFinished(days = 7): Promise<number> {
  const r = await prisma.renderJob.deleteMany({
    where: {
      status: { in: ['done', 'failed', 'cancelled'] },
      finishedAt: { lt: new Date(Date.now() - days * 86_400_000) },
    },
  })
  return r.count
}
