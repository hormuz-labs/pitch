/**
 * Dev harness: enqueue an AI demo-video job directly, without going through
 * the API (skips Clerk auth + credit deduction so the pipeline can be
 * smoke-tested locally). The queue payload mirrors
 * apps/api/src/routes/jobs.ts exactly, so the running worker processes it
 * identically to a real /new submission.
 *
 * Usage:
 *   bun scripts/e2e-demo-job.ts <userId> [url] [instructions]
 */
import path from 'node:path'
import * as db from '@saas/db'
import { QUEUE_NAME } from '@saas/shared'
import { Queue } from 'bullmq'
import dotenv from 'dotenv'
import IORedis from 'ioredis'

dotenv.config({ path: path.resolve(import.meta.dir, '..', '.env') })

const [, , userId, url = 'https://www.wikipedia.org/', instructions] = process.argv
if (!userId) {
  console.error('usage: bun scripts/e2e-demo-job.ts <userId> [url] [instructions]')
  process.exit(1)
}

const parameters = {
  url,
  instructions:
    instructions ||
    'goto wikipedia and search for india, then goto another section of your choice and conclude the video',
  voice: 'Puck',
  subtitles: false,
  theme: 'light',
  background: 'aurora',
  shape: 'rounded',
  inset: '0.94',
}

const job = await db.createJob({ userId, parameters }, { id: userId })
console.log('created job:', job.id)

const connection = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
})
const queue = new Queue(QUEUE_NAME, { connection })
await queue.add(
  'generate-video',
  { jobId: job.id, userId: job.userId, parameters },
  { jobId: job.id },
)
console.log('enqueued to', QUEUE_NAME, '— watch the worker log for progress')
await queue.close()
await connection.quit()
process.exit(0)
