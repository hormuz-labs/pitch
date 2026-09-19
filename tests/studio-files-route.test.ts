import cookieParser from 'cookie-parser'
import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  file: vi.fn(),
  requireAuth: vi.fn(),
}))

vi.mock('@saas/db', () => ({ prisma: { project: { findFirst: mocks.findFirst } } }))
vi.mock('../apps/api/src/middleware/auth.js', () => ({ requireAuth: mocks.requireAuth }))
vi.mock('../apps/api/src/projects/rows.js', () => ({ parseRow: (row: unknown) => row }))
vi.mock('../apps/api/src/worker/client.js', () => ({
  withOwner: (_id: string, run: (worker: { file: typeof mocks.file }) => unknown) =>
    run({ file: mocks.file }),
}))

const { PREVIEW_COOKIE, previewGrant } = await import('../apps/api/src/lib/preview-auth.js')
const { router } = await import('../apps/api/src/routes/files.js')

const app = express().use(cookieParser()).use('/files', router)

describe('workspace file authentication', () => {
  beforeEach(() => {
    mocks.findFirst.mockReset()
    mocks.file.mockReset()
    mocks.requireAuth.mockReset()
    mocks.findFirst.mockResolvedValue({ id: 'project-1' })
    mocks.file.mockImplementation(async (_row, _req, res) => res.status(200).send('file'))
  })

  it('prefers an explicit session token over a stale preview cookie', async () => {
    mocks.requireAuth.mockReturnValue('current-user')

    const response = await request(app)
      .get('/files/projects/studio--current-user--demo/index.html')
      .set('Authorization', 'Bearer current-session')
      .set('Cookie', `${PREVIEW_COOKIE}=${previewGrant('previous-user')}`)

    expect(response.status).toBe(200)
    expect(response.headers['cache-control']).toBe('no-store')
    expect(mocks.requireAuth).toHaveBeenCalledOnce()
    expect(mocks.findFirst).toHaveBeenCalledWith({
      where: { userId: 'current-user', name: 'demo', flow: 'studio' },
    })
    expect(response.headers['set-cookie']?.[0]).toContain(`${PREVIEW_COOKIE}=`)
    // The dev server exposes this route under /api/files. A /files-scoped
    // cookie would not accompany the tokenless injected scripts there.
    expect(response.headers['set-cookie']).toEqual(
      expect.arrayContaining([expect.stringContaining('Path=/api/files;')]),
    )
  })

  it('uses the signed preview cookie for tokenless subresources', async () => {
    const response = await request(app)
      .get('/files/projects/studio--current-user--demo/shots.js')
      .set('Cookie', `${PREVIEW_COOKIE}=${previewGrant('current-user')}`)

    expect(response.status).toBe(200)
    expect(mocks.requireAuth).not.toHaveBeenCalled()
  })

  it('does not cache ownership failures', async () => {
    mocks.requireAuth.mockReturnValue('different-user')

    const response = await request(app)
      .get('/files/projects/studio--current-user--demo/audio/music.mp3')
      .set('Authorization', 'Bearer current-session')

    expect(response.status).toBe(404)
    expect(response.headers['cache-control']).toBe('no-store')
    expect(mocks.findFirst).not.toHaveBeenCalled()
  })
})
