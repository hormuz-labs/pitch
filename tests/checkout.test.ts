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
    retrieveSubscription: vi.fn(),
    retrievePayment: vi.fn(),
    recordTopUp: vi.fn().mockResolvedValue({}),
    upsertSubscription: vi.fn().mockResolvedValue({}),
    getCreditBalance: vi.fn().mockResolvedValue(2500),
    subscriptionFindUnique: vi.fn().mockResolvedValue(null),
  }
})

vi.mock('dodopayments', () => ({
  default: class {
    checkoutSessions = { create: mocks.createSession }
    subscriptions = { retrieve: mocks.retrieveSubscription }
    payments = { retrieve: mocks.retrievePayment }
  },
}))
vi.mock('@saas/db', () => ({
  getActiveSubscription: mocks.getActiveSubscription,
  upsertSubscription: mocks.upsertSubscription,
  recordTopUp: mocks.recordTopUp,
  getCreditBalance: mocks.getCreditBalance,
  prisma: {
    affiliateClick: { findFirst: vi.fn() },
    subscription: { findUnique: mocks.subscriptionFindUnique },
  },
  getAffiliateByCode: vi.fn(),
}))
vi.mock('../apps/api/src/middleware/auth.js', () => ({ requireAuth: () => 'user_1' }))

import { router } from '../apps/api/src/routes/checkout.js'

const app = express()
app.use(express.json())
app.use('/checkout', router)

beforeEach(() => {
  vi.clearAllMocks()
  process.env.APP_URL = 'https://app.trypitch.co'
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
        metadata: expect.objectContaining({ credits: '5000', pack: 'flex', type: 'topup' }),
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
        metadata: expect.objectContaining({ credits: '120000', pack: 'pro_annual' }),
      }),
    )
  })

  it('returns successful checkouts to the canonical production host', async () => {
    const response = await request(app).post('/checkout').send({ pack: 'pro' })

    expect(response.status).toBe(200)
    expect(mocks.createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        return_url: 'https://trypitch.co/checkout/return?checkout=success',
        metadata: expect.objectContaining({ credits: '10000', pack: 'pro' }),
      }),
    )
  })
})

describe('GET /checkout/status', () => {
  it('confirms a new Pro purchase with the real receipt and new allowance', async () => {
    mocks.subscriptionFindUnique.mockResolvedValue(null)
    mocks.retrieveSubscription.mockResolvedValue({
      subscription_id: 'sub_new',
      status: 'active',
      metadata: { clerk_user_id: 'user_1', pack: 'pro', credits: '10000' },
      recurring_pre_tax_amount: 4500,
      currency: 'USD',
      created_at: '2026-10-03T00:00:00Z',
      customer: { name: 'Ada Lovelace', email: 'ada@example.com' },
    })
    const res = await request(app).get('/checkout/status?subscription_id=sub_new')
    expect(res.body.receipt).toMatchObject({
      amount: '$45.00',
      credits: 10000,
      name: 'Ada Lovelace',
    })
    expect(mocks.upsertSubscription).toHaveBeenCalledWith(
      expect.objectContaining({ creditsPerCycle: 10000 }),
    )
  })

  it('does not grant or celebrate an on-hold subscription', async () => {
    mocks.retrieveSubscription.mockResolvedValue({
      status: 'on_hold',
      metadata: { clerk_user_id: 'user_1' },
    })
    const res = await request(app).get('/checkout/status?subscription_id=sub_hold')
    expect(res.body.status).toBe('on_hold')
    expect(res.body.receipt).toBeUndefined()
    expect(mocks.upsertSubscription).not.toHaveBeenCalled()
  })

  it('routes subscription payment redirects through the subscription grant', async () => {
    mocks.subscriptionFindUnique.mockResolvedValue(null)
    mocks.retrievePayment.mockResolvedValue({
      status: 'succeeded',
      subscription_id: 'sub_paid',
      metadata: { clerk_user_id: 'user_1' },
    })
    mocks.retrieveSubscription.mockResolvedValue({
      subscription_id: 'sub_paid',
      status: 'active',
      metadata: { clerk_user_id: 'user_1', pack: 'max', credits: '30000' },
      recurring_pre_tax_amount: 8000,
      currency: 'USD',
      created_at: '2026-10-03T00:00:00Z',
    })
    const res = await request(app).get('/checkout/status?payment_id=pay_sub')
    expect(res.body.credits_granted).toBe(30000)
    expect(mocks.recordTopUp).not.toHaveBeenCalled()
    expect(mocks.upsertSubscription).toHaveBeenCalledWith(
      expect.objectContaining({ creditsPerCycle: 30000 }),
    )
  })

  it('confirms Flex with 5,000 credits and the actual payment method', async () => {
    mocks.retrievePayment.mockResolvedValue({
      payment_id: 'pay_flex',
      status: 'succeeded',
      metadata: { clerk_user_id: 'user_1', type: 'topup', pack: 'flex', credits: '5000' },
      total_amount: 2000,
      currency: 'USD',
      payment_method: 'upi',
      created_at: '2026-10-03T00:00:00Z',
    })
    const res = await request(app).get('/checkout/status?payment_id=pay_flex')
    expect(res.body.receipt).toMatchObject({ credits: 5000, amount: '$20.00', method: 'UPI' })
    expect(mocks.recordTopUp).toHaveBeenCalledWith(
      expect.objectContaining({ credits: 5000, dodoPaymentId: 'pay_flex' }),
    )
  })

  it('grants initial credits with sub_grant:<id>:initial when subscription is not in DB yet', async () => {
    mocks.subscriptionFindUnique.mockResolvedValue(null)
    mocks.retrieveSubscription.mockResolvedValue({
      subscription_id: 'sub_xyz',
      status: 'active',
      metadata: { clerk_user_id: 'user_1', pack: 'pro', credits: '2500' },
      recurring_pre_tax_amount: 4500,
      currency: 'USD',
      created_at: '2026-09-22T00:00:00Z',
    })

    const res = await request(app).get('/checkout/status?subscription_id=sub_xyz')
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('succeeded')
    expect(mocks.upsertSubscription).toHaveBeenCalledWith(
      expect.objectContaining({
        dodoSubscriptionId: 'sub_xyz',
        idempotencyKey: 'sub_grant:sub_xyz:initial',
        creditsPerCycle: 2500,
      }),
    )
  })

  it('skips granting when subscription was already recorded (e.g. by webhook)', async () => {
    mocks.subscriptionFindUnique.mockResolvedValue({
      id: 'sub_row_1',
      dodoSubscriptionId: 'sub_xyz',
    })
    mocks.retrieveSubscription.mockResolvedValue({
      subscription_id: 'sub_xyz',
      status: 'active',
      metadata: { clerk_user_id: 'user_1', pack: 'pro', credits: '2500' },
      recurring_pre_tax_amount: 4500,
      currency: 'USD',
      created_at: '2026-09-22T00:00:00Z',
    })

    const res = await request(app).get('/checkout/status?subscription_id=sub_xyz')
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('succeeded')
    expect(mocks.upsertSubscription).not.toHaveBeenCalled()
  })
})
