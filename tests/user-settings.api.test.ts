/**
 * Profile settings: the public handle and the notification switches.
 *
 * The handle is the only user-chosen unique value on an account, so the tests
 * pin down both halves of the guard — the shape check and the collision.
 */

import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  userProfile: { findUnique: vi.fn(), update: vi.fn() },
}))

vi.mock('@saas/db', () => ({ prisma: { userProfile: mocks.userProfile } }))
vi.mock('@saas/email', () => ({ sendWelcomeEmail: vi.fn() }))
vi.mock('../apps/api/src/middleware/auth.js', () => ({ requireAuth: () => 'user_1' }))

import { router } from '../apps/api/src/routes/users.js'

const app = express()
app.use(express.json())
app.use('/users', router)

const patch = (body: unknown) => request(app).patch('/users/me').send(body)

beforeEach(() => {
  vi.clearAllMocks()
  mocks.userProfile.findUnique.mockResolvedValue(null)
  mocks.userProfile.update.mockImplementation(async ({ data }: any) => ({ id: 'user_1', ...data }))
})

describe('PATCH /users/me', () => {
  it('sets a username', async () => {
    const response = await patch({ username: 'ada_lovelace' })

    expect(response.status).toBe(200)
    expect(response.body.username).toBe('ada_lovelace')
    expect(mocks.userProfile.update).toHaveBeenCalledWith({
      where: { id: 'user_1' },
      data: { username: 'ada_lovelace' },
    })
  })

  it('lower-cases and trims a username so handles cannot collide on case', async () => {
    await patch({ username: '  AdaLovelace  ' })

    expect(mocks.userProfile.update).toHaveBeenCalledWith({
      where: { id: 'user_1' },
      data: { username: 'adalovelace' },
    })
  })

  it('rejects a username with characters that would not read as a handle', async () => {
    const response = await patch({ username: 'ada lovelace!' })

    expect(response.status).toBe(400)
    expect(mocks.userProfile.update).not.toHaveBeenCalled()
  })

  it('rejects a username that is too short', async () => {
    expect((await patch({ username: 'ab' })).status).toBe(400)
  })

  it('refuses a username somebody else already holds', async () => {
    mocks.userProfile.findUnique.mockResolvedValue({ id: 'someone_else' })

    const response = await patch({ username: 'taken' })

    expect(response.status).toBe(409)
    expect(mocks.userProfile.update).not.toHaveBeenCalled()
  })

  it('lets a user re-save the username they already hold', async () => {
    mocks.userProfile.findUnique.mockResolvedValue({ id: 'user_1' })

    expect((await patch({ username: 'mine' })).status).toBe(200)
  })

  it('reports a lost race on the unique index as a conflict, not a crash', async () => {
    mocks.userProfile.update.mockRejectedValue({ code: 'P2002' })

    expect((await patch({ username: 'contested' })).status).toBe(409)
  })

  it('updates notification preferences on their own', async () => {
    const response = await patch({ emailNotifications: false, browserNotifications: true })

    expect(response.status).toBe(200)
    expect(mocks.userProfile.update).toHaveBeenCalledWith({
      where: { id: 'user_1' },
      data: { emailNotifications: false, browserNotifications: true },
    })
  })

  it('ignores fields the settings page has no business changing', async () => {
    await patch({ role: 'admin', email: 'attacker@example.com', emailNotifications: false })

    expect(mocks.userProfile.update).toHaveBeenCalledWith({
      where: { id: 'user_1' },
      data: { emailNotifications: false },
    })
  })

  it('rejects a request that asks for no change at all', async () => {
    const response = await patch({})

    expect(response.status).toBe(400)
    expect(mocks.userProfile.update).not.toHaveBeenCalled()
  })
})
