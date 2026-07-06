/**
 * Tests for the job creation route (/jobs), in particular the rollback
 * path added after a real incident: a transient queue failure right after
 * the DB job + credit deduction committed left an orphaned PENDING job
 * that the worker would never pick up, silently keeping the spent credits.
 *
 * Mounts the REAL router from apps/api/src/routes/jobs.ts — only @saas/db,
 * the queue/redis config, and auth are mocked.
 */

import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@saas/db', () => ({
  getCreditBalance: vi.fn(),
  createJob: vi.fn(),
  deductCredit: vi.fn(),
  updateJob: vi.fn(),
  addCredits: vi.fn(),
  listJobs: vi.fn(),
  getJob: vi.fn(),
  deleteJob: vi.fn(),
  prisma: {
    userProfile: { findUnique: vi.fn().mockResolvedValue(null) },
  },
}))

vi.mock('../apps/api/src/config.js', () => ({
  connection: { publish: vi.fn().mockResolvedValue(1) },
  subscriber: { subscribe: vi.fn(), on: vi.fn(), off: vi.fn() },
  videoQueue: { add: vi.fn().mockResolvedValue({}), getJob: vi.fn() },
}))

vi.mock('../apps/api/src/middleware/auth.js', () => {
  let _userId: string | null = 'user_test'
  return {
    requireAuth: (_req: any, res: any) => {
      if (!_userId) {
        res.status(401).json({ error: 'Unauthorized' })
        return null
      }
      return _userId
    },
    __setUserId: (id: string | null) => {
      _userId = id
    },
  }
})

import * as db from '@saas/db'
import { connection, videoQueue } from '../apps/api/src/config.js'
import { router as jobRoutes } from '../apps/api/src/routes/jobs.js'

const getCreditBalance = db.getCreditBalance as ReturnType<typeof vi.fn>
const createJob = db.createJob as ReturnType<typeof vi.fn>
const deductCredit = db.deductCredit as ReturnType<typeof vi.fn>
const updateJob = db.updateJob as ReturnType<typeof vi.fn>
const addCredits = db.addCredits as ReturnType<typeof vi.fn>
const queueAdd = videoQueue.add as ReturnType<typeof vi.fn>
const publish = connection.publish as ReturnType<typeof vi.fn>

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use('/jobs', jobRoutes)
  return app
}

describe('POST /jobs', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getCreditBalance.mockResolvedValue(10)
    createJob.mockResolvedValue({ id: 'job_1', userId: 'user_test', status: 'PENDING' })
    deductCredit.mockResolvedValue(7)
    queueAdd.mockResolvedValue({})
    publish.mockResolvedValue(1)
  })

  it('creates, deducts credits, and enqueues on the happy path', async () => {
    const res = await request(buildApp())
      .post('/jobs')
      .send({ parameters: { url: 'https://example.com' } })

    expect(res.status).toBe(201)
    expect(res.body.id).toBe('job_1')
    expect(deductCredit).toHaveBeenCalledWith('user_test', 3, 'Video generation', {
      jobId: 'job_1',
    })
    expect(queueAdd).toHaveBeenCalledWith(
      'generate-video',
      { jobId: 'job_1', userId: 'user_test', parameters: { url: 'https://example.com' } },
      { jobId: 'job_1' },
    )
    expect(updateJob).not.toHaveBeenCalled()
    expect(addCredits).not.toHaveBeenCalled()
  })

  it('blocks with 402 when balance is insufficient, before any job is created', async () => {
    getCreditBalance.mockResolvedValue(2)
    const res = await request(buildApp())
      .post('/jobs')
      .send({ parameters: { url: 'https://example.com' } })

    expect(res.status).toBe(402)
    expect(createJob).not.toHaveBeenCalled()
    expect(deductCredit).not.toHaveBeenCalled()
  })

  it('rolls back (refund + mark FAILED) when enqueueing fails after the job/credit already committed', async () => {
    queueAdd.mockRejectedValue(new Error('redis unavailable'))

    const res = await request(buildApp())
      .post('/jobs')
      .send({ parameters: { url: 'https://example.com' } })

    expect(res.status).toBe(500)

    // The job row and credit deduction happen before enqueue, so they did commit —
    // the fix is that we must undo them rather than leave an orphaned PENDING job.
    expect(createJob).toHaveBeenCalledTimes(1)
    expect(deductCredit).toHaveBeenCalledTimes(1)

    expect(updateJob).toHaveBeenCalledWith('job_1', {
      status: 'FAILED',
      error: expect.stringContaining('redis unavailable'),
    })
    expect(addCredits).toHaveBeenCalledWith('user_test', 3, 'refund', expect.any(String), {
      jobId: 'job_1',
    })
  })

  it('also rolls back when the queue succeeds but the pub/sub publish fails', async () => {
    publish.mockRejectedValue(new Error('publish down'))

    const res = await request(buildApp())
      .post('/jobs')
      .send({ parameters: { url: 'https://example.com' } })

    expect(res.status).toBe(500)
    expect(updateJob).toHaveBeenCalledWith('job_1', {
      status: 'FAILED',
      error: expect.stringContaining('publish down'),
    })
    expect(addCredits).toHaveBeenCalledTimes(1)
  })
})
