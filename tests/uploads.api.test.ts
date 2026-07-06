/**
 * Tests for the file upload API route (/uploads).
 *
 * Mounts the REAL router from apps/api/src/routes/uploads.ts —
 * only @saas/storage and @clerk/express are mocked, so multer parsing,
 * mime filtering, and the auth guard are exercised for real.
 */

import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@saas/storage', () => ({
  uploadBuffer: vi.fn(),
}))

// Auth is configurable per-test via the exported setter; mocking the
// middleware module directly avoids pulling in real Clerk.
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

import * as storage from '@saas/storage'
// @ts-expect-error — __setUserId is injected by the vi.mock factory
import { __setUserId } from '../apps/api/src/middleware/auth.js'
import { router as uploadRoutes } from '../apps/api/src/routes/uploads.js'

const uploadBuffer = storage.uploadBuffer as ReturnType<typeof vi.fn>

const PNG_1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

function buildApp() {
  const app = express()
  app.use('/uploads', uploadRoutes)
  return app
}

describe('POST /uploads', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    __setUserId('user_test')
    uploadBuffer.mockImplementation(
      async (_buf: Buffer, filename: string) => `http://minio.local/pitch-videos/x/${filename}`,
    )
  })

  it('returns 401 when unauthenticated', async () => {
    __setUserId(null)
    const res = await request(buildApp())
      .post('/uploads')
      .attach('files', PNG_1x1, { filename: 'a.png', contentType: 'image/png' })
    expect(res.status).toBe(401)
    expect(uploadBuffer).not.toHaveBeenCalled()
  })

  it('returns 400 when no files are attached', async () => {
    const res = await request(buildApp()).post('/uploads')
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/no files/i)
  })

  it('uploads a single image and returns its metadata', async () => {
    const res = await request(buildApp())
      .post('/uploads')
      .attach('files', PNG_1x1, { filename: 'logo.png', contentType: 'image/png' })

    expect(res.status).toBe(201)
    expect(res.body).toEqual([
      {
        url: 'http://minio.local/pitch-videos/x/logo.png',
        name: 'logo.png',
        type: 'image/png',
        size: PNG_1x1.length,
      },
    ])
    expect(uploadBuffer).toHaveBeenCalledWith(
      expect.any(Buffer),
      'logo.png',
      'image/png',
      undefined,
      'pitch/user_test/uploads',
    )
  })

  it('uploads multiple files in one request', async () => {
    const res = await request(buildApp())
      .post('/uploads')
      .attach('files', PNG_1x1, { filename: 'a.png', contentType: 'image/png' })
      .attach('files', Buffer.from('%PDF-1.4 fake'), {
        filename: 'deck.pdf',
        contentType: 'application/pdf',
      })

    expect(res.status).toBe(201)
    expect(res.body).toHaveLength(2)
    expect(res.body.map((f: any) => f.name)).toEqual(['a.png', 'deck.pdf'])
    expect(uploadBuffer).toHaveBeenCalledTimes(2)
  })

  it('rejects unsupported file types with a 4xx (not a crash/500)', async () => {
    const res = await request(buildApp())
      .post('/uploads')
      .attach('files', Buffer.from('#!/bin/sh\necho hi'), {
        filename: 'evil.sh',
        contentType: 'application/x-sh',
      })

    expect(res.status).toBeGreaterThanOrEqual(400)
    expect(res.status).toBeLessThan(500)
    expect(uploadBuffer).not.toHaveBeenCalled()
  })

  it('returns 500 when storage upload fails', async () => {
    uploadBuffer.mockRejectedValue(new Error('minio down'))
    const res = await request(buildApp())
      .post('/uploads')
      .attach('files', PNG_1x1, { filename: 'a.png', contentType: 'image/png' })

    expect(res.status).toBe(500)
    expect(res.body.error).toBe('minio down')
  })
})
