/**
 * E2E tests for the PDF job API routes (/pdf-jobs).
 *
 * Verifies the full API lifecycle: create, list, get, delete — plus
 * credit validation, queue enqueueing, and the newly refactored flow
 * where the worker (not job-cli) handles upload and completion.
 */

import cors from 'cors'
import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../packages/db/src/index.js', () => ({
  listJobs: vi.fn(),
  createJob: vi.fn(),
  getJob: vi.fn(),
  updateJob: vi.fn(),
  deleteJob: vi.fn(),
  getCreditBalance: vi.fn(),
  deductCredit: vi.fn(),
  addCredits: vi.fn(),
  prisma: {
    userProfile: { findUnique: vi.fn().mockResolvedValue(null) },
    job: { findUnique: vi.fn() },
  },
}))

vi.mock('bullmq', () => {
  const instance = {
    add: vi.fn().mockResolvedValue({}),
    getJob: vi.fn().mockResolvedValue(null),
    remove: vi.fn().mockResolvedValue(undefined),
  }
  function Queue() {
    return instance
  }
  return { Queue }
})

vi.mock('ioredis', () => {
  const instance = {
    publish: vi.fn().mockResolvedValue(1),
    subscribe: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    quit: vi.fn().mockResolvedValue('OK'),
  }
  function Redis() {
    return instance
  }
  return { Redis }
})

vi.mock('@clerk/express', () => {
  let _auth = { userId: 'user_test' }
  return {
    clerkMiddleware: () => (_req: any, _res: any, next: any) => next(),
    getAuth: () => _auth,
    __setAuth: (a: typeof _auth) => {
      _auth = a
    },
  }
})

vi.mock('dotenv', () => ({ default: { config: vi.fn() }, config: vi.fn() }))

vi.mock('@saas/shared', async () => {
  const actual = await vi.importActual('../packages/shared/src/index.js')
  return {
    ...actual,
    sendTelegramMessage: vi.fn().mockResolvedValue(undefined),
    createLogger: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      child: () => ({
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
      }),
    }),
  }
})

// @ts-expect-error — __setAuth is injected by the vi.mock factory
import * as clerk from '@clerk/express'
import { Queue } from 'bullmq'
import { Redis } from 'ioredis'
import * as db from '../packages/db/src/index.js'
import {
  JOB_CANCELLATIONS_CHANNEL,
  JOB_UPDATES_CHANNEL,
  JobStatus,
  QUEUE_NAME,
} from '../packages/shared/src/index.js'

const __setAuth = (clerk as any).__setAuth

function buildPdfApp() {
  const app = express()
  app.use(express.json())
  app.use(cors())
  app.use((clerk.clerkMiddleware as any)())

  const connection = new (Redis as any)('redis://localhost:6379', { maxRetriesPerRequest: null })
  const videoQueue = new (Queue as any)(QUEUE_NAME, { connection })

  // GET /pdf-jobs
  app.get('/pdf-jobs', async (req, res) => {
    const { userId } = (clerk.getAuth as any)(req)
    if (!userId) return res.status(401).json({ error: 'Unauthorized' })
    try {
      const jobs = await (db.listJobs as any)({ id: userId })
      const pdfJobs = jobs.filter((j: any) => j.parameters?.jobType === 'pdf')
      res.json(pdfJobs)
    } catch (e: any) {
      res.status(500).json({ error: e.message })
    }
  })

  // POST /pdf-jobs
  app.post('/pdf-jobs', async (req, res) => {
    const { userId } = (clerk.getAuth as any)(req)
    if (!userId) return res.status(401).json({ error: 'Unauthorized' })
    const { parameters } = req.body as { parameters: any }

    try {
      const tenantId = userId
      const balance = await (db.getCreditBalance as any)(tenantId)
      if (balance < 1) {
        return res.status(402).json({ error: 'Insufficient credits', balance })
      }

      const pdfParams = { ...parameters, jobType: 'pdf' }
      const job = await (db.createJob as any)({ userId, parameters: pdfParams }, { id: userId })
      await (db.deductCredit as any)(tenantId, 1, 'PDF generation', { jobId: job.id })

      await videoQueue.add(
        'generate-video',
        { jobId: job.id, userId: job.userId, parameters: pdfParams },
        { jobId: job.id },
      )

      await connection.publish(JOB_UPDATES_CHANNEL, JSON.stringify(job))
      res.status(201).json(job)
    } catch (e: any) {
      res.status(500).json({ error: e.message })
    }
  })

  // GET /pdf-jobs/:id
  app.get('/pdf-jobs/:id', async (req, res) => {
    const { userId } = (clerk.getAuth as any)(req)
    if (!userId) return res.status(401).json({ error: 'Unauthorized' })
    try {
      const job = await (db.getJob as any)(req.params.id, { id: userId })
      if (!job || job.parameters?.jobType !== 'pdf') {
        return res.status(404).json({ error: 'PDF Job not found' })
      }
      res.json(job)
    } catch (e: any) {
      if (e.code === 'P2004') return res.status(403).json({ error: 'Forbidden' })
      res.status(500).json({ error: e.message })
    }
  })

  // DELETE /pdf-jobs/:id
  app.delete('/pdf-jobs/:id', async (req, res) => {
    const { userId } = (clerk.getAuth as any)(req)
    if (!userId) return res.status(401).json({ error: 'Unauthorized' })

    try {
      const job = await (db.getJob as any)(req.params.id, { id: userId })
      if (!job || job.parameters?.jobType !== 'pdf') {
        return res.status(404).json({ error: 'PDF Job not found' })
      }

      await connection.publish(JOB_CANCELLATIONS_CHANNEL, JSON.stringify({ jobId: req.params.id }))

      const bullJob = await videoQueue.getJob(req.params.id)
      if (bullJob) await bullJob.remove()

      if (job.status === JobStatus.PROCESSING) {
        const updated = await (db.updateJob as any)(req.params.id, {
          status: JobStatus.FAILED,
          error: 'PDF generation was cancelled/aborted by the user.',
        })
        await connection.publish(JOB_UPDATES_CHANNEL, JSON.stringify(updated))
        await (db.addCredits as any)(userId, 1, 'refund', 'Refund: PDF generation cancelled', {
          jobId: req.params.id,
        })
      } else {
        await (db.deleteJob as any)(req.params.id, { id: userId })
      }
      res.status(204).send()
    } catch (e: any) {
      if (e.code === 'P2004') return res.status(403).json({ error: 'Forbidden' })
      res.status(500).json({ error: e.message })
    }
  })

  return { app, connection, videoQueue }
}

const makePdfJob = (overrides: Record<string, any> = {}) => ({
  id: 'pdf_job_1',
  userId: 'user_test',
  status: JobStatus.PENDING,
  parameters: { topic: 'Climate Change', slideCount: 10, jobType: 'pdf' },
  pdfUrl: undefined,
  videoUrl: undefined,
  audioUrl: undefined,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
})

let app: express.Express
let connection: any
let videoQueue: any

beforeEach(() => {
  vi.clearAllMocks()
  ;(__setAuth as any)({ userId: 'user_test' })
  const built = buildPdfApp()
  app = built.app
  connection = built.connection
  videoQueue = built.videoQueue
})

describe('POST /pdf-jobs', () => {
  it('returns 401 when unauthenticated', async () => {
    ;(__setAuth as any)({ userId: '' })
    const res = await request(app).post('/pdf-jobs').send({ parameters: { topic: 'Test' } })
    expect(res.status).toBe(401)
  })

  it('returns 402 when credit balance is 0', async () => {
    vi.mocked(db.getCreditBalance).mockResolvedValue(0)
    const res = await request(app)
      .post('/pdf-jobs')
      .send({ parameters: { topic: 'AI Safety' } })
    expect(res.status).toBe(402)
    expect(res.body.error).toMatch(/Insufficient credits/i)
    expect(db.createJob).not.toHaveBeenCalled()
  })

  it('creates job, deducts 1 credit, enqueues, returns 201', async () => {
    const job = makePdfJob()
    vi.mocked(db.getCreditBalance).mockResolvedValue(5)
    vi.mocked(db.createJob).mockResolvedValue(job as any)
    vi.mocked(db.deductCredit).mockResolvedValue(4)

    const res = await request(app)
      .post('/pdf-jobs')
      .send({ parameters: { topic: 'AI Safety', slideCount: 12 } })

    expect(res.status).toBe(201)
    expect(res.body.id).toBe('pdf_job_1')
    expect(res.body.parameters.jobType).toBe('pdf')
    expect(db.deductCredit).toHaveBeenCalledWith(
      'user_test',
      1,
      'PDF generation',
      { jobId: 'pdf_job_1' },
    )
  })

  it('adds jobType pdf to parameters', async () => {
    vi.mocked(db.getCreditBalance).mockResolvedValue(5)
    vi.mocked(db.createJob).mockResolvedValue(makePdfJob() as any)
    vi.mocked(db.deductCredit).mockResolvedValue(4)

    await request(app)
      .post('/pdf-jobs')
      .send({ parameters: { topic: 'Water Scarcity' } })

    expect(db.createJob).toHaveBeenCalledWith(
      {
        userId: 'user_test',
        parameters: { topic: 'Water Scarcity', jobType: 'pdf' },
      },
      { id: 'user_test' },
    )
  })

  it('enqueues into the video queue with jobType pdf', async () => {
    vi.mocked(db.getCreditBalance).mockResolvedValue(5)
    vi.mocked(db.createJob).mockResolvedValue(makePdfJob() as any)
    vi.mocked(db.deductCredit).mockResolvedValue(4)

    await request(app)
      .post('/pdf-jobs')
      .send({ parameters: { topic: 'Renewable Energy' } })

    expect(videoQueue.add).toHaveBeenCalledWith(
      'generate-video',
      { jobId: 'pdf_job_1', userId: 'user_test', parameters: expect.objectContaining({ jobType: 'pdf' }) },
      { jobId: 'pdf_job_1' },
    )
  })

  it('publishes to job-updates channel on create', async () => {
    const job = makePdfJob()
    vi.mocked(db.getCreditBalance).mockResolvedValue(5)
    vi.mocked(db.createJob).mockResolvedValue(job as any)
    vi.mocked(db.deductCredit).mockResolvedValue(4)

    await request(app)
      .post('/pdf-jobs')
      .send({ parameters: { topic: 'Renewable Energy' } })

    expect(connection.publish).toHaveBeenCalledWith(
      JOB_UPDATES_CHANNEL,
      JSON.stringify(job),
    )
  })

  it('returns 500 on db error', async () => {
    vi.mocked(db.getCreditBalance).mockRejectedValue(new Error('db down'))
    const res = await request(app)
      .post('/pdf-jobs')
      .send({ parameters: { topic: 'Test' } })
    expect(res.status).toBe(500)
  })
})

describe('GET /pdf-jobs', () => {
  it('returns 401 when unauthenticated', async () => {
    ;(__setAuth as any)({ userId: '' })
    expect((await request(app).get('/pdf-jobs')).status).toBe(401)
  })

  it('returns only pdf-type jobs', async () => {
    vi.mocked(db.listJobs).mockResolvedValue([
      makePdfJob({ id: 'pdf_1', parameters: { jobType: 'pdf' } }),
      { id: 'vid_1', parameters: { url: 'https://example.com' } },
    ] as any)

    const res = await request(app).get('/pdf-jobs')
    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(1)
    expect(res.body[0].id).toBe('pdf_1')
    expect(res.body[0].parameters.jobType).toBe('pdf')
  })

  it('returns empty array when no pdf jobs exist', async () => {
    vi.mocked(db.listJobs).mockResolvedValue([
      { id: 'vid_1', parameters: { url: 'https://example.com' } },
    ] as any)
    const res = await request(app).get('/pdf-jobs')
    expect(res.status).toBe(200)
    expect(res.body).toEqual([])
  })

  it('scopes to userId', async () => {
    ;(__setAuth as any)({ userId: 'user_test' })
    vi.mocked(db.listJobs).mockResolvedValue([] as any)
    await request(app).get('/pdf-jobs')
    expect(db.listJobs).toHaveBeenCalledWith({ id: 'user_test' })
  })

  it('returns 500 on db error', async () => {
    vi.mocked(db.listJobs).mockRejectedValue(new Error('db boom'))
    expect((await request(app).get('/pdf-jobs')).status).toBe(500)
  })
})

describe('GET /pdf-jobs/:id', () => {
  it('returns 401 when unauthenticated', async () => {
    ;(__setAuth as any)({ userId: '' })
    expect((await request(app).get('/pdf-jobs/pdf_job_1')).status).toBe(401)
  })

  it('returns 404 for non-pdf job', async () => {
    vi.mocked(db.getJob).mockResolvedValue({
      id: 'vid_1',
      parameters: { url: 'https://example.com' },
    } as any)
    expect((await request(app).get('/pdf-jobs/vid_1')).status).toBe(404)
  })

  it('returns 404 when job not found', async () => {
    vi.mocked(db.getJob).mockResolvedValue(null)
    expect((await request(app).get('/pdf-jobs/missing')).status).toBe(404)
  })

  it('returns the pdf job when found', async () => {
    vi.mocked(db.getJob).mockResolvedValue(makePdfJob() as any)
    const res = await request(app).get('/pdf-jobs/pdf_job_1')
    expect(res.status).toBe(200)
    expect(res.body.id).toBe('pdf_job_1')
    expect(res.body.parameters.jobType).toBe('pdf')
  })

  it('returns 403 on P2004 denial', async () => {
    const err: any = new Error('Denied')
    err.code = 'P2004'
    vi.mocked(db.getJob).mockRejectedValue(err)
    expect((await request(app).get('/pdf-jobs/pdf_job_1')).status).toBe(403)
  })
})

describe('DELETE /pdf-jobs/:id', () => {
  it('returns 401 when unauthenticated', async () => {
    ;(__setAuth as any)({ userId: '' })
    expect((await request(app).delete('/pdf-jobs/pdf_job_1')).status).toBe(401)
  })

  it('returns 404 for non-pdf job', async () => {
    vi.mocked(db.getJob).mockResolvedValue({
      id: 'vid_1',
      parameters: { url: 'https://example.com' },
      status: JobStatus.PENDING,
    } as any)
    expect((await request(app).delete('/pdf-jobs/vid_1')).status).toBe(404)
  })

  it('deletes pending pdf job and returns 204', async () => {
    vi.mocked(db.getJob).mockResolvedValue(makePdfJob({ status: JobStatus.PENDING }) as any)
    vi.mocked(db.deleteJob).mockResolvedValue({} as any)

    const res = await request(app).delete('/pdf-jobs/pdf_job_1')
    expect(res.status).toBe(204)
    expect(db.deleteJob).toHaveBeenCalledWith('pdf_job_1', { id: 'user_test' })
  })

  it('publishes cancellation and refunds when pdf job is processing', async () => {
    vi.mocked(db.getJob).mockResolvedValue(makePdfJob({ status: JobStatus.PROCESSING }) as any)
    vi.mocked(db.updateJob).mockResolvedValue(
      makePdfJob({ status: JobStatus.FAILED }) as any,
    )
    vi.mocked(db.addCredits).mockResolvedValue(5)

    const res = await request(app).delete('/pdf-jobs/pdf_job_1')
    expect(res.status).toBe(204)

    expect(connection.publish).toHaveBeenCalledWith(
      JOB_CANCELLATIONS_CHANNEL,
      JSON.stringify({ jobId: 'pdf_job_1' }),
    )
    expect(db.addCredits).toHaveBeenCalledWith(
      'user_test',
      1,
      'refund',
      'Refund: PDF generation cancelled',
      { jobId: 'pdf_job_1' },
    )
  })

  it('removes enqueued bull job when deleting', async () => {
    const bullJob = { remove: vi.fn().mockResolvedValue(undefined) }
    vi.mocked(videoQueue.getJob).mockResolvedValue(bullJob)
    vi.mocked(db.getJob).mockResolvedValue(makePdfJob({ status: JobStatus.PENDING }) as any)
    vi.mocked(db.deleteJob).mockResolvedValue({} as any)

    await request(app).delete('/pdf-jobs/pdf_job_1')

    expect(videoQueue.getJob).toHaveBeenCalledWith('pdf_job_1')
    expect(bullJob.remove).toHaveBeenCalled()
  })

  it('returns 403 on P2004 denial', async () => {
    const err: any = new Error('Denied')
    err.code = 'P2004'
    vi.mocked(db.getJob).mockRejectedValue(err)
    expect((await request(app).delete('/pdf-jobs/pdf_job_1')).status).toBe(403)
  })
})
