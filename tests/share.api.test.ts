/**
 * Tests for the public-share routes added to apps/api/src/routes/jobs.ts:
 *   GET    /jobs/public/:slug   (unauthenticated)
 *   POST   /jobs/:id/share      (authenticated, owner-scoped)
 *   DELETE /jobs/:id/share      (authenticated, owner-scoped)
 *
 * Mounts the REAL router — only @saas/db, the queue/redis config, and auth
 * are mocked, same convention as jobs.api.test.ts.
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
  listVideoEditions: vi.fn(),
  getVideoEdition: vi.fn(),
  saveVideoEdition: vi.fn(),
  deleteJob: vi.fn(),
  getPublicJobBySlug: vi.fn(),
  incrementShareViews: vi.fn(),
  makeJobPublic: vi.fn(),
  unmakeJobPublic: vi.fn(),
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
import { __setUserId } from '../apps/api/src/middleware/auth.js'
import { router as jobRoutes } from '../apps/api/src/routes/jobs.js'

const getPublicJobBySlug = db.getPublicJobBySlug as ReturnType<typeof vi.fn>
const incrementShareViews = db.incrementShareViews as ReturnType<typeof vi.fn>
const makeJobPublic = db.makeJobPublic as ReturnType<typeof vi.fn>
const unmakeJobPublic = db.unmakeJobPublic as ReturnType<typeof vi.fn>
const getJob = db.getJob as ReturnType<typeof vi.fn>

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use('/jobs', jobRoutes)
  return app
}

const publicJobFields = {
  id: 'job_1',
  userId: 'owner_user', // deliberately present on the mock, must NOT leak into the response
  status: 'COMPLETED',
  videoUrl: 'https://cdn.example/video.mp4',
  thumbnailUrl: 'https://cdn.example/thumb.jpg',
  parameters: { url: 'https://zerith.studio' },
  cost: 1.23, // deliberately present, must NOT leak into the response
  createdAt: '2026-01-01T00:00:00.000Z',
}

beforeEach(() => {
  vi.clearAllMocks()
  __setUserId('user_test')
  incrementShareViews.mockResolvedValue(undefined)
})

describe('GET /jobs/public/:slug', () => {
  it('returns only the safe field subset for a public, completed job', async () => {
    getPublicJobBySlug.mockResolvedValue(publicJobFields)

    const app = buildApp()
    const res = await request(app).get('/jobs/public/some-slug')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      title: 'zerith.studio',
      videoUrl: 'https://cdn.example/video.mp4',
      thumbnailUrl: 'https://cdn.example/thumb.jpg',
      createdAt: '2026-01-01T00:00:00.000Z',
    })
    // The whole point of this endpoint: never leak internal/private fields.
    expect(res.body).not.toHaveProperty('userId')
    expect(res.body).not.toHaveProperty('cost')
    expect(res.body).not.toHaveProperty('parameters')
  })

  it('bumps the view counter on a successful load', async () => {
    getPublicJobBySlug.mockResolvedValue(publicJobFields)
    incrementShareViews.mockResolvedValue(undefined)

    await request(buildApp()).get('/jobs/public/some-slug')

    expect(incrementShareViews).toHaveBeenCalledWith('job_1')
  })

  it('404s when the slug does not exist', async () => {
    getPublicJobBySlug.mockResolvedValue(null)

    const res = await request(buildApp()).get('/jobs/public/nonexistent')

    expect(res.status).toBe(404)
    expect(incrementShareViews).not.toHaveBeenCalled()
  })

  it('404s when the job is not public (getPublicJobBySlug already enforces this, but confirm the route does not second-guess it into a leak)', async () => {
    getPublicJobBySlug.mockResolvedValue(null)

    const res = await request(buildApp()).get('/jobs/public/private-job-slug')

    expect(res.status).toBe(404)
  })

  it("404s when the job hasn't finished rendering yet", async () => {
    getPublicJobBySlug.mockResolvedValue({ ...publicJobFields, status: 'PROCESSING' })

    const res = await request(buildApp()).get('/jobs/public/in-progress-slug')

    expect(res.status).toBe(404)
    expect(incrementShareViews).not.toHaveBeenCalled()
  })

  it('404s when the job has no videoUrl', async () => {
    getPublicJobBySlug.mockResolvedValue({ ...publicJobFields, videoUrl: null })

    const res = await request(buildApp()).get('/jobs/public/no-video-slug')

    expect(res.status).toBe(404)
  })
})

describe('POST /jobs/:id/share', () => {
  it('shares the job and returns it', async () => {
    makeJobPublic.mockResolvedValue({ shareSlug: 'abc123' })
    getJob.mockResolvedValue({ id: 'job_1', isPublic: true, shareSlug: 'abc123' })

    const res = await request(buildApp()).post('/jobs/job_1/share')

    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ shareSlug: 'abc123' })
    expect(makeJobPublic).toHaveBeenCalledWith('job_1', { id: 'user_test' })
  })

  it('401s when unauthenticated', async () => {
    __setUserId(null)

    const res = await request(buildApp()).post('/jobs/job_1/share')

    expect(res.status).toBe(401)
    expect(makeJobPublic).not.toHaveBeenCalled()
  })

  it("404s when the job doesn't exist (or isn't owned by this user)", async () => {
    makeJobPublic.mockRejectedValue(new Error('Job not found'))

    const res = await request(buildApp()).post('/jobs/not-mine/share')

    expect(res.status).toBe(404)
  })
})

describe('DELETE /jobs/:id/share', () => {
  it('unshares the job', async () => {
    getJob.mockResolvedValue({ id: 'job_1', isPublic: true })
    unmakeJobPublic.mockResolvedValue(undefined)

    const res = await request(buildApp()).delete('/jobs/job_1/share')

    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ id: 'job_1', isPublic: false })
    expect(unmakeJobPublic).toHaveBeenCalledWith('job_1', { id: 'user_test' })
  })

  it('401s when unauthenticated', async () => {
    __setUserId(null)

    const res = await request(buildApp()).delete('/jobs/job_1/share')

    expect(res.status).toBe(401)
    expect(unmakeJobPublic).not.toHaveBeenCalled()
  })

  it("404s when the job doesn't exist (or isn't owned by this user)", async () => {
    getJob.mockResolvedValue(null)

    const res = await request(buildApp()).delete('/jobs/not-mine/share')

    expect(res.status).toBe(404)
    expect(unmakeJobPublic).not.toHaveBeenCalled()
  })
})
