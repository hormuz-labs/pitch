/**
 * The worker contract answers only to the shared token, and answers 503
 * rather than 401 when no token is configured at all, so a misconfigured
 * fleet fails loudly instead of looking like a bad credential.
 */
import express from 'express'
import request from 'supertest'
import { describe, expect, it, vi } from 'vitest'

process.env.STUDIO_WORKER_TOKEN = 'secret-token'

vi.mock('@saas/db', () => ({ prisma: {} }))
vi.mock('@saas/shared', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}))
vi.mock('../apps/api/src/worker/host.js', () => ({
  heldProjects: () => ['p1'],
  describe: vi.fn(async (id: string) => {
    if (id === 'gone')
      throw Object.assign(new Error('not held'), { status: 409, code: 'NOT_OWNER' })
    return { preview: null, outputs: [] }
  }),
  subscribe: vi.fn(async (id: string, send: (event: unknown) => void) => {
    if (id === 'gone')
      throw Object.assign(new Error('not held'), { status: 409, code: 'NOT_OWNER' })
    send({ type: 'hello', busy: false })
    return () => {}
  }),
}))
vi.mock('../apps/api/src/worker/registry.js', () => ({ currentEpoch: () => 7 }))

const { router } = await import('../apps/api/src/worker/routes.js')
const app = express().use('/internal/worker', router)

describe('worker contract auth', () => {
  it('rejects a missing or wrong token', async () => {
    expect((await request(app).get('/internal/worker/health')).status).toBe(401)
    expect(
      (await request(app).get('/internal/worker/health').set('Authorization', 'Bearer nope'))
        .status,
    ).toBe(401)
  })
  it('answers with the right token', async () => {
    const res = await request(app)
      .get('/internal/worker/health')
      .set('Authorization', 'Bearer secret-token')
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ epoch: 7, held: 1 })
  })
  it('carries the service error shape through', async () => {
    const res = await request(app)
      .get('/internal/worker/projects/gone/describe')
      .set('Authorization', 'Bearer secret-token')
    expect(res.status).toBe(409)
    expect(res.body).toEqual({ error: 'not held', code: 'NOT_OWNER' })
    const ok = await request(app)
      .get('/internal/worker/projects/p1/describe')
      .set('Authorization', 'Bearer secret-token')
    expect(ok.body).toEqual({ preview: null, outputs: [] })
  })

  it('returns a retryable error before opening an event stream', async () => {
    const res = await request(app)
      .get('/internal/worker/projects/gone/events')
      .set('Authorization', 'Bearer secret-token')
    expect(res.status).toBe(409)
    expect(res.body).toEqual({ error: 'not held', code: 'NOT_OWNER' })
  })
})
