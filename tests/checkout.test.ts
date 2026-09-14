/**
 * Checkout rules for the current catalogue.
 *
 * Flex is a paid-plan add-on, while subscriptions keep their single-active-plan guard.
 */

import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  // config.ts reads the product ids at import time. `max` is deliberately left
  // unset to exercise the "not available for purchase yet" path.
  process.env.DODO_ENVIRONMENT = 'test_mode'
  process.env.DODO_PAYMENTS_API_KEY = 'sk_test'
  process.env.DODO_PRODUCT_FLEX_TEST = 'pdt_flex'
  process.env.DODO_PRODUCT_PRO_TEST = 'pdt_pro'
  process.env.DODO_PRODUCT_MAX_TEST = ''
  process.env.DODO_PRODUCT_PRO_ANNUAL_TEST = 'pdt_pro_annual'
  return {
    createSession: vi.fn().mockResolvedValue({ checkout_url: 'https://dodo.test/checkout/abc' }),
    getActiveSubscription: vi.fn().mockResolvedValue(null),
  }
})

vi.mock('dodopayments', () => ({
  default: class {
    checkoutSessions = { create: mocks.createSession }
  },
}))
vi.mock('@saas/db', () => ({
  getActiveSubscription: mocks.getActiveSubscription,
  prisma: { affiliateClick: { findFirst: vi.fn() } },
  getAffiliateByCode: vi.fn(),
}))
vi.mock('../apps/api/src/middleware/auth.js', () => ({ requireAuth: () => 'user_1' }))

import { router } from '../apps/api/src/routes/checkout.js'

const app = express()
app.use(express.json())
app.use('/checkout', router)

beforeEach(() => {
  vi.clearAllMocks()
  mocks.createSession.mockResolvedValue({ checkout_url: 'https://dodo.test/checkout/abc' })
  mocks.getActiveSubscription.mockResolvedValue(null)
})

describe('POST /checkout', () => {
  it('refuses a Flex top-up to someone on Free', async () => {
    const response = await request(app).post('/checkout').send({ topup: 'flex' })

    expect(response.status).toBe(403)
    expect(response.body.error).toContain('paid plan')
    expect(mocks.createSession).not.toHaveBeenCalled()
  })

  it('sells a Flex top-up to an active subscriber', async () => {
    mocks.getActiveSubscription.mockResolvedValue({ id: 'sub_1' })

    const response = await request(app).post('/checkout').send({ topup: 'flex' })

    expect(response.status).toBe(200)
    expect(mocks.createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        product_cart: [{ product_id: 'pdt_flex', quantity: 1 }],
        metadata: expect.objectContaining({ credits: '800', pack: 'flex', type: 'topup' }),
      }),
    )
  })

  it('refuses a second subscription while one is active', async () => {
    mocks.getActiveSubscription.mockResolvedValue({ id: 'sub_1' })

    const response = await request(app).post('/checkout').send({ pack: 'pro' })

    expect(response.status).toBe(409)
    expect(mocks.createSession).not.toHaveBeenCalled()
  })

  it('reports a plan with no configured product as unavailable', async () => {
    const response = await request(app).post('/checkout').send({ pack: 'max' })

    expect(response.status).toBe(503)
    expect(mocks.createSession).not.toHaveBeenCalled()
  })

  it('rejects a pack that is not in the catalogue', async () => {
    const response = await request(app).post('/checkout').send({ pack: 'starter' })

    expect(response.status).toBe(400)
  })

  it('sells an annual plan through the same generic product lookup', async () => {
    const response = await request(app).post('/checkout').send({ pack: 'pro_annual' })

    expect(response.status).toBe(200)
    expect(mocks.createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        product_cart: [{ product_id: 'pdt_pro_annual', quantity: 1 }],
        metadata: expect.objectContaining({ credits: '30000', pack: 'pro_annual' }),
      }),
    )
  })
})
