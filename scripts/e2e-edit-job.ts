/**
 * Dev harness: enqueue an edit-recording job directly, without going through
 * the API (skips Clerk auth + credit deduction so the pipeline can be
 * smoke-tested locally). The queue payload mirrors
 * apps/api/src/routes/edit-jobs.ts exactly, so the running worker processes it
 * identically to a real upload.
 *
 * The input must be reachable over http(s) — the worker downloads it. For a
 * local file: `python3 -m http.server 8899 --directory recordings` then pass
 * http://localhost:8899/<file>.
 *
 * Usage:
 *   bun scripts/e2e-edit-job.ts <userId> <inputFileUrl> [originalFileName]
 */
import path from 'node:path'
import * as db from '@saas/db'
import { EDIT_QUEUE_NAME } from '@saas/shared'
import { Queue } from 'bullmq'
import dotenv from 'dotenv'
import IORedis from 'ioredis'

dotenv.config({ path: path.resolve(import.meta.dir, '..', '.env') })

const [, , userId, inputFileUrl, originalFileName = 'recording.mp4'] = process.argv
if (!userId || !inputFileUrl) {
  console.error('usage: bun scripts/e2e-edit-job.ts <userId> <inputFileUrl> [originalFileName]')
  process.exit(1)
}

const parameters = {
  jobType: 'edit-recording',
  inputFileUrl,
  originalFileName,
  productName: 'YouTube Search',
  productUrl: 'https://youtube.com',
  instructions: 'Keep it short and punchy.',
  url: 'https://youtube.com',
}

const job = await db.createJob({ userId, parameters }, { id: userId })
console.log('created job:', job.id)

const connection = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
})
const queue = new Queue(EDIT_QUEUE_NAME, { connection })
await queue.add(
  'edit-recording',
  { jobId: job.id, userId: job.userId, parameters },
  { jobId: job.id },
)
console.log('enqueued to', EDIT_QUEUE_NAME, '— watch the worker log for progress')
await queue.close()
await connection.quit()
process.exit(0)
