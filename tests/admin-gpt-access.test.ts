import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  role: 'admin',
  updateMany: vi.fn(),
}))
vi.mock('../apps/api/src/middleware/auth.js', () => ({ requireAuth: () => 'admin-id' }))
vi.mock('@saas/db', () => ({
  prisma: {
    userProfile: { findUnique: async () => ({ role: mocks.role }), updateMany: mocks.updateMany },
  },
}))
vi.mock('../apps/api/src/projects/service.js', () => ({}))
vi.mock('../apps/api/src/studio/session.js', () => ({}))

import { router } from '../apps/api/src/routes/admin.js'

const app = express().use(express.json()).use('/admin', router)
beforeEach(() => {
  mocks.role = 'admin'
  mocks.updateMany.mockReset().mockResolvedValue({ count: 1 })
})
describe('admin GPT access', () => {
  it.each([true, false])('lets an admin set access to %s', async gptEnabled => {
    const res = await request(app).patch('/admin/users/user-1/gpt-access').send({ gptEnabled })
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ gptEnabled })
    expect(mocks.updateMany).toHaveBeenCalledWith({ where: { id: 'user-1' }, data: { gptEnabled } })
  })
  it('rejects ordinary users', async () => {
    mocks.role = 'user'
    expect(
      (await request(app).patch('/admin/users/user-1/gpt-access').send({ gptEnabled: true }))
        .status,
    ).toBe(403)
    expect(mocks.updateMany).not.toHaveBeenCalled()
  })
  it('rejects non-boolean values', async () => {
    expect(
      (await request(app).patch('/admin/users/user-1/gpt-access').send({ gptEnabled: 'false' }))
        .status,
    ).toBe(400)
    expect(mocks.updateMany).not.toHaveBeenCalled()
  })
  it('returns 404 for a missing user', async () => {
    mocks.updateMany.mockResolvedValue({ count: 0 })
    expect(
      (await request(app).patch('/admin/users/missing/gpt-access').send({ gptEnabled: true }))
        .status,
    ).toBe(404)
  })
})
