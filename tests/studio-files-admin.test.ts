/**
 * Workspace files (the live preview, renders, uploads) for admin review.
 * Workspace names carry the owner (`studio--<userId>--<name>`): the owner may
 * read their own, an administrator may read anyone's, and every other caller
 * gets a 404 before any project is even looked up.
 */
import cookieParser from 'cookie-parser'
import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  profileFindUnique: vi.fn(),
  file: vi.fn(),
  requireAuth: vi.fn(),
  roles: new Map<string, string>(),
}))

vi.mock('@saas/db', () => ({
  prisma: {
    project: { findFirst: mocks.findFirst },
    userProfile: { findUnique: mocks.profileFindUnique },
  },
}))
vi.mock('../apps/api/src/middleware/auth.js', () => ({ requireAuth: mocks.requireAuth }))
vi.mock('../apps/api/src/projects/rows.js', () => ({ parseRow: (row: unknown) => row }))
vi.mock('../apps/api/src/worker/client.js', () => ({
  withOwner: (_id: string, run: (worker: { file: typeof mocks.file }) => unknown) =>
    run({ file: mocks.file }),
}))

const { PREVIEW_COOKIE, previewGrant } = await import('../apps/api/src/lib/preview-auth.js')
const { router } = await import('../apps/api/src/routes/files.js')

const app = express().use(cookieParser()).use('/files', router)
const ALICE_FILE = '/files/projects/studio--alice--launch/renders/final.mp4'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.roles = new Map([
    ['alice', 'user'],
    ['bob', 'user'],
    ['admin', 'admin'],
  ])
  mocks.profileFindUnique.mockImplementation(async ({ where }: any) =>
    mocks.roles.has(where.id) ? { role: mocks.roles.get(where.id) } : null,
  )
  mocks.findFirst.mockResolvedValue({ id: 'alice-p', userId: 'alice' })
  mocks.file.mockImplementation(async (_row, _req, res) => res.status(200).send('video'))
})

describe('workspace files for admin review', () => {
  it('lets the owner read their own workspace', async () => {
    mocks.requireAuth.mockReturnValue('alice')
    const res = await request(app).get(ALICE_FILE).set('Authorization', 'Bearer t')
    expect(res.status).toBe(200)
    expect(mocks.profileFindUnique).not.toHaveBeenCalled()
  })

  it('lets an administrator read anyone’s workspace', async () => {
    mocks.requireAuth.mockReturnValue('admin')
    const res = await request(app).get(ALICE_FILE).set('Authorization', 'Bearer t')
    expect(res.status).toBe(200)
    expect(res.text).toBe('video')
    // The project is resolved from the workspace name, i.e. the OWNER's row.
    expect(mocks.findFirst).toHaveBeenCalledWith({
      where: { userId: 'alice', name: 'launch', flow: 'studio' },
    })
  })

  it('lets an administrator’s preview cookie load the iframe’s subresources', async () => {
    const res = await request(app)
      .get('/files/projects/studio--alice--launch/shots.js')
      .set('Cookie', `${PREVIEW_COOKIE}=${previewGrant('admin')}`)
    expect(res.status).toBe(200)
    expect(mocks.requireAuth).not.toHaveBeenCalled()
  })

  it('refuses another user without looking the project up', async () => {
    mocks.requireAuth.mockReturnValue('bob')
    const res = await request(app).get(ALICE_FILE).set('Authorization', 'Bearer t')
    expect(res.status).toBe(404)
    expect(mocks.findFirst).not.toHaveBeenCalled()
    expect(mocks.file).not.toHaveBeenCalled()
  })

  it('refuses another user’s preview cookie', async () => {
    const res = await request(app)
      .get(ALICE_FILE)
      .set('Cookie', `${PREVIEW_COOKIE}=${previewGrant('bob')}`)
    expect(res.status).toBe(404)
    expect(mocks.file).not.toHaveBeenCalled()
  })

  it('refuses a forged or tampered preview cookie', async () => {
    mocks.requireAuth.mockImplementation((_req: any, res: any) => {
      res.status(401).json({ error: 'Unauthorized' })
      return null
    })
    // bob's valid signature on a payload rewritten to name the admin.
    const grant = previewGrant('bob')
    const mac = grant.slice(grant.lastIndexOf('.') + 1)
    const forged = `${Buffer.from(`admin.${Date.now() + 60_000}`).toString('base64url')}.${mac}`
    const res = await request(app).get(ALICE_FILE).set('Cookie', `${PREVIEW_COOKIE}=${forged}`)
    expect(res.status).toBe(401)
    expect(mocks.file).not.toHaveBeenCalled()
  })

  it('checks the admin role in the database, so a demoted admin loses access at once', async () => {
    mocks.requireAuth.mockReturnValue('admin')
    mocks.roles.set('admin', 'user')
    const res = await request(app).get(ALICE_FILE).set('Authorization', 'Bearer t')
    expect(res.status).toBe(404)
    expect(mocks.file).not.toHaveBeenCalled()
  })

  it('fails closed when the role lookup errors', async () => {
    mocks.requireAuth.mockReturnValue('bob')
    mocks.profileFindUnique.mockRejectedValueOnce(new Error('db down'))
    const res = await request(app).get(ALICE_FILE).set('Authorization', 'Bearer t')
    expect(res.status).toBe(404)
    expect(mocks.file).not.toHaveBeenCalled()
  })

  it('refuses a signed-out caller', async () => {
    mocks.requireAuth.mockImplementation((_req: any, res: any) => {
      res.status(401).json({ error: 'Unauthorized' })
      return null
    })
    const res = await request(app).get(ALICE_FILE)
    expect(res.status).toBe(401)
    expect(mocks.file).not.toHaveBeenCalled()
  })

  it('does not let a user pass someone else’s id as a look-alike workspace name', async () => {
    mocks.requireAuth.mockReturnValue('bob')
    // "bob" owning "studio--bob--x" must not unlock "studio--bobby--x" or vice versa.
    const res = await request(app)
      .get('/files/projects/studio--bobby--launch/index.html')
      .set('Authorization', 'Bearer t')
    expect(res.status).toBe(404)
    expect(mocks.file).not.toHaveBeenCalled()
  })
})
