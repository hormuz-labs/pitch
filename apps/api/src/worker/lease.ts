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
import { LEASE_TTL_MS } from './config.js'

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
 * one that last held the project (warm disk), else the least loaded.
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
  free.sort((a, b) => {
    const la = (held.get(a.id) ?? 0) / a.slots
    const lb = (held.get(b.id) ?? 0) / b.slots
    return la - lb || a.id.localeCompare(b.id)
  })
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
