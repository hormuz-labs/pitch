/**
 * Redeeming a promo code.
 *
 * A code is money, so the rules that matter are the ones that stop it being
 * spent twice: one redemption per account, enforced by a unique row rather
 * than by a read-then-write the second request could slip past.
 */

import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  promoCode: { findUnique: vi.fn(), update: vi.fn(), create: vi.fn(), findMany: vi.fn() },
  userProfile: { findUnique: vi.fn() },
  redemption: { create: vi.fn() },
  addCredits: vi.fn().mockResolvedValue(1000),
}))

vi.mock('@saas/db', () => ({
  addCredits: mocks.addCredits,
  prisma: {
    promoCode: mocks.promoCode,
    userProfile: mocks.userProfile,
    $transaction: vi.fn(async (cb: any) =>
      cb({ promoCodeRedemption: mocks.redemption, promoCode: mocks.promoCode }),
    ),
  },
}))
vi.mock('../apps/api/src/middleware/auth.js', () => ({ requireAuth: () => 'user_1' }))

import { router } from '../apps/api/src/routes/promo.js'

const app = express()
app.use(express.json())
app.use('/promo', router)

const redeem = (code: unknown) => request(app).post('/promo/redeem').send({ code })

/** A live code worth 800 credits. */
function code(overrides: Record<string, unknown> = {}) {
  return {
    id: 'promo_1',
    code: 'LAUNCH800',
    credits: 800,
    maxRedemptions: null,
    redemptionCount: 0,
    expiresAt: null,
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.promoCode.findUnique.mockResolvedValue(code())
  mocks.redemption.create.mockResolvedValue({})
  mocks.promoCode.update.mockResolvedValue({})
  mocks.addCredits.mockResolvedValue(1000)
})

describe('POST /promo/redeem', () => {
  it('grants the credits and reports the new balance', async () => {
    const response = await redeem('LAUNCH800')

    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({ credits: 800, balance: 1000 })
    expect(mocks.addCredits).toHaveBeenCalledWith(
      'user_1',
      800,
      'promo',
      expect.stringContaining('LAUNCH800'),
      expect.objectContaining({ idempotencyKey: 'promo:promo_1:user_1' }),
    )
  })

  it('accepts the code however the user typed it', async () => {
    await redeem('  launch800 ')

    expect(mocks.promoCode.findUnique).toHaveBeenCalledWith({ where: { code: 'LAUNCH800' } })
  })

  it('records the redemption so the code cannot be used again', async () => {
    await redeem('LAUNCH800')

    expect(mocks.redemption.create).toHaveBeenCalledWith({
      data: { userId: 'user_1', codeId: 'promo_1', credits: 800 },
    })
  })

  it('turns a second redemption into a conflict, not a second grant', async () => {
    mocks.redemption.create.mockRejectedValue({ code: 'P2002' })

    const response = await redeem('LAUNCH800')

    expect(response.status).toBe(409)
    expect(mocks.addCredits).not.toHaveBeenCalled()
  })

  it('rejects a code that does not exist', async () => {
    mocks.promoCode.findUnique.mockResolvedValue(null)

    expect((await redeem('NOPE')).status).toBe(404)
    expect(mocks.addCredits).not.toHaveBeenCalled()
  })

  it('rejects an expired code', async () => {
    mocks.promoCode.findUnique.mockResolvedValue(code({ expiresAt: new Date('2020-01-01') }))

    expect((await redeem('LAUNCH800')).status).toBe(400)
    expect(mocks.addCredits).not.toHaveBeenCalled()
  })

  it('rejects a code that has run out of redemptions', async () => {
    mocks.promoCode.findUnique.mockResolvedValue(code({ maxRedemptions: 5, redemptionCount: 5 }))

    expect((await redeem('LAUNCH800')).status).toBe(409)
    expect(mocks.addCredits).not.toHaveBeenCalled()
  })

  it('still honours a code with redemptions left', async () => {
    mocks.promoCode.findUnique.mockResolvedValue(code({ maxRedemptions: 5, redemptionCount: 4 }))

    expect((await redeem('LAUNCH800')).status).toBe(200)
  })

  it('rejects an empty code without touching the database', async () => {
    expect((await redeem('   ')).status).toBe(400)
    expect(mocks.promoCode.findUnique).not.toHaveBeenCalled()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('minting codes', () => {
  beforeEach(() => {
    mocks.userProfile.findUnique.mockResolvedValue({ id: 'user_1', role: 'admin' })
    mocks.promoCode.create.mockImplementation(async ({ data }: any) => ({
      id: 'promo_new',
      ...data,
    }))
  })

  it('mints a code, stored upper-case so redemption is case-insensitive', async () => {
    const response = await request(app)
      .post('/promo/codes')
      .send({ code: 'launch800', credits: 800 })

    expect(response.status).toBe(201)
    expect(mocks.promoCode.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ code: 'LAUNCH800', credits: 800 }),
    })
  })

  it('refuses a code worth nothing', async () => {
    const response = await request(app).post('/promo/codes').send({ code: 'FREE', credits: 0 })

    expect(response.status).toBe(400)
    expect(mocks.promoCode.create).not.toHaveBeenCalled()
  })

  it('keeps non-admins out', async () => {
    mocks.userProfile.findUnique.mockResolvedValue({ id: 'user_1', role: 'user' })

    const response = await request(app).post('/promo/codes').send({ code: 'MINE', credits: 500 })

    expect(response.status).toBe(403)
    expect(mocks.promoCode.create).not.toHaveBeenCalled()
  })

  it('will not mint a code that already exists', async () => {
    mocks.promoCode.create.mockRejectedValue({ code: 'P2002' })

    const response = await request(app).post('/promo/codes').send({ code: 'DUPE', credits: 100 })

    expect(response.status).toBe(409)
  })
})
