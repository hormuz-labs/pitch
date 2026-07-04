import { Queue } from 'bullmq'
import { Redis } from 'ioredis'
import { PrismaClient } from '@prisma/client'
import { QUEUE_NAME } from '@saas/shared'

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379'
const connection = new Redis(redisUrl, { maxRetriesPerRequest: null })
const videoQueue = new Queue(QUEUE_NAME, { connection: connection as any })
const prisma = new PrismaClient()

try {
  const job = await prisma.job.findUnique({ where: { id: 'cmr0fxxen0001ff32sv1g18ih' } })
  if (!job) { console.log('Job not found'); process.exit(1) }
  const parameters = JSON.parse(job.parameters)
  await videoQueue.add('generate-video', { jobId: job.id, userId: job.userId, parameters }, { jobId: job.id })
  console.log('Enqueued job cmr0fxxen0001ff32sv1g18ih to BullMQ')
} catch (e) {
  console.error('Failed:', e)
}
await connection.quit()
await prisma.$disconnect()
