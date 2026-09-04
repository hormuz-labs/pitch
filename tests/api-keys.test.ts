/**
 * Unit tests for the /api-keys routes (apps/studio/src/routes/api-keys.ts).
 *
 * Mounts the REAL router — only @saas/db (the workspace specifier the router
 * imports) and @clerk/express are mocked, so the suite runs with zero
 * infrastructure. supertest fires real HTTP requests against the in-process app.
 */

import { createHash } from 'node:crypto'
import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// ── vi.mock factories must be self-contained (hoisting rule) ──────────────────

vi.mock('@saas/db', () => ({
  listApiKeys: vi.fn(),
  createApiKey: vi.fn(),
  revokeApiKey: vi.fn(),
}))

// Clerk auth is configurable per-test via the exported setter
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

// @ts-expect-error — __setAuth is injected by the vi.mock factory
import * as clerk from '@clerk/express'
import * as db from '@saas/db'
import { router as apiKeyRoutes } from '../apps/studio/src/routes/api-keys.js'

const __setAuth = (clerk as any).__setAuth
const listApiKeys = db.listApiKeys as ReturnType<typeof vi.fn>
const createApiKey = db.createApiKey as ReturnType<typeof vi.fn>
const revokeApiKey = db.revokeApiKey as ReturnType<typeof vi.fn>

// ── Build the Express app (mirrors apps/studio/src/index.ts) ────────────────────
function buildApp() {
  const app = express()
  app.use(express.json())
  app.use((clerk.clerkMiddleware as any)())
  app.use('/api-keys', apiKeyRoutes)
  return app
}

// ── Fixtures ──────────────────────────────────────────────────────────────────
const makeApiKey = (overrides: Record<string, any> = {}) => ({
  id: 'key_1',
  userId: 'user_test',
  name: 'CI key',
  prefix: 'pk_abc123',
  lastUsedAt: null,
  revokedAt: null,
  createdAt: new Date(),
  ...overrides,
})

let app: express.Express

beforeEach(() => {
  vi.clearAllMocks()
  ;(__setAuth as any)({ userId: 'user_test' })
  app = buildApp()
})

// ─────────────────────────────────────────────────────────────────────────────
describe('GET /api-keys', () => {
  it('returns 401 when unauthenticated', async () => {
    ;(__setAuth as any)({ userId: '' })
    const res = await request(app).get('/api-keys')
    expect(res.status).toBe(401)
    expect(listApiKeys).not.toHaveBeenCalled()
  })

  it('returns the key list for the authenticated user', async () => {
    listApiKeys.mockResolvedValue([makeApiKey()])
    const res = await request(app).get('/api-keys')
    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(1)
    expect(res.body[0].id).toBe('key_1')
    expect(listApiKeys).toHaveBeenCalledWith({ id: 'user_test' })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('POST /api-keys', () => {
  it('returns 401 when unauthenticated', async () => {
    ;(__setAuth as any)({ userId: '' })
    const res = await request(app).post('/api-keys').send({ name: 'CI key' })
    expect(res.status).toBe(401)
    expect(createApiKey).not.toHaveBeenCalled()
  })

  it('returns 400 when name is missing', async () => {
    const res = await request(app).post('/api-keys').send({})
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/name is required/i)
    expect(createApiKey).not.toHaveBeenCalled()
  })

  it('creates a key, stores only the hash, and returns the plaintext once', async () => {
    createApiKey.mockImplementation(async (data: any) => makeApiKey({ name: data.name }))

    const res = await request(app).post('/api-keys').send({ name: 'CI key' })

    expect(res.status).toBe(201)
    expect(res.body.key).toMatch(/^pk_/)

    const key = res.body.key as string
    const expectedHash = createHash('sha256').update(key).digest('hex')

    expect(createApiKey).toHaveBeenCalledTimes(1)
    const [data, authUser] = createApiKey.mock.calls[0]
    expect(authUser).toEqual({ id: 'user_test' })
    expect(data).toEqual({
      userId: 'user_test',
      name: 'CI key',
      prefix: key.slice(0, 12),
      keyHash: expectedHash,
    })
    // The raw key must never be stored as the hash
    expect(data.keyHash).not.toBe(key)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('DELETE /api-keys/:id', () => {
  it('returns 401 when unauthenticated', async () => {
    ;(__setAuth as any)({ userId: '' })
    const res = await request(app).delete('/api-keys/key_1')
    expect(res.status).toBe(401)
    expect(revokeApiKey).not.toHaveBeenCalled()
  })

  it('returns 200 with the revoked key when found', async () => {
    const revoked = makeApiKey({ revokedAt: new Date() })
    revokeApiKey.mockResolvedValue(revoked)

    const res = await request(app).delete('/api-keys/key_1')

    expect(res.status).toBe(200)
    expect(res.body.id).toBe('key_1')
    expect(revokeApiKey).toHaveBeenCalledWith('key_1', { id: 'user_test' })
  })

  it('returns 404 when the key does not exist', async () => {
    revokeApiKey.mockResolvedValue(null)

    const res = await request(app).delete('/api-keys/missing')

    expect(res.status).toBe(404)
    expect(res.body.error).toMatch(/not found/i)
    expect(revokeApiKey).toHaveBeenCalledWith('missing', { id: 'user_test' })
  })
})
