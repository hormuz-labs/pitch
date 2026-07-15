import * as db from '@saas/db'
import { createLogger, JobStatus } from '@saas/shared'

const logger = createLogger('worker:guard')

/**
 * Duplicate-run guard for jobs requeued after a lost lock.
 *
 * When a worker process is frozen longer than BullMQ's lockDuration (laptop
 * sleep, a badly CPU-starved event loop under ffmpeg load), the job's Redis
 * lock expires and BullMQ's stalled checker moves the job back to the wait
 * list — while the original run is still in flight. That original run saves
 * its outcome directly to the DB (pushJobResult on success, the failure
 * handler on error), so by the time the requeued copy is picked up the job
 * usually already has a terminal status. Running it again would wipe
 * recordings/, spend the LLM budget a second time and re-send notifications
 * (and refund twice on failure).
 *
 * Returns true when the job is already COMPLETED or FAILED and the caller
 * must skip it. Cancelled jobs are stored as FAILED, so they are covered.
 * A genuinely crashed worker leaves the job in PROCESSING, so legitimate
 * stalled-job retries still proceed.
 */
export async function jobAlreadyTerminal(jobId: string): Promise<boolean> {
  try {
    const job = await db.prisma.job.findUnique({
      where: { id: jobId },
      select: { status: true },
    })
    if (job?.status === JobStatus.COMPLETED || job?.status === JobStatus.FAILED) {
      logger.info({ jobId, status: job.status }, 'Job already terminal — skipping duplicate run')
      return true
    }
  } catch (err) {
    logger.warn({ err, jobId }, 'Duplicate-run guard check failed — proceeding with job')
  }
  return false
}
