/**
 * The "Open billing portal" button in Plans & Billing.
 *
 * Dodo's portal is keyed by customer id, which we don't store — every
 * checkout creates the customer implicitly. So the route looks the customer
 * up by email at request time rather than persisting a customer id nobody
 * else needs.
 */

import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  process.env.DODO_PAYMENTS_API_KEY = 'sk_test'
  return {
    customersList: vi.fn(),
    portalCreate: vi.fn(),
    userProfile: { findUnique: vi.fn() },
  }
})

vi.mock('dodopayments', () => ({
  default: class {
    customers = {
      list: mocks.customersList,
      customerPortal: { create: mocks.portalCreate },
    }
  },
}))
vi.mock('@saas/db', () => ({ prisma: { userProfile: mocks.userProfile } }))
vi.mock('../apps/api/src/middleware/auth.js', () => ({ requireAuth: () => 'user_1' }))

import { router } from '../apps/api/src/routes/checkout.js'

const app = express()
app.use('/checkout', router)

beforeEach(() => {
  vi.clearAllMocks()
  mocks.userProfile.findUnique.mockResolvedValue({ email: 'ada@example.com' })
})

describe('GET /checkout/billing-portal', () => {
  it('opens the portal for a customer with billing history', async () => {
    mocks.customersList.mockResolvedValue({ items: [{ customer_id: 'cus_1' }] })
    mocks.portalCreate.mockResolvedValue({ link: 'https://dodo.test/portal/cus_1' })

    const response = await request(app).get('/checkout/billing-portal')

    expect(response.status).toBe(200)
    expect(response.body.url).toBe('https://dodo.test/portal/cus_1')
    expect(mocks.customersList).toHaveBeenCalledWith({ email: 'ada@example.com' })
    expect(mocks.portalCreate).toHaveBeenCalledWith('cus_1')
  })

  it('reports no billing history yet rather than a broken link', async () => {
    mocks.customersList.mockResolvedValue({ items: [] })

    const response = await request(app).get('/checkout/billing-portal')

    expect(response.status).toBe(404)
    expect(mocks.portalCreate).not.toHaveBeenCalled()
  })
})
