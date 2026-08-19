/**
 * Behaviour tests for the launch referral program, exercised through the
 * public db service functions in packages/db.
 *
 * Reward model (amounts passed in by the caller / config):
 *   - referred signup  → new user gets `newUserReward`, referrer gets `referrerReward`
 *   - first purchase    → referrer gets `referrerReward`
 *   - organic / self-referral / duplicate → nothing
 *
 * All Prisma calls are intercepted via vi.mock so no real database is needed.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@prisma/client', () => {
  const instance = {
    affiliate: { findUnique: vi.fn() },
    affiliateClick: { count: vi.fn() },
    affiliateLead: { findUnique: vi.fn(), create: vi.fn(), count: vi.fn() },
    affiliateConversion: { findUnique: vi.fn(), create: vi.fn(), count: vi.fn() },
    creditTransaction: { findUnique: vi.fn(), create: vi.fn(), aggregate: vi.fn() },
    // recordReferral* wrap their writes in a transaction; run the callback
    // against the same mocked client so the writes are observable.
    $transaction: vi.fn((cb: any) => cb(instance)),
  }
  function PrismaClient() {
    return instance
  }
  return { PrismaClient, Prisma: {} }
})

vi.mock('@zenstackhq/runtime', () => ({ enhance: vi.fn((p: any) => p) }))
vi.mock('dotenv', () => ({ config: vi.fn(), default: { config: vi.fn() } }))

import { PrismaClient } from '@prisma/client'
import {
  getAffiliateStats,
  recordReferralConversion,
  recordReferralSignup,
} from '../packages/db/src/index.js'

const prisma = new (PrismaClient as any)() as any

/** All credit-ledger writes, as { userId, delta } pairs. */
function creditWrites(): Array<{ userId: string; delta: number; type: string }> {
  return prisma.creditTransaction.create.mock.calls.map((c: any[]) => c[0].data)
}

beforeEach(() => {
  vi.clearAllMocks()
  // addCredits internals: no prior idempotent row, balance lookups resolve.
  prisma.creditTransaction.findUnique.mockResolvedValue(null)
  prisma.creditTransaction.create.mockResolvedValue({})
  prisma.creditTransaction.aggregate.mockResolvedValue({ _sum: { delta: 0 } })
  prisma.affiliateLead.findUnique.mockResolvedValue(null)
  prisma.affiliateLead.create.mockResolvedValue({ id: 'lead_1' })
  prisma.affiliateConversion.findUnique.mockResolvedValue(null)
  prisma.affiliateConversion.create.mockResolvedValue({ id: 'conv_1' })
})

describe('recordReferralSignup', () => {
  it('rewards both the new user and the referrer, and records a lead', async () => {
    prisma.affiliate.findUnique.mockResolvedValue({
      id: 'aff_1',
      userId: 'referrer_user',
      status: 'active',
    })

    const result = await recordReferralSignup({
      affiliateId: 'aff_1',
      newUserId: 'new_user',
      newUserReward: 5,
      referrerReward: 1,
    })

    expect(result.rewarded).toBe(true)

    // A lead is recorded for the referred user.
    expect(prisma.affiliateLead.create).toHaveBeenCalledTimes(1)
    expect(prisma.affiliateLead.create.mock.calls[0][0].data).toMatchObject({
      affiliateId: 'aff_1',
      referredUserId: 'new_user',
    })

    // The new user is credited 5 as a 'promo' welcome bonus (so it is NOT counted
    // as affiliate earnings), the referrer 1 as a 'referral' earning.
    const writes = creditWrites()
    expect(writes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ userId: 'new_user', delta: 5, type: 'promo' }),
        expect.objectContaining({ userId: 'referrer_user', delta: 1, type: 'referral' }),
      ]),
    )

    // Lead + credits are written atomically so a partial failure can't orphan the lead.
    expect(prisma.$transaction).toHaveBeenCalled()
  })

  it('rewards nothing on a self-referral (referrer signs up via own link)', async () => {
    prisma.affiliate.findUnique.mockResolvedValue({
      id: 'aff_1',
      userId: 'same_user',
      status: 'active',
    })

    const result = await recordReferralSignup({
      affiliateId: 'aff_1',
      newUserId: 'same_user',
      newUserReward: 5,
      referrerReward: 1,
    })

    expect(result.rewarded).toBe(false)
    expect(prisma.affiliateLead.create).not.toHaveBeenCalled()
    expect(creditWrites()).toHaveLength(0)
  })

  it('rewards nothing for a missing or inactive affiliate', async () => {
    prisma.affiliate.findUnique.mockResolvedValue({
      id: 'aff_1',
      userId: 'referrer_user',
      status: 'suspended',
    })

    const result = await recordReferralSignup({
      affiliateId: 'aff_1',
      newUserId: 'new_user',
      newUserReward: 5,
      referrerReward: 1,
    })

    expect(result.rewarded).toBe(false)
    expect(prisma.affiliateLead.create).not.toHaveBeenCalled()
    expect(creditWrites()).toHaveLength(0)
  })

  it('is idempotent — a user already recorded as a lead is not rewarded twice', async () => {
    prisma.affiliate.findUnique.mockResolvedValue({
      id: 'aff_1',
      userId: 'referrer_user',
      status: 'active',
    })
    prisma.affiliateLead.findUnique.mockResolvedValue({
      id: 'lead_existing',
      referredUserId: 'new_user',
    })

    const result = await recordReferralSignup({
      affiliateId: 'aff_1',
      newUserId: 'new_user',
      newUserReward: 5,
      referrerReward: 1,
    })

    expect(result.rewarded).toBe(false)
    expect(prisma.affiliateLead.create).not.toHaveBeenCalled()
    expect(creditWrites()).toHaveLength(0)
  })
})

describe('recordReferralConversion', () => {
  it('rewards the referrer in credits and records the conversion on first purchase', async () => {
    prisma.affiliate.findUnique.mockResolvedValue({
      id: 'aff_1',
      userId: 'referrer_user',
      status: 'active',
    })

    const result = await recordReferralConversion({
      affiliateId: 'aff_1',
      referredUserId: 'buyer',
      referrerReward: 10,
    })

    expect(result.rewarded).toBe(true)
    expect(prisma.affiliateConversion.create).toHaveBeenCalledTimes(1)
    expect(prisma.affiliateConversion.create.mock.calls[0][0].data).toMatchObject({
      affiliateId: 'aff_1',
      referredUserId: 'buyer',
    })
    expect(creditWrites()).toEqual([
      expect.objectContaining({ userId: 'referrer_user', delta: 10, type: 'referral' }),
    ])
  })

  it('rewards nothing on a self-referral purchase', async () => {
    prisma.affiliate.findUnique.mockResolvedValue({
      id: 'aff_1',
      userId: 'buyer',
      status: 'active',
    })

    const result = await recordReferralConversion({
      affiliateId: 'aff_1',
      referredUserId: 'buyer',
      referrerReward: 10,
    })

    expect(result.rewarded).toBe(false)
    expect(prisma.affiliateConversion.create).not.toHaveBeenCalled()
    expect(creditWrites()).toHaveLength(0)
  })

  it('is idempotent — a referred user who already converted is not rewarded twice', async () => {
    prisma.affiliate.findUnique.mockResolvedValue({
      id: 'aff_1',
      userId: 'referrer_user',
      status: 'active',
    })
    prisma.affiliateConversion.findUnique.mockResolvedValue({ id: 'conv_existing' })

    const result = await recordReferralConversion({
      affiliateId: 'aff_1',
      referredUserId: 'buyer',
      referrerReward: 10,
    })

    expect(result.rewarded).toBe(false)
    expect(prisma.affiliateConversion.create).not.toHaveBeenCalled()
    expect(creditWrites()).toHaveLength(0)
  })
})

describe('getAffiliateStats', () => {
  it('reports clicks, signups, conversions and credits earned (no cash fields)', async () => {
    prisma.affiliate.findUnique.mockResolvedValue({ id: 'aff_1', userId: 'referrer_user' })
    prisma.affiliateClick.count.mockResolvedValue(10)
    prisma.affiliateLead.count.mockResolvedValue(4)
    prisma.affiliateConversion.count.mockResolvedValue(2)
    // Referral credits earned by the referrer's wallet.
    prisma.creditTransaction.aggregate.mockResolvedValue({ _sum: { delta: 7 } })

    const stats = await getAffiliateStats('aff_1')

    expect(stats).toEqual({
      clicks: 10,
      signups: 4,
      conversions: 2,
      creditsEarned: 7,
      videosEarned: 2, // floor(7 / 3)
    })
  })
})
