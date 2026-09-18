import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => ({
  createFromApi: vi.fn(),
  exportFromApi: vi.fn(),
  exportStatusFromApi: vi.fn(),
  getFromApi: vi.fn(),
  listFromApi: vi.fn(),
  pricing: vi.fn(() => ({ model: 'usage' })),
  promptFromApi: vi.fn(),
}))

vi.mock('../apps/api/src/lib/public-api.js', async () => {
  const { z } = await import('zod')
  return {
    ...api,
    createSchema: z.object({
      flow: z.enum(['launch-video', 'demo-video', 'deck', 'recording-edit']).optional(),
      prompt: z.string().default(''),
      options: z.record(z.string(), z.any()).optional(),
      uploads: z.array(z.object({ fileBase64: z.string(), fileName: z.string() })).optional(),
      name: z.string().optional(),
    }),
  }
})
vi.mock('../apps/api/src/middleware/auth.js', () => ({
  resolveApiKey: vi.fn(async () => 'user_1'),
}))
vi.mock('../apps/api/src/projects/service.js', () => ({
  InsufficientCreditsError: class InsufficientCreditsError extends Error {
    status = 402
    constructor(public balance: number) {
      super('Insufficient credits')
    }
  },
}))
vi.mock('@saas/db', () => ({ getCreditSummary: vi.fn() }))
vi.mock('@saas/shared', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}))

const { router } = await import('../apps/api/src/routes/v1.js')
const app = express().use('/v1', router)

describe('public REST contract', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.listFromApi.mockResolvedValue({ data: [{ id: 'p1' }], total: 3 })
  })

  it('validates limits and returns the full total', async () => {
    const ok = await request(app).get('/v1/projects?limit=1&flow=deck').set('x-api-key', 'pk_x')
    expect(ok.status).toBe(200)
    expect(ok.body).toEqual({ data: [{ id: 'p1' }], total: 3 })
    expect(api.listFromApi).toHaveBeenCalledWith('user_1', 1)

    for (const limit of ['0', '-1', '1.5', '101', 'nope']) {
      const bad = await request(app).get(`/v1/projects?limit=${limit}`).set('x-api-key', 'pk_x')
      expect(bad.status).toBe(400)
      expect(bad.body.error.code).toBe('invalid_request')
    }
  })

  it('returns the REST error envelope for malformed JSON', async () => {
    const res = await request(app)
      .post('/v1/projects')
      .set('x-api-key', 'pk_x')
      .set('content-type', 'application/json')
      .send('{')
    expect(res.status).toBe(400)
    expect(res.body).toEqual({
      error: { code: 'invalid_request', message: 'Malformed JSON body' },
    })
  })

  it('preserves plain worker 402 errors', async () => {
    api.exportFromApi.mockRejectedValue(
      Object.assign(new Error('reserved'), { status: 402, balance: 0 }),
    )
    const res = await request(app)
      .post('/v1/projects/p1/export')
      .set('x-api-key', 'pk_x')
      .send({ res: '1080p' })
    expect(res.status).toBe(402)
    expect(res.body.error).toMatchObject({ code: 'insufficient_credits', balance: 0 })
  })
})
