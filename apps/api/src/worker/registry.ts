/**
 * This worker's row in StudioWorker: registered on boot with a fresh epoch,
 * kept alive by a heartbeat, and watched for the one condition that turns a
 * healthy process into a zombie — losing the database for longer than the
 * lease TTL, after which every other process is entitled to treat our
 * projects as abandoned and place them elsewhere.
 */
import { prisma } from '@saas/db'
import { createLogger } from '@saas/shared'
import { HEARTBEAT_MS, LEASE_TTL_MS, WORKER_ID, WORKER_SLOTS, WORKER_URL } from './config.js'

const logger = createLogger('studio:worker')

let epoch = 0
let stopHeartbeat: (() => void) | null = null

/** The epoch of this boot; 0 until registerWorker() has run. */
export function currentEpoch(): number {
  return epoch
}

/**
 * Insert or refresh our row. The epoch increments on every boot, so a lease
 * taken by the previous incarnation of this worker (whose sessions died with
 * it) no longer matches and is re-placed — usually straight back here, since
 * the disk is still warm.
 */
export async function registerWorker(): Promise<number> {
  const rows = await prisma.$queryRaw<Array<{ epoch: number }>>`
    INSERT INTO "StudioWorker" ("id", "url", "slots", "epoch", "draining", "version", "startedAt", "heartbeatAt")
    VALUES (${WORKER_ID}, ${WORKER_URL}, ${WORKER_SLOTS}, 1, false, ${process.env.GIT_HASH ?? null}, now(), now())
    ON CONFLICT ("id") DO UPDATE SET
      "url" = EXCLUDED."url",
      "slots" = EXCLUDED."slots",
      "epoch" = "StudioWorker"."epoch" + 1,
      "draining" = false,
      "version" = EXCLUDED."version",
      "startedAt" = now(),
      "heartbeatAt" = now()
    RETURNING "epoch"`
  epoch = Number(rows[0]?.epoch ?? 1)
  logger.info(
    { workerId: WORKER_ID, epoch, url: WORKER_URL, slots: WORKER_SLOTS },
    'worker registered',
  )
  return epoch
}

/**
 * Heartbeat until stopped. `onLost` fires once when we have been unable to
 * write a heartbeat for a whole lease TTL (the rest of the system now sees
 * us as dead) or when the row's epoch is no longer ours (another process
 * booted with our id). The caller drops every held project; when the
 * database comes back the heartbeat resumes on its own and new leases can
 * land here again.
 */
export function startHeartbeat(onLost: (reason: string) => void): void {
  if (stopHeartbeat) return
  let lastOk = Date.now()
  let lost = false
  const beat = async () => {
    try {
      const n = await prisma.studioWorker.updateMany({
        where: { id: WORKER_ID, epoch },
        data: { heartbeatAt: new Date() },
      })
      if (n.count === 0) {
        if (!lost) {
          lost = true
          onLost('another process registered with this worker id')
        }
        return
      }
      lastOk = Date.now()
      if (lost) {
        lost = false
        logger.info({ workerId: WORKER_ID }, 'heartbeat restored')
      }
    } catch (err) {
      if (!lost && Date.now() - lastOk > LEASE_TTL_MS) {
        lost = true
        logger.error({ err, workerId: WORKER_ID }, 'heartbeat lost for a full lease TTL')
        onLost('database unreachable for longer than the lease TTL')
      } else {
        logger.warn({ err, workerId: WORKER_ID }, 'heartbeat failed')
      }
    }
  }
  const timer = setInterval(() => void beat(), HEARTBEAT_MS)
  timer.unref()
  stopHeartbeat = () => clearInterval(timer)
}

export function stopWorkerHeartbeat(): void {
  stopHeartbeat?.()
  stopHeartbeat = null
}

/** Stop taking new projects; existing leases stay until released. */
export async function setDraining(draining: boolean): Promise<void> {
  await prisma.studioWorker
    .updateMany({ where: { id: WORKER_ID, epoch }, data: { draining } })
    .catch(err => logger.warn({ err }, 'could not update draining flag'))
}
