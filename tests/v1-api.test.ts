/**
 * Unit tests for the public REST API (apps/api/src/routes/v1.ts), mounted the
 * way apps/api/src/index.ts mounts it.
 *
 * Mocks-only, so the suite needs no database, queue, or object storage. As in
 * tests/mcp.test.ts, @saas/db is mocked at its RESOLVED path
 * (../packages/db/src/index.js) because tsconfig paths route the workspace
 * specifier there, and the auth middleware must see the same mocked module.
 *
 * What these tests protect:
 *   - the key resolves to its owner, and every failure mode is one 401 shape
 *   - the documented error envelope { error: { code, message } } stays stable
 *   - the credit gate turns into 402 without creating a job
 *   - job serialization never leaks internals (userId, workerId, parameters)
 *   - /v1/pricing stays public and stays in step with the pricing helper
 */

import { createHash } from 'node:crypto'
import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// ── vi.mock factories must be self-contained (hoisting rule) ─────────────────

vi.mock('../packages/db/src/index.js', () => ({
  findApiKeyByHash: vi.fn(),
  touchApiKey: vi.fn(),
  getJob: vi.fn(),
  listJobs: vi.fn(),
  getCreditSummary: vi.fn(),
}))

// v1.ts does `error instanceof InsufficientCreditsError`, so the mock has to
// export a REAL class with stable identity.
vi.mock('../apps/api/src/lib/job-service.js', () => {
  class InsufficientCreditsError extends Error {
    balance: number
    constructor(balance: number) {
      super(`Insufficient credits (balance: ${balance})`)
      this.name = 'InsufficientCreditsError'
      this.balance = balance
    }
  }
  return {
    InsufficientCreditsError,
    createDemoVideoJob: vi.fn(),
    createLaunchVideoJob: vi.fn(),
    createPdfJob: vi.fn(),
    createEnhanceJob: vi.fn(),
    createEditJob: vi.fn(),
  }
})

vi.mock('../apps/api/src/lib/launch-video/projects.js', () => ({
  getProject: vi.fn(),
  listProjects: vi.fn(),
}))

vi.mock('@clerk/express', () => ({
  clerkMiddleware: () => (_req: any, _res: any, next: any) => next(),
  getAuth: () => ({ userId: null }),
}))

import * as jobService from '../apps/api/src/lib/job-service.js'
import { InsufficientCreditsError } from '../apps/api/src/lib/job-service.js'
import * as projects from '../apps/api/src/lib/launch-video/projects.js'
import { router as v1Routes } from '../apps/api/src/routes/v1.js'
import * as db from '../packages/db/src/index.js'

const findApiKeyByHash = db.findApiKeyByHash as ReturnType<typeof vi.fn>
const touchApiKey = db.touchApiKey as ReturnType<typeof vi.fn>
const getJob = db.getJob as ReturnType<typeof vi.fn>
const listJobs = db.listJobs as ReturnType<typeof vi.fn>
const getCreditSummary = db.getCreditSummary as ReturnType<typeof vi.fn>
const createDemoVideoJob = jobService.createDemoVideoJob as ReturnType<typeof vi.fn>
const createLaunchVideoJob = jobService.createLaunchVideoJob as ReturnType<typeof vi.fn>
const createPdfJob = jobService.createPdfJob as ReturnType<typeof vi.fn>
const createEnhanceJob = jobService.createEnhanceJob as ReturnType<typeof vi.fn>
const createEditJob = jobService.createEditJob as ReturnType<typeof vi.fn>
const getProject = projects.getProject as ReturnType<typeof vi.fn>
const listProjects = projects.listProjects as ReturnType<typeof vi.fn>

// ── Fixtures ─────────────────────────────────────────────────────────────────

const KEY = 'pk_test-key'
const KEY_HASH = createHash('sha256').update(KEY).digest('hex')
const KEY_ROW = { id: 'k1', userId: 'user_v1', revokedAt: null }

const jobRow = (over: Record<string, any> = {}) => ({
  id: 'job_1',
  userId: 'user_v1',
  status: 'PENDING',
  parameters: {},
  phases: [],
  progress: 0,
  cost: 0,
  createdAt: '2026-09-02T10:00:00.000Z',
  updatedAt: '2026-09-02T10:00:00.000Z',
  ...over,
})

function buildApp() {
  const app = express()
  app.use('/v1', express.json({ limit: '750mb' }), v1Routes)
  return app
}

let app: express.Express

beforeEach(() => {
  vi.clearAllMocks()
  findApiKeyByHash.mockImplementation(async (hash: string) =>
    hash === KEY_HASH ? { ...KEY_ROW } : null,
  )
  touchApiKey.mockResolvedValue(undefined)
  app = buildApp()
})

const auth = (r: request.Test) => r.set('Authorization', `Bearer ${KEY}`)

// ── Authentication ───────────────────────────────────────────────────────────

describe('authentication', () => {
  it('rejects a request with no key', async () => {
    const res = await request(app).get('/v1/jobs')
    expect(res.status).toBe(401)
    expect(res.body).toEqual({
      error: { code: 'unauthorized', message: 'Invalid or revoked API key' },
    })
  })

  it('rejects an unknown key', async () => {
    const res = await request(app).get('/v1/jobs').set('Authorization', 'Bearer pk_nope')
    expect(res.status).toBe(401)
    expect(res.body.error.code).toBe('unauthorized')
  })

  it('rejects a revoked key', async () => {
    findApiKeyByHash.mockResolvedValue({ ...KEY_ROW, revokedAt: new Date().toISOString() })
    const res = await auth(request(app).get('/v1/jobs'))
    expect(res.status).toBe(401)
  })

  it('accepts the x-api-key header as a fallback', async () => {
    listJobs.mockResolvedValue([])
    const res = await request(app).get('/v1/jobs').set('x-api-key', KEY)
    expect(res.status).toBe(200)
  })

  it('prefers Authorization when both headers are present', async () => {
    listJobs.mockResolvedValue([])
    const res = await request(app)
      .get('/v1/jobs')
      .set('Authorization', `Bearer ${KEY}`)
      .set('x-api-key', 'pk_wrong')
    expect(res.status).toBe(200)
  })

  it('scopes every read to the key owner', async () => {
    listJobs.mockResolvedValue([])
    await auth(request(app).get('/v1/jobs'))
    expect(listJobs).toHaveBeenCalledWith({ id: 'user_v1' })
  })

  it('records that the key was used', async () => {
    listJobs.mockResolvedValue([])
    await auth(request(app).get('/v1/jobs'))
    expect(touchApiKey).toHaveBeenCalledWith('k1')
  })
})

// ── Pricing (public) ─────────────────────────────────────────────────────────

describe('GET /v1/pricing', () => {
  it('is reachable without a key', async () => {
    const res = await request(app).get('/v1/pricing')
    expect(res.status).toBe(200)
  })

  it('matches the credit costs the docs quote', async () => {
    const res = await request(app).get('/v1/pricing')
    expect(res.body).toMatchObject({
      video: 3,
      deck: 1,
      'deck.enhance': 1,
      'recording.edit': 2,
      launch_video: {
        default: 9,
        byResolution: {
          '720p': { narrated: 6, musicOnly: 5 },
          '1080p': { narrated: 9, musicOnly: 8 },
          '4k': { narrated: 13, musicOnly: 12 },
        },
      },
    })
  })
})

// ── Create: demo video ───────────────────────────────────────────────────────

describe('POST /v1/videos', () => {
  it('queues a job and answers 202', async () => {
    createDemoVideoJob.mockResolvedValue(jobRow({ id: 'job_video' }))

    const res = await auth(request(app).post('/v1/videos')).send({
      url: 'https://trypitch.co',
      instructions: 'Keep it under 60 seconds.',
    })

    expect(res.status).toBe(202)
    expect(res.body).toMatchObject({ id: 'job_video', type: 'video', status: 'PENDING' })
    expect(createDemoVideoJob).toHaveBeenCalledWith('user_v1', {
      url: 'https://trypitch.co',
      instructions: 'Keep it under 60 seconds.',
    })
  })

  it('rejects a missing url without touching the job service', async () => {
    const res = await auth(request(app).post('/v1/videos')).send({})
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('invalid_request')
    expect(res.body.error.message).toContain('url')
    expect(createDemoVideoJob).not.toHaveBeenCalled()
  })

  it('rejects a url that is not a url', async () => {
    const res = await auth(request(app).post('/v1/videos')).send({ url: 'not-a-url' })
    expect(res.status).toBe(400)
    expect(createDemoVideoJob).not.toHaveBeenCalled()
  })

  it('turns an insufficient balance into 402 with the balance attached', async () => {
    createDemoVideoJob.mockRejectedValue(new InsufficientCreditsError(1))

    const res = await auth(request(app).post('/v1/videos')).send({ url: 'https://trypitch.co' })

    expect(res.status).toBe(402)
    expect(res.body.error.code).toBe('insufficient_credits')
    expect(res.body.error.balance).toBe(1)
  })

  it('never leaks internal job fields', async () => {
    createDemoVideoJob.mockResolvedValue(
      jobRow({
        workerId: 'worker-7',
        gitHash: 'abc123',
        parameters: { url: 'https://trypitch.co', internalFlag: true },
      }),
    )

    const res = await auth(request(app).post('/v1/videos')).send({ url: 'https://trypitch.co' })

    expect(res.body).not.toHaveProperty('userId')
    expect(res.body).not.toHaveProperty('workerId')
    expect(res.body).not.toHaveProperty('gitHash')
    expect(res.body).not.toHaveProperty('parameters')
  })
})

// ── Create: launch video ─────────────────────────────────────────────────────

describe('POST /v1/launch-videos', () => {
  it('defaults narration to true and leaves resolution to the service', async () => {
    createLaunchVideoJob.mockResolvedValue(
      jobRow({ id: 'job_launch', parameters: { jobType: 'launch-video' } }),
    )

    const res = await auth(request(app).post('/v1/launch-videos')).send({
      name: 'acme-launch',
      prompt: 'A 60 second launch film.',
    })

    expect(res.status).toBe(202)
    expect(res.body.type).toBe('launch_video')
    expect(createLaunchVideoJob).toHaveBeenCalledWith(
      'user_v1',
      'acme-launch',
      'A 60 second launch film.',
      undefined,
      undefined,
      true,
    )
  })

  it('forwards resolution and narration', async () => {
    createLaunchVideoJob.mockResolvedValue(jobRow({ parameters: { jobType: 'launch-video' } }))

    await auth(request(app).post('/v1/launch-videos')).send({
      name: 'acme-launch',
      prompt: 'Teaser.',
      music: 'sunset.mp3',
      resolution: '720p',
      narration: false,
    })

    expect(createLaunchVideoJob).toHaveBeenCalledWith(
      'user_v1',
      'acme-launch',
      'Teaser.',
      'sunset.mp3',
      '720p',
      false,
    )
  })

  it('rejects an unknown resolution rather than charging the default tier', async () => {
    const res = await auth(request(app).post('/v1/launch-videos')).send({
      name: 'acme-launch',
      prompt: 'Teaser.',
      resolution: '8k',
    })

    expect(res.status).toBe(400)
    expect(createLaunchVideoJob).not.toHaveBeenCalled()
  })

  // Project names become directory names on disk.
  it.each(['../escape', 'a/b', 'a\\b', '.hidden', '.', '..'])(
    'rejects the traversal-prone name %j',
    async name => {
      const res = await auth(request(app).post('/v1/launch-videos')).send({
        name,
        prompt: 'Anything.',
      })
      expect(res.status).toBe(400)
      expect(createLaunchVideoJob).not.toHaveBeenCalled()
    },
  )
})

// ── Create: decks and recordings ─────────────────────────────────────────────

describe('POST /v1/decks', () => {
  it('queues a deck job', async () => {
    createPdfJob.mockResolvedValue(jobRow({ id: 'job_deck', parameters: { jobType: 'pdf' } }))

    const res = await auth(request(app).post('/v1/decks')).send({ topic: 'Seed round deck' })

    expect(res.status).toBe(202)
    expect(res.body.type).toBe('deck')
    expect(createPdfJob).toHaveBeenCalledWith('user_v1', { topic: 'Seed round deck' })
  })

  it('rejects an empty topic', async () => {
    const res = await auth(request(app).post('/v1/decks')).send({ topic: '' })
    expect(res.status).toBe(400)
    expect(createPdfJob).not.toHaveBeenCalled()
  })
})

describe('POST /v1/decks/enhance', () => {
  const pdf = Buffer.from('%PDF-1.7 fake').toString('base64')

  it('stages the upload and queues the job', async () => {
    createEnhanceJob.mockResolvedValue(
      jobRow({ id: 'job_enh', parameters: { jobType: 'enhance' } }),
    )

    const res = await auth(request(app).post('/v1/decks/enhance')).send({
      fileBase64: pdf,
      fileName: 'deck.pdf',
    })

    expect(res.status).toBe(202)
    expect(res.body.type).toBe('deck.enhance')
    expect(createEnhanceJob).toHaveBeenCalledWith(
      'user_v1',
      expect.objectContaining({
        originalFileName: 'deck.pdf',
        mode: 'recreate',
        tmpFilePath: expect.stringMatching(/\.pdf$/),
      }),
    )
  })

  it('rejects a file type it cannot open', async () => {
    const res = await auth(request(app).post('/v1/decks/enhance')).send({
      fileBase64: pdf,
      fileName: 'deck.key',
    })

    expect(res.status).toBe(415)
    expect(res.body.error.code).toBe('unsupported_media_type')
    expect(createEnhanceJob).not.toHaveBeenCalled()
  })

  it('rejects a file over the size limit', async () => {
    const tooBig = Buffer.alloc(51 * 1024 * 1024).toString('base64')

    const res = await auth(request(app).post('/v1/decks/enhance')).send({
      fileBase64: tooBig,
      fileName: 'deck.pdf',
    })

    expect(res.status).toBe(413)
    expect(res.body.error.code).toBe('payload_too_large')
    expect(createEnhanceJob).not.toHaveBeenCalled()
  })
})

describe('POST /v1/recordings/edit', () => {
  it('queues an edit job', async () => {
    createEditJob.mockResolvedValue(
      jobRow({ id: 'job_edit', parameters: { jobType: 'edit-recording' } }),
    )

    const res = await auth(request(app).post('/v1/recordings/edit')).send({
      fileBase64: Buffer.from('fake mp4').toString('base64'),
      fileName: 'recording.mp4',
      productName: 'Acme',
    })

    expect(res.status).toBe(202)
    expect(res.body.type).toBe('recording.edit')
    expect(createEditJob).toHaveBeenCalledWith(
      'user_v1',
      expect.objectContaining({ originalFileName: 'recording.mp4', productName: 'Acme' }),
    )
  })

  it('rejects a document pretending to be a recording', async () => {
    const res = await auth(request(app).post('/v1/recordings/edit')).send({
      fileBase64: Buffer.from('x').toString('base64'),
      fileName: 'notes.pdf',
    })
    expect(res.status).toBe(415)
  })
})

// ── Reads ────────────────────────────────────────────────────────────────────

describe('GET /v1/jobs', () => {
  const jobs = [
    jobRow({ id: 'a', parameters: {} }),
    jobRow({ id: 'b', parameters: { jobType: 'pdf' } }),
    jobRow({ id: 'c', parameters: { jobType: 'launch-video' } }),
    jobRow({ id: 'd', parameters: { jobType: 'enhance' } }),
    jobRow({ id: 'e', parameters: { jobType: 'edit-recording' } }),
  ]

  it('returns every job with a total', async () => {
    listJobs.mockResolvedValue(jobs)
    const res = await auth(request(app).get('/v1/jobs'))
    expect(res.status).toBe(200)
    expect(res.body.total).toBe(5)
    expect(res.body.data).toHaveLength(5)
  })

  it.each([
    ['video', 'a'],
    ['deck', 'b'],
    ['launch_video', 'c'],
    ['deck.enhance', 'd'],
    ['recording.edit', 'e'],
  ])('filters type=%s down to the right job', async (type, expectedId) => {
    listJobs.mockResolvedValue(jobs)
    const res = await auth(request(app).get(`/v1/jobs?type=${type}`))
    expect(res.body.data.map((j: any) => j.id)).toEqual([expectedId])
  })

  it('rejects an unknown type instead of silently returning everything', async () => {
    listJobs.mockResolvedValue(jobs)
    const res = await auth(request(app).get('/v1/jobs?type=movie'))
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('invalid_request')
  })

  it('caps limit at 100', async () => {
    listJobs.mockResolvedValue(Array.from({ length: 150 }, (_, i) => jobRow({ id: `j${i}` })))
    const res = await auth(request(app).get('/v1/jobs?limit=500'))
    expect(res.body.data).toHaveLength(100)
    expect(res.body.total).toBe(150)
  })
})

describe('GET /v1/jobs/:id', () => {
  it('returns the documented job shape', async () => {
    getJob.mockResolvedValue(
      jobRow({
        id: 'job_done',
        status: 'COMPLETED',
        progress: 100,
        cost: 3,
        videoUrl: 'https://s3.trypitch.co/final.mp4',
        thumbnailUrl: 'https://s3.trypitch.co/thumb.jpg',
        shareSlug: 'abc123',
        phases: [{ phase: 'video_recording', label: 'Video Recording', status: 'completed' }],
      }),
    )

    const res = await auth(request(app).get('/v1/jobs/job_done'))

    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      id: 'job_done',
      type: 'video',
      status: 'COMPLETED',
      progress: 100,
      cost: 3,
      videoUrl: 'https://s3.trypitch.co/final.mp4',
      pdfUrl: null,
      thumbnailUrl: 'https://s3.trypitch.co/thumb.jpg',
      shareUrl: expect.stringContaining('/d/abc123'),
      error: null,
      phases: [{ phase: 'video_recording', label: 'Video Recording', status: 'completed' }],
      createdAt: '2026-09-02T10:00:00.000Z',
      updatedAt: '2026-09-02T10:00:00.000Z',
    })
  })

  it('leaves shareUrl null when the job was never shared', async () => {
    getJob.mockResolvedValue(jobRow({ shareSlug: null }))
    const res = await auth(request(app).get('/v1/jobs/job_1'))
    expect(res.body.shareUrl).toBeNull()
  })

  it('surfaces a failed job as 200 with an error string', async () => {
    getJob.mockResolvedValue(jobRow({ status: 'FAILED', error: 'Navigation timed out' }))
    const res = await auth(request(app).get('/v1/jobs/job_1'))
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('FAILED')
    expect(res.body.error).toBe('Navigation timed out')
  })

  it('404s an unknown id', async () => {
    getJob.mockResolvedValue(null)
    const res = await auth(request(app).get('/v1/jobs/nope'))
    expect(res.status).toBe(404)
    expect(res.body.error.code).toBe('not_found')
  })

  it('asks the db for the job scoped to the key owner', async () => {
    getJob.mockResolvedValue(jobRow())
    await auth(request(app).get('/v1/jobs/job_1'))
    expect(getJob).toHaveBeenCalledWith('job_1', { id: 'user_v1' })
  })
})

describe('launch video projects', () => {
  it('lists projects for the key owner', async () => {
    listProjects.mockResolvedValue([
      { name: 'acme-launch', hasVideo: true, videoUrl: 'https://x/y.mp4', sceneCount: 5 },
    ])
    const res = await auth(request(app).get('/v1/launch-videos'))
    expect(res.status).toBe(200)
    expect(res.body.data).toHaveLength(1)
    expect(listProjects).toHaveBeenCalledWith('user_v1')
  })

  it('returns one project with its scenes', async () => {
    getProject.mockResolvedValue({
      name: 'acme-launch',
      hasVideo: true,
      videoUrl: 'https://x/y.mp4',
      sceneCount: 1,
      duration: 6.2,
      scenes: [{ id: 's1', index: 1, start: 0, end: 6.2, dur: 6.2, vo: 'Hi.', draftUrl: null }],
    })
    const res = await auth(request(app).get('/v1/launch-videos/acme-launch'))
    expect(res.status).toBe(200)
    expect(res.body.scenes).toHaveLength(1)
  })

  it('404s a project that does not exist', async () => {
    getProject.mockResolvedValue(null)
    const res = await auth(request(app).get('/v1/launch-videos/ghost'))
    expect(res.status).toBe(404)
  })

  it('rejects a traversal-prone project name', async () => {
    const res = await auth(request(app).get('/v1/launch-videos/.hidden'))
    expect(res.status).toBe(400)
    expect(getProject).not.toHaveBeenCalled()
  })
})

describe('GET /v1/credits', () => {
  it('returns balance, plan, and a trimmed ledger', async () => {
    getCreditSummary.mockResolvedValue({
      balance: 42,
      activeSubscription: { planKey: 'pro' },
      subscriptions: [{ secret: true }],
      topUps: [{ secret: true }],
      transactions: Array.from({ length: 50 }, (_, i) => ({ amount: -1, id: i })),
    })

    const res = await auth(request(app).get('/v1/credits'))

    expect(res.status).toBe(200)
    expect(res.body.balance).toBe(42)
    expect(res.body.plan).toBe('pro')
    expect(res.body.transactions).toHaveLength(20)
    // The full summary carries subscription and top-up history; the API does not.
    expect(res.body).not.toHaveProperty('subscriptions')
    expect(res.body).not.toHaveProperty('topUps')
  })

  it('reports a null plan when there is no subscription', async () => {
    getCreditSummary.mockResolvedValue({
      balance: 0,
      activeSubscription: null,
      transactions: [],
    })
    const res = await auth(request(app).get('/v1/credits'))
    expect(res.body.plan).toBeNull()
  })
})

// ── Unexpected failures ──────────────────────────────────────────────────────

describe('internal errors', () => {
  it('maps an unexpected throw to 500 without leaking the message', async () => {
    listJobs.mockRejectedValue(new Error('connect ECONNREFUSED 10.0.0.4:5432'))

    const res = await auth(request(app).get('/v1/jobs'))

    expect(res.status).toBe(500)
    expect(res.body.error.code).toBe('internal_error')
    expect(res.body.error.message).not.toContain('ECONNREFUSED')
  })
})
