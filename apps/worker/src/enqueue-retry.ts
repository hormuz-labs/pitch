import { Queue } from 'bullmq'
import { Redis } from 'ioredis'
import { PrismaClient } from '@prisma/client'
import { QUEUE_NAME } from '@saas/shared'

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379'
const connection = new Redis(redisUrl, { maxRetriesPerRequest: null })
const videoQueue = new Queue(QUEUE_NAME, { connection: connection as any })
const prisma = new PrismaClient()

const JOB_ID = 'cmr9obrb30005ffcg4rbrt42t'
// Re-enqueue after fixing BullMQ lock duration (10 min instead of 30s default)

try {
  const job = await prisma.job.findUnique({ where: { id: JOB_ID } })
  if (!job) { console.log('Job not found'); process.exit(1) }

  await prisma.job.update({ where: { id: JOB_ID }, data: { status: 'PENDING', error: null, workerId: null } })

  const parameters = JSON.parse(job.parameters)
  await videoQueue.add('generate-video', { jobId: job.id, userId: job.userId, parameters }, { jobId: job.id })
  console.log(`Enqueued job ${JOB_ID} to BullMQ`)
} catch (e) {
  console.error('Failed:', e)
}
await connection.quit()
await prisma.$disconnect()
