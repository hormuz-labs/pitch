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
const queueGetJob = videoQueue.getJob as ReturnType<typeof vi.fn>
const publish = connection.publish as ReturnType<typeof vi.fn>

const storyboard = {
  revision: 1,
  status: 'draft',
  transition: 'fade',
  scenes: [
    {
      id: 'scene-1',
      pageIndex: 0,
      previewUrl: 'https://cdn.example/page-1.png',
      enabled: true,
      narration: 'Original narration.',
      emphasis: [],
      estimatedDurationSec: 2,
    },
  ],
}

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

  it('queues uploaded PDF assets in planning mode before rendering', async () => {
    const parameters = {
      assets: [
        {
          url: 'https://cdn.example/report.pdf',
          name: 'report.pdf',
          type: 'application/pdf',
          size: 1234,
        },
      ],
      instructions: 'Explain the important results.',
    }

    const res = await request(buildApp()).post('/jobs').send({ parameters })

    expect(res.status).toBe(201)
    expect(createJob).toHaveBeenCalledWith(
      {
        userId: 'user_test',
        parameters: expect.objectContaining({ workflowStage: 'PLANNING' }),
      },
      { id: 'user_test' },
    )
    expect(queueAdd).toHaveBeenCalledWith(
      'generate-video',
      expect.objectContaining({
        jobId: 'job_1',
        mode: 'plan',
        parameters: expect.objectContaining({ workflowStage: 'PLANNING' }),
      }),
      { jobId: 'job_1' },
    )
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

describe('PATCH /jobs/:id/storyboard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    publish.mockResolvedValue(1)
    ;(db.getJob as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'job_1',
      userId: 'user_test',
      status: 'AWAITING_REVIEW',
      parameters: { workflowStage: 'AWAITING_REVIEW', storyboard },
    })
    updateJob.mockImplementation(async (_id, data) => ({
      id: 'job_1',
      userId: 'user_test',
      status: 'AWAITING_REVIEW',
      parameters: data.parameters,
    }))
  })

  it('saves an edited storyboard as the next revision', async () => {
    const res = await request(buildApp())
      .patch('/jobs/job_1/storyboard')
      .send({
        revision: 1,
        transition: 'slide',
        scenes: [{ ...storyboard.scenes[0], narration: 'Reviewed narration.' }],
      })

    expect(res.status).toBe(200)
    expect(res.body.parameters.storyboard).toMatchObject({
      revision: 2,
      status: 'draft',
      transition: 'slide',
      scenes: [{ narration: 'Reviewed narration.' }],
    })
    expect(updateJob).toHaveBeenCalledWith('job_1', {
      parameters: expect.objectContaining({
        workflowStage: 'AWAITING_REVIEW',
        storyboard: expect.objectContaining({ revision: 2 }),
      }),
    })
  })

  it('persists intro and outro choices with the storyboard revision', async () => {
    const titleCards = {
      intro: { enabled: true, title: 'Voter Guide', subtitle: '2026 edition' },
      outro: { enabled: false, title: '', subtitle: '' },
    }

    const res = await request(buildApp()).patch('/jobs/job_1/storyboard').send({
      revision: 1,
      scenes: storyboard.scenes,
      titleCards,
    })

    expect(res.status).toBe(200)
    expect(res.body.parameters.storyboard.titleCards).toEqual(titleCards)
  })

  it('does not mutate a storyboard after rendering has been queued', async () => {
    ;(db.getJob as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'job_1',
      userId: 'user_test',
      status: 'PENDING',
      parameters: { workflowStage: 'RENDER_QUEUED', storyboard },
    })

    const res = await request(buildApp())
      .patch('/jobs/job_1/storyboard')
      .send({ revision: 1, scenes: storyboard.scenes })

    expect(res.status).toBe(409)
    expect(updateJob).not.toHaveBeenCalled()
  })
})

describe('POST /jobs/:id/render', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    publish.mockResolvedValue(1)
    queueAdd.mockResolvedValue({})
    ;(db.getJob as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'job_1',
      userId: 'user_test',
      status: 'AWAITING_REVIEW',
      parameters: { workflowStage: 'AWAITING_REVIEW', storyboard },
    })
    updateJob.mockImplementation(async (_id, data) => ({
      id: 'job_1',
      userId: 'user_test',
      status: data.status,
      parameters: data.parameters,
    }))
  })

  it('approves the reviewed revision and requeues rendering without another charge', async () => {
    const res = await request(buildApp()).post('/jobs/job_1/render').send({ revision: 1 })

    expect(res.status).toBe(202)
    expect(res.body.parameters).toMatchObject({
      workflowStage: 'RENDER_QUEUED',
      storyboard: { status: 'approved', approvedRevision: 1 },
    })
    expect(queueAdd).toHaveBeenCalledWith(
      'generate-video',
      expect.objectContaining({
        jobId: 'job_1',
        userId: 'user_test',
        mode: 'render',
        parameters: expect.objectContaining({ workflowStage: 'RENDER_QUEUED' }),
      }),
      { jobId: 'job_1-render-r1' },
    )
    expect(deductCredit).not.toHaveBeenCalled()
  })

  it('returns the job to review when the render queue is unavailable', async () => {
    queueAdd.mockRejectedValue(new Error('redis unavailable'))

    const res = await request(buildApp()).post('/jobs/job_1/render').send({ revision: 1 })

    expect(res.status).toBe(503)
    expect(updateJob).toHaveBeenLastCalledWith('job_1', {
      status: 'AWAITING_REVIEW',
      parameters: expect.objectContaining({
        workflowStage: 'AWAITING_REVIEW',
        storyboard: expect.objectContaining({ status: 'draft', revision: 1 }),
      }),
    })
    expect(deductCredit).not.toHaveBeenCalled()
  })
})

describe('DELETE /jobs/:id', () => {
  it('removes a queued approved render job as well as the original planning job', async () => {
    vi.clearAllMocks()
    const removeOriginal = vi.fn().mockResolvedValue(undefined)
    const removeRender = vi.fn().mockResolvedValue(undefined)
    queueGetJob.mockImplementation(async (id: string) => {
      if (id === 'job_1') return { remove: removeOriginal }
      if (id === 'job_1-render-r4') return { remove: removeRender }
      return null
    })
    ;(db.getJob as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'job_1',
      userId: 'user_test',
      status: 'PENDING',
      parameters: {
        workflowStage: 'RENDER_QUEUED',
        storyboard: { ...storyboard, revision: 4, approvedRevision: 4, status: 'approved' },
      },
    })

    const res = await request(buildApp()).delete('/jobs/job_1')

    expect(res.status).toBe(204)
    expect(queueGetJob).toHaveBeenCalledWith('job_1')
    expect(queueGetJob).toHaveBeenCalledWith('job_1-render-r4')
    expect(removeOriginal).toHaveBeenCalledOnce()
    expect(removeRender).toHaveBeenCalledOnce()
    expect(db.deleteJob).toHaveBeenCalledWith('job_1', { id: 'user_test' })
  })
})
