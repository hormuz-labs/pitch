/**
 * Dodo billing webhooks: what a subscription event actually grants.
 *
 * Credits were redenominated x40, and the plan catalogue was replaced at the
 * same time. `pro` now names both the retired $40 plan (2,000 credits at
 * today's scale) and the current $45 one (2,500), so these tests pin down which
 * allowance a given event pays out.
 */

import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  verify: vi.fn(),
  upsertSubscription: vi.fn().mockResolvedValue({}),
  subscription: { findUnique: vi.fn(), findMany: vi.fn().mockResolvedValue([]) },
  userProfile: { findUnique: vi.fn().mockResolvedValue(null) },
}))

vi.mock('standardwebhooks', () => ({
  Webhook: class {
    verify = mocks.verify
  },
}))
vi.mock('@saas/db', () => ({
  upsertSubscription: mocks.upsertSubscription,
  prisma: { subscription: mocks.subscription, userProfile: mocks.userProfile },
}))
vi.mock('@saas/email', () => ({ sendBillingEmail: vi.fn().mockResolvedValue({}) }))

import { router } from '../apps/api/src/routes/webhooks.js'

const app = express()
app.use('/webhooks', router)

const post = () =>
  request(app).post('/webhooks/dodo').set('content-type', 'application/json').send('{}')

/** A Dodo subscription event as the handler reads it. */
function event(type: string, pack: string, metadataCredits: string, subscriptionId: string) {
  return {
    type,
    data: {
      subscription_id: subscriptionId,
      metadata: { clerk_user_id: 'user_1', pack, credits: metadataCredits },
    },
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.DODO_PAYMENTS_WEBHOOK_SECRET = 'whsec_test'
  mocks.subscription.findUnique.mockResolvedValue(null)
  mocks.subscription.findMany.mockResolvedValue([])
  mocks.userProfile.findUnique.mockResolvedValue(null)
})

describe('subscription.renewed', () => {
  it('renews a grandfathered plan at the allowance stored on the subscription', async () => {
    // Someone on the retired $40 Pro plan: 2,000 credits at today's scale.
    mocks.subscription.findUnique.mockResolvedValue({ creditsPerCycle: 2000 })
    mocks.verify.mockReturnValue(event('subscription.renewed', 'pro', '2000', 'sub_legacy'))

    const response = await post()

    expect(response.status).toBe(200)
    expect(mocks.upsertSubscription).toHaveBeenCalledWith(
      expect.objectContaining({ creditsPerCycle: 2000 }),
    )
  })

  it('falls back to the catalogue when no subscription has been recorded yet', async () => {
    mocks.verify.mockReturnValue(event('subscription.renewed', 'pro', '0', 'sub_unknown'))

    await post()

    expect(mocks.upsertSubscription).toHaveBeenCalledWith(
      expect.objectContaining({ creditsPerCycle: 2500 }),
    )
  })
})

describe('subscription.active', () => {
  it('grants the current allowance for a plan we sell', async () => {
    mocks.verify.mockReturnValue(event('subscription.active', 'max', '5000', 'sub_new'))

    await post()

    expect(mocks.upsertSubscription).toHaveBeenCalledWith(
      expect.objectContaining({ planKey: 'max', creditsPerCycle: 5000 }),
    )
  })

  it('still honours a retired plan key at its redenominated allowance', async () => {
    // An in-flight checkout for the $10 Starter plan, which we no longer sell.
    mocks.verify.mockReturnValue(event('subscription.active', 'starter', '10', 'sub_retired'))

    await post()

    expect(mocks.upsertSubscription).toHaveBeenCalledWith(
      expect.objectContaining({ creditsPerCycle: 400 }),
    )
  })
})
