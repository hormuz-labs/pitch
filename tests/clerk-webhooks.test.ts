import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const remove = () => ({ deleteMany: vi.fn().mockResolvedValue({ count: 1 }) })
  const tx = {
    affiliate: { findUnique: vi.fn(), ...remove() },
    webhookDelivery: remove(),
    webhookEndpoint: remove(),
    browserSession: remove(),
    browserProfile: remove(),
    apiKey: remove(),
    onboardingSurvey: remove(),
    creditTransaction: remove(),
    job: remove(),
    subscription: remove(),
    topUpPurchase: remove(),
    affiliateClick: remove(),
    affiliateLead: remove(),
    affiliateConversion: remove(),
    affiliatePayout: remove(),
    project: remove(),
    studioProject: remove(),
    newsletterSubscriber: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    userProfile: remove(),
  }
  return {
    tx,
    verifyWebhook: vi.fn(),
    transaction: vi.fn(async (callback: (client: typeof tx) => Promise<void>) => callback(tx)),
  }
})

vi.mock('@clerk/express/webhooks', () => ({ verifyWebhook: mocks.verifyWebhook }))
vi.mock('@saas/db', () => ({ prisma: { $transaction: mocks.transaction } }))

import { router } from '../apps/api/src/routes/clerk-webhooks.js'

const app = express()
app.use('/webhooks/clerk', router)

describe('POST /webhooks/clerk', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.tx.affiliate.findUnique.mockResolvedValue(null)
    mocks.verifyWebhook.mockResolvedValue({ type: 'user.deleted', data: { id: 'user_deleted' } })
  })

  it('deletes the local profile and all user-owned records on user.deleted', async () => {
    mocks.tx.affiliate.findUnique.mockResolvedValue({ id: 'affiliate_1' })

    const response = await request(app)
      .post('/webhooks/clerk')
      .set('content-type', 'application/json')
      .send('{}')

    expect(response.status).toBe(200)
    expect(mocks.tx.onboardingSurvey.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'user_deleted' },
    })
    expect(mocks.tx.job.deleteMany).toHaveBeenCalledWith({ where: { userId: 'user_deleted' } })
    expect(mocks.tx.affiliate.deleteMany).toHaveBeenCalledWith({
      where: { id: 'affiliate_1' },
    })
    // launchVideoProject became the studio's own project tables.
    expect(mocks.tx.project.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'user_deleted' },
    })
    expect(mocks.tx.studioProject.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'user_deleted' },
    })
    expect(mocks.tx.newsletterSubscriber.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user_deleted' },
      data: { userId: null },
    })
    expect(mocks.tx.userProfile.deleteMany).toHaveBeenLastCalledWith({
      where: { id: 'user_deleted' },
    })
  })

  it('rejects an invalid Clerk signature without touching the database', async () => {
    mocks.verifyWebhook.mockRejectedValue(new Error('invalid signature'))

    const response = await request(app)
      .post('/webhooks/clerk')
      .set('content-type', 'application/json')
      .send('{}')

    expect(response.status).toBe(400)
    expect(mocks.transaction).not.toHaveBeenCalled()
  })

  it('acknowledges unrelated Clerk events without deleting anything', async () => {
    mocks.verifyWebhook.mockResolvedValue({ type: 'session.created', data: { id: 'sess_1' } })

    const response = await request(app)
      .post('/webhooks/clerk')
      .set('content-type', 'application/json')
      .send('{}')

    expect(response.status).toBe(200)
    expect(mocks.transaction).not.toHaveBeenCalled()
  })

  it('returns 500 so Clerk retries when cleanup fails', async () => {
    mocks.transaction.mockRejectedValueOnce(new Error('database unavailable'))

    const response = await request(app)
      .post('/webhooks/clerk')
      .set('content-type', 'application/json')
      .send('{}')

    expect(response.status).toBe(500)
  })
})
