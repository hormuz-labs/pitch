/**
 * Deleting an account. Cancels billing first so nobody is charged after
 * asking to leave, wipes local data synchronously (not waiting on the async
 * Clerk webhook — deleteClerkUserData is idempotent, so both firing is safe),
 * then removes the Clerk identity itself.
 */

import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  process.env.DODO_PAYMENTS_API_KEY = 'sk_test'
  return {
    getActiveSubscription: vi.fn().mockResolvedValue(null),
    deleteClerkUserData: vi.fn().mockResolvedValue(undefined),
    subscriptionsUpdate: vi.fn().mockResolvedValue({}),
    deleteUser: vi.fn().mockResolvedValue({}),
  }
})

vi.mock('dodopayments', () => ({
  default: class {
    subscriptions = { update: mocks.subscriptionsUpdate }
  },
}))
vi.mock('@clerk/express', () => ({ clerkClient: { users: { deleteUser: mocks.deleteUser } } }))
vi.mock('@saas/db', () => ({ getActiveSubscription: mocks.getActiveSubscription }))
vi.mock('../apps/api/src/routes/clerk-webhooks.js', () => ({
  deleteClerkUserData: mocks.deleteClerkUserData,
}))
vi.mock('../apps/api/src/middleware/auth.js', () => ({ requireAuth: () => 'user_1' }))

import { router } from '../apps/api/src/routes/users.js'

const app = express()
app.use('/users', router)

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getActiveSubscription.mockResolvedValue(null)
  mocks.deleteClerkUserData.mockResolvedValue(undefined)
  mocks.deleteUser.mockResolvedValue({})
})

describe('DELETE /users/me', () => {
  it('deletes local data and the Clerk identity', async () => {
    const response = await request(app).delete('/users/me')

    expect(response.status).toBe(200)
    expect(mocks.deleteClerkUserData).toHaveBeenCalledWith('user_1')
    expect(mocks.deleteUser).toHaveBeenCalledWith('user_1')
  })

  it('cancels an active subscription before deleting anything', async () => {
    mocks.getActiveSubscription.mockResolvedValue({ dodoSubscriptionId: 'sub_1' })

    await request(app).delete('/users/me')

    expect(mocks.subscriptionsUpdate).toHaveBeenCalledWith('sub_1', { status: 'cancelled' })
    expect(mocks.deleteClerkUserData).toHaveBeenCalled()
  })

  it('does not touch Dodo when there is no active subscription', async () => {
    await request(app).delete('/users/me')

    expect(mocks.subscriptionsUpdate).not.toHaveBeenCalled()
  })
})
