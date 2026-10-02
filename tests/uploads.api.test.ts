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
  uploadFile: vi.fn(),
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

const uploadFile = storage.uploadFile as ReturnType<typeof vi.fn>

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
    uploadFile.mockImplementation(
      async (localPath: string) =>
        `http://minio.local/pitch-videos/x/${localPath.split('/').pop()}`,
    )
  })

  it('returns 401 when unauthenticated', async () => {
    __setUserId(null)
    const res = await request(buildApp())
      .post('/uploads')
      .attach('files', PNG_1x1, { filename: 'a.png', contentType: 'image/png' })
    expect(res.status).toBe(401)
    expect(uploadFile).not.toHaveBeenCalled()
  })

  it('returns 400 when no files are attached', async () => {
    const res = await request(buildApp()).post('/uploads')
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/no supported files/i)
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
    expect(uploadFile).toHaveBeenCalledWith(
      expect.stringMatching(/logo\.png$/),
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
    expect(uploadFile).toHaveBeenCalledTimes(2)
  })

  it('rejects a batch of only-unsupported files with a 4xx (not a crash/500)', async () => {
    const res = await request(buildApp())
      .post('/uploads')
      .attach('files', Buffer.from('#!/bin/sh\necho hi'), {
        filename: 'evil.sh',
        contentType: 'application/x-sh',
      })

    expect(res.status).toBeGreaterThanOrEqual(400)
    expect(res.status).toBeLessThan(500)
    expect(uploadFile).not.toHaveBeenCalled()
  })

  it('uploads the supported files and silently skips an unsupported one (no batch failure)', async () => {
    const res = await request(buildApp())
      .post('/uploads')
      .attach('files', PNG_1x1, { filename: 'a.png', contentType: 'image/png' })
      .attach('files', PNG_1x1, { filename: 'b.png', contentType: 'image/png' })
      .attach('files', Buffer.from('junk'), { filename: 'notes.txt', contentType: 'text/plain' })

    expect(res.status).toBe(201)
    expect(res.body).toHaveLength(2)
    expect(res.body.map((f: any) => f.name)).toEqual(['a.png', 'b.png'])
  })

  it('accepts an image whose mimetype is octet-stream but has an image extension', async () => {
    const res = await request(buildApp()).post('/uploads').attach('files', PNG_1x1, {
      filename: 'photo.png',
      contentType: 'application/octet-stream',
    })

    expect(res.status).toBe(201)
    expect(res.body).toHaveLength(1)
    expect(res.body[0].name).toBe('photo.png')
  })

  it('returns a safe retryable error when storage upload fails', async () => {
    uploadFile.mockRejectedValue(new Error('minio down'))
    const res = await request(buildApp())
      .post('/uploads')
      .attach('files', PNG_1x1, { filename: 'a.png', contentType: 'image/png' })

    expect(res.status).toBe(502)
    expect(res.body.error).toBe('Upload failed. Please try again.')
    expect(res.body.error).not.toContain('minio')
  })

  it('accepts soundtrack audio including downloads with a generic MIME type', async () => {
    const res = await request(buildApp())
      .post('/uploads')
      .attach('files', Buffer.from('audio'), { filename: 'song.mp3', contentType: 'audio/mpeg' })
      .attach('files', Buffer.from('audio'), {
        filename: 'song.flac',
        contentType: 'application/octet-stream',
      })
    expect(res.status).toBe(201)
    expect(res.body.map((file: any) => file.name)).toEqual(['song.mp3', 'song.flac'])
  })

  it('accepts audio at the 50 MB limit', async () => {
    const res = await request(buildApp())
      .post('/uploads')
      .attach('files', Buffer.alloc(50 * 1024 * 1024), {
        filename: 'song.wav',
        contentType: 'audio/wav',
      })
    expect(res.status).toBe(201)
    expect(res.body[0].size).toBe(50 * 1024 * 1024)
  })

  it('rejects an oversized audio batch before putting any files in storage', async () => {
    const res = await request(buildApp())
      .post('/uploads')
      .attach('files', PNG_1x1, { filename: 'logo.png', contentType: 'image/png' })
      .attach('files', Buffer.alloc(50 * 1024 * 1024 + 1), {
        filename: 'song.mp3',
        contentType: 'application/octet-stream',
      })
    expect(res.status).toBe(400)
    expect(res.body.error).toContain('50 MB')
    expect(uploadFile).not.toHaveBeenCalled()
  })

  it('accepts images at 20 MB and rejects generic-MIME images above it', async () => {
    const accepted = await request(buildApp())
      .post('/uploads')
      .attach('files', Buffer.alloc(20 * 1024 * 1024), {
        filename: 'photo.png',
        contentType: 'image/png',
      })
    expect(accepted.status).toBe(201)
    uploadFile.mockClear()

    const rejected = await request(buildApp())
      .post('/uploads')
      .attach('files', Buffer.alloc(20 * 1024 * 1024 + 1), {
        filename: 'photo.png',
        contentType: 'application/octet-stream',
      })
    expect(rejected.status).toBe(400)
    expect(rejected.body.error).toContain('20 MB')
    expect(uploadFile).not.toHaveBeenCalled()
  })

  it('accepts 20 files and rejects a batch of 21 before uploading to storage', async () => {
    const accepted = request(buildApp()).post('/uploads')
    for (let i = 0; i < 20; i++)
      accepted.attach('files', PNG_1x1, { filename: `photo-${i}.png`, contentType: 'image/png' })
    expect((await accepted).status).toBe(201)
    expect(uploadFile).toHaveBeenCalledTimes(20)
    uploadFile.mockClear()

    const rejected = request(buildApp()).post('/uploads')
    for (let i = 0; i < 21; i++)
      rejected.attach('files', PNG_1x1, { filename: `photo-${i}.png`, contentType: 'image/png' })
    const result = await rejected
    expect(result.status).toBe(400)
    expect(result.body.error).toContain('max 20')
    expect(uploadFile).not.toHaveBeenCalled()
  })
})
