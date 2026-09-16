/**
 * Placement: which worker owns a project.
 *
 * A lease is three columns on the Project row — workerId, workerEpoch,
 * leasedAt — and it is valid while that worker's heartbeat is fresh and its
 * epoch still matches. Nothing else is needed: every API replica runs the
 * same query against the same table and reaches the same owner, and a dead
 * worker is detected by whoever next touches one of its projects, not by a
 * monitor.
 *
 * Taking a lease is one short transaction that locks the project row and the
 * live worker rows, so two replicas placing the same project at the same
 * moment cannot both win, and a worker cannot be handed more projects than
 * it has slots by two placements that did not see each other.
 */
import { prisma } from '@saas/db'
import { createLogger } from '@saas/shared'
import { type RenderDemand, renderDemand } from '../renderer/queue.js'
import { LEASE_TTL_MS, SCALE_GROUP, SCALE_HEADROOM, WORKER_SLOTS } from './config.js'

const logger = createLogger('studio:lease')

export interface WorkerRow {
  id: string
  url: string
  slots: number
  epoch: number
  draining: boolean
  heartbeatAt: Date
}

export class NoWorkerError extends Error {
  status = 503
  code = 'NO_WORKER'
  constructor(message = 'Every studio worker is busy right now. Try again in a moment.') {
    super(message)
  }
}

export function isLive(w: Pick<WorkerRow, 'heartbeatAt'>, now = Date.now()): boolean {
  return now - new Date(w.heartbeatAt).getTime() < LEASE_TTL_MS
}

function liveSince(now = Date.now()): Date {
  return new Date(now - LEASE_TTL_MS)
}

export async function liveWorkers(): Promise<WorkerRow[]> {
  return prisma.studioWorker.findMany({ where: { heartbeatAt: { gt: liveSince() } } })
}

interface LeaseColumns {
  workerId: string | null
  workerEpoch: number | null
  lastWorkerId: string | null
}

/**
 * Pure choice, for tests: the candidate with a free slot, preferring the
 * one that last held the project (warm disk), else the first by id.
 *
 * First by id, not least loaded, on purpose: it packs projects onto the
 * lowest-numbered workers and leaves the highest empty, which is the one
 * an autoscaler removes (a StatefulSet scales down from the top ordinal).
 * Spreading would leave something on every worker and make every
 * scale-down cost a checkpoint and a cold restore. Ids compare naturally
 * so worker-10 comes after worker-9.
 */
export function pickWorker(
  workers: WorkerRow[],
  held: Map<string, number>,
  preferred: Array<string | null | undefined>,
  now = Date.now(),
): WorkerRow | null {
  const free = workers.filter(w => isLive(w, now) && !w.draining && (held.get(w.id) ?? 0) < w.slots)
  if (!free.length) return null
  for (const id of preferred) {
    const w = id ? free.find(c => c.id === id) : undefined
    if (w) return w
  }
  free.sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true }))
  return free[0]
}

/** The live owner of a project, or null when it is unowned. Lock-free. */
export async function ownerOf(projectId: string): Promise<WorkerRow | null> {
  const p = await prisma.project.findUnique({
    where: { id: projectId },
    select: { workerId: true, workerEpoch: true },
  })
  if (!p?.workerId) return null
  const w = await prisma.studioWorker.findUnique({ where: { id: p.workerId } })
  if (!w || w.epoch !== p.workerEpoch || !isLive(w)) return null
  return w
}

/**
 * The worker that owns the project, placing it if nobody does. Throws
 * NoWorkerError when every live worker is full or draining.
 */
export async function acquire(projectId: string): Promise<WorkerRow> {
  const current = await ownerOf(projectId)
  if (current) return current
  return prisma.$transaction(
    async tx => {
      const [lease] = await tx.$queryRaw<LeaseColumns[]>`
        SELECT "workerId", "workerEpoch", "lastWorkerId" FROM "Project" WHERE "id" = ${projectId} FOR UPDATE`
      if (!lease) throw Object.assign(new Error('Project not found'), { status: 404 })
      const since = liveSince()
      const workers = await tx.$queryRaw<WorkerRow[]>`
        SELECT "id", "url", "slots", "epoch", "draining", "heartbeatAt"
        FROM "StudioWorker" WHERE "heartbeatAt" > ${since} ORDER BY "id" FOR UPDATE`
      // Someone else may have placed it between our lock-free read and the lock.
      const owner = workers.find(w => w.id === lease.workerId && w.epoch === lease.workerEpoch)
      if (owner) return owner
      const counts = await tx.$queryRaw<Array<{ workerId: string; n: bigint }>>`
        SELECT p."workerId", count(*) AS n FROM "Project" p
        JOIN "StudioWorker" w ON w."id" = p."workerId" AND w."epoch" = p."workerEpoch"
        WHERE w."heartbeatAt" > ${since} GROUP BY p."workerId"`
      const held = new Map(counts.map(c => [c.workerId, Number(c.n)]))
      const chosen = pickWorker(workers, held, [lease.workerId, lease.lastWorkerId])
      if (!chosen) {
        logger.warn({ projectId, workers: workers.length }, 'no worker has a free slot')
        throw new NoWorkerError()
      }
      await tx.project.update({
        where: { id: projectId },
        data: {
          workerId: chosen.id,
          workerEpoch: chosen.epoch,
          leasedAt: new Date(),
          lastWorkerId: chosen.id,
        },
      })
      logger.info(
        { projectId, workerId: chosen.id, epoch: chosen.epoch, previous: lease.workerId },
        'project placed',
      )
      return chosen
    },
    { isolationLevel: 'ReadCommitted', timeout: 10_000 },
  )
}

/** Whether `workerId` at `epoch` still holds the lease — the fence every worker-side write checks. */
export async function stillOwned(
  projectId: string,
  workerId: string,
  epoch: number,
): Promise<boolean> {
  const n = await prisma.project.count({ where: { id: projectId, workerId, workerEpoch: epoch } })
  return n > 0
}

/** Give a project up (idle, draining). Only the holder can; returns whether it did. */
export async function release(
  projectId: string,
  workerId: string,
  epoch: number,
): Promise<boolean> {
  const n = await prisma.project.updateMany({
    where: { id: projectId, workerId, workerEpoch: epoch },
    data: {
      workerId: null,
      workerEpoch: null,
      leasedAt: null,
      lastWorkerId: workerId,
      busyAt: null,
    },
  })
  return n.count > 0
}

/** Project ids this worker+epoch holds according to the database. */
export async function leasedTo(workerId: string, epoch: number): Promise<string[]> {
  const rows = await prisma.project.findMany({
    where: { workerId, workerEpoch: epoch },
    select: { id: true },
  })
  return rows.map(r => r.id)
}

export interface FleetStatus {
  /** Live workers taking projects, elastic and fixed. */
  workers: number
  /** Their slots, all together. */
  slots: number
  /** Projects leased to any live worker, draining ones included. */
  held: number
  /** Elastic workers (ids under SCALE_GROUP) the fleet should have. */
  wanted: number
  /** The render tier: jobs waiting and running, and the pods it takes. */
  render: RenderDemand
}

/**
 * The numbers the autoscalers follow (GET /internal/scale). `wanted` is
 * demand, not utilisation: how many elastic workers of the usual size it
 * takes to hold what is leased right now and still keep SCALE_HEADROOM
 * slots free, after the slots of any fixed worker outside the scaled group
 * are used. Draining workers contribute their projects but not their
 * slots, so a worker on its way out is replaced before it is gone.
 * `render.wanted` is one render pod per job queued or running.
 */
export async function fleetStatus(): Promise<FleetStatus> {
  const since = liveSince()
  const [workers, [{ n }], render] = await Promise.all([
    prisma.studioWorker.findMany({ where: { heartbeatAt: { gt: since } } }),
    prisma.$queryRaw<Array<{ n: bigint }>>`
      SELECT count(*) AS n FROM "Project" p
      JOIN "StudioWorker" w ON w."id" = p."workerId" AND w."epoch" = p."workerEpoch"
      WHERE w."heartbeatAt" > ${since}`,
    renderDemand(),
  ])
  const taking = workers.filter(w => !w.draining)
  const elastic = taking.filter(w => w.id.startsWith(SCALE_GROUP))
  const fixedSlots = taking
    .filter(w => !w.id.startsWith(SCALE_GROUP))
    .reduce((sum, w) => sum + w.slots, 0)
  const perWorker = elastic.length ? Math.max(...elastic.map(w => w.slots)) : WORKER_SLOTS
  const held = Number(n)
  const demand = Math.max(0, held + SCALE_HEADROOM - fixedSlots)
  return {
    workers: taking.length,
    slots: taking.reduce((sum, w) => sum + w.slots, 0),
    held,
    wanted: Math.max(1, Math.ceil(demand / perWorker)),
    render,
  }
}
