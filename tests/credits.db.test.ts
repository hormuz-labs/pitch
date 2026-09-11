/**
 * Unit tests for the packages/db credit-ledger functions.
 *
 * Balance is computed from the CreditTransaction ledger (SUM of delta per
 * userId) — there is no mutable balance row. All Prisma calls are intercepted
 * via vi.mock so no real database is needed.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

// ── Prisma mock ───────────────────────────────────────────────────────────────
// The factory must be self-contained (no outer variable references) because
// vi.mock is hoisted above any let/const initialisation.
vi.mock('@prisma/client', () => {
  const instance = {
    creditTransaction: {
      aggregate: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      findMany: vi.fn(),
    },
    $transaction: vi.fn(),
  }
  function PrismaClient() {
    return instance
  }
  // index.ts imports the `Prisma` namespace for types — provide a stub.
  return { PrismaClient, Prisma: {} }
})

vi.mock('@zenstackhq/runtime', () => ({ enhance: vi.fn((p: any) => p) }))
vi.mock('dotenv', () => ({ config: vi.fn(), default: { config: vi.fn() } }))

// Import AFTER mocks are registered.
import { PrismaClient } from '@prisma/client'
import {
  addCredits,
  deductCredit,
  endSubscription,
  forfeitableCredits,
  getCreditBalance,
  getCreditTransactions,
  getDiscordCreditBalance,
  grantDiscordVideoReward,
  recordTopUp,
} from '../packages/db/src/index.js'

// The singleton the module uses — same object returned by the constructor.
const mockPrisma = new (PrismaClient as any)() as any

/** Wire $transaction to invoke its callback with a tx client exposing the
 *  ledger ops deductCredit needs. */
function makeTx(ops: { aggregate?: any; create?: any } = {}) {
  return vi.fn(async (cb: any) =>
    cb({
      creditTransaction: {
        aggregate: ops.aggregate ?? vi.fn(),
        create: ops.create ?? vi.fn().mockResolvedValue({}),
      },
    }),
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ─────────────────────────────────────────────────────────────────────────────
describe('getCreditBalance', () => {
  it('sums the ledger and returns the balance', async () => {
    mockPrisma.creditTransaction.aggregate.mockResolvedValue({ _sum: { delta: 42 } })

    expect(await getCreditBalance('user_1')).toBe(42)
    expect(mockPrisma.creditTransaction.aggregate).toHaveBeenCalledWith({
      where: { userId: 'user_1', channel: { not: 'discord' } },
      _sum: { delta: true },
    })
  })

  it('returns 0 for a user with no transactions', async () => {
    mockPrisma.creditTransaction.aggregate.mockResolvedValue({ _sum: { delta: null } })
    expect(await getCreditBalance('brand_new')).toBe(0)
  })

  it('keeps the UTC-day Discord balance separate from the main balance', async () => {
    mockPrisma.creditTransaction.aggregate.mockResolvedValue({ _sum: { delta: 120 } })

    await expect(
      getDiscordCreditBalance('user_1', mockPrisma, new Date('2026-09-11T12:00:00.000Z')),
    ).resolves.toBe(120)
    expect(mockPrisma.creditTransaction.aggregate).toHaveBeenCalledWith({
      where: {
        userId: 'user_1',
        channel: 'discord',
        createdAt: {
          gte: new Date('2026-09-11T00:00:00.000Z'),
          lt: new Date('2026-09-12T00:00:00.000Z'),
        },
      },
      _sum: { delta: true },
    })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('addCredits', () => {
  it('writes a positive transaction and returns the new balance', async () => {
    mockPrisma.creditTransaction.create.mockResolvedValue({})
    mockPrisma.creditTransaction.aggregate.mockResolvedValue({ _sum: { delta: 10 } })

    const result = await addCredits('user_1', 10, 'admin_adjustment', 'manual top-up')

    expect(mockPrisma.creditTransaction.create).toHaveBeenCalledWith({
      data: {
        userId: 'user_1',
        delta: 10,
        type: 'admin_adjustment',
        description: 'manual top-up',
        projectId: undefined,
        subscriptionId: undefined,
        topUpId: undefined,
        idempotencyKey: undefined,
        channel: 'product',
      },
    })
    expect(result).toBe(10)
  })

  it('attaches projectId to the transaction record when provided', async () => {
    mockPrisma.creditTransaction.create.mockResolvedValue({})
    mockPrisma.creditTransaction.aggregate.mockResolvedValue({ _sum: { delta: 5 } })

    await addCredits('user_1', 5, 'refund', 'render failed refund', { projectId: 'proj_abc' })

    expect(mockPrisma.creditTransaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ projectId: 'proj_abc' }),
    })
  })

  it('is idempotent — skips the grant when the idempotency key already exists', async () => {
    mockPrisma.creditTransaction.findUnique.mockResolvedValue({ id: 'tx_existing' })
    mockPrisma.creditTransaction.aggregate.mockResolvedValue({ _sum: { delta: 7 } })

    const result = await addCredits('user_1', 10, 'subscription_grant', 'monthly', {
      idempotencyKey: 'sub_grant:sub_1:2026-06-01',
    })

    expect(mockPrisma.creditTransaction.findUnique).toHaveBeenCalledWith({
      where: { idempotencyKey: 'sub_grant:sub_1:2026-06-01' },
    })
    expect(mockPrisma.creditTransaction.create).not.toHaveBeenCalled()
    expect(result).toBe(7) // returns existing balance, no double-grant
  })
})

describe('Discord video reward', () => {
  const offerDay = new Date('2026-09-11T12:00:00.000Z')

  it('grants one video at a time from the daily allowance', async () => {
    const promoCode = {
      upsert: vi.fn().mockResolvedValue({ id: 'promo_discord', credits: 120 }),
      update: vi.fn().mockResolvedValue({}),
    }
    const promoCodeRedemption = {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({}),
    }
    const creditTransaction = {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({}),
      aggregate: vi.fn().mockResolvedValue({ _sum: { delta: 120 } }),
    }
    mockPrisma.$transaction.mockImplementation(async (callback: any) =>
      callback({ promoCode, promoCodeRedemption, creditTransaction }),
    )

    await expect(
      grantDiscordVideoReward('user_1', 120, { dailyLimit: 3, now: offerDay }),
    ).resolves.toEqual({
      granted: true,
      credits: 120,
      remaining: 2,
    })
    expect(promoCode.upsert).toHaveBeenCalledWith({
      where: { code: 'DISCORD_VIDEO_2026_09_11_1' },
      create: { code: 'DISCORD_VIDEO_2026_09_11_1', credits: 120 },
      update: { credits: 120 },
    })
    expect(promoCodeRedemption.create).toHaveBeenCalledWith({
      data: { userId: 'user_1', codeId: 'promo_discord', credits: 120 },
    })
    expect(creditTransaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user_1',
        delta: 120,
        type: 'promo',
        channel: 'discord',
        idempotencyKey: 'promo:discord-video:2026-09-11:1:user_1',
      }),
    })
  })

  it('uses the next unredeemed slot for the same UTC day', async () => {
    const creditCreate = vi.fn()
    const findUnique = vi.fn().mockResolvedValueOnce({ credits: 120 }).mockResolvedValueOnce(null)
    mockPrisma.$transaction.mockImplementation(async (callback: any) =>
      callback({
        promoCode: {
          upsert: vi.fn(({ where }: any) => ({ id: where.code, credits: 120 })),
          update: vi.fn().mockResolvedValue({}),
        },
        promoCodeRedemption: {
          findUnique,
          create: vi.fn().mockResolvedValue({}),
        },
        creditTransaction: {
          findUnique: vi.fn().mockResolvedValue(null),
          create: creditCreate,
          aggregate: vi.fn().mockResolvedValue({ _sum: { delta: 120 } }),
        },
      }),
    )

    await expect(
      grantDiscordVideoReward('user_1', 120, { dailyLimit: 3, now: offerDay }),
    ).resolves.toEqual({
      granted: true,
      credits: 120,
      remaining: 1,
    })
    expect(creditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        idempotencyKey: 'promo:discord-video:2026-09-11:2:user_1',
      }),
    })
  })

  it('rejects a fourth Discord video on the same UTC day', async () => {
    const creditCreate = vi.fn()
    const findUnique = vi.fn().mockResolvedValue({ credits: 120 })
    mockPrisma.$transaction.mockImplementation(async (callback: any) =>
      callback({
        promoCode: {
          upsert: vi.fn(({ where }: any) => ({ id: where.code, credits: 120 })),
        },
        promoCodeRedemption: { findUnique },
        creditTransaction: { create: creditCreate },
      }),
    )

    await expect(
      grantDiscordVideoReward('user_1', 120, { dailyLimit: 3, now: offerDay }),
    ).resolves.toEqual({
      granted: false,
      credits: 0,
      remaining: 0,
    })
    expect(findUnique).toHaveBeenCalledTimes(3)
    expect(creditCreate).not.toHaveBeenCalled()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('deductCredit', () => {
  it('deducts inside a transaction and returns the new balance', async () => {
    const aggregateMock = vi.fn().mockResolvedValue({ _sum: { delta: 5 } })
    const createMock = vi.fn().mockResolvedValue({})
    mockPrisma.$transaction = makeTx({ aggregate: aggregateMock, create: createMock })

    expect(await deductCredit('user_1', 1, 'turn_billed', { projectId: 'proj_xyz' })).toBe(4)

    expect(createMock).toHaveBeenCalledWith({
      data: {
        userId: 'user_1',
        delta: -1,
        type: 'usage',
        description: 'turn_billed',
        projectId: 'proj_xyz',
        idempotencyKey: undefined,
        channel: 'product',
      },
    })
  })

  it('throws Insufficient credits when balance is 0', async () => {
    mockPrisma.$transaction = makeTx({
      aggregate: vi.fn().mockResolvedValue({ _sum: { delta: 0 } }),
    })
    await expect(deductCredit('user_1', 1, 'job_created')).rejects.toThrow('Insufficient credits')
  })

  it('throws Insufficient credits when the user has no transactions', async () => {
    mockPrisma.$transaction = makeTx({
      aggregate: vi.fn().mockResolvedValue({ _sum: { delta: null } }),
    })
    await expect(deductCredit('user_1', 1, 'job_created')).rejects.toThrow('Insufficient credits')
  })

  it('throws Insufficient credits when balance is less than the amount requested', async () => {
    mockPrisma.$transaction = makeTx({
      aggregate: vi.fn().mockResolvedValue({ _sum: { delta: 2 } }),
    })
    await expect(deductCredit('user_1', 5, 'job_created')).rejects.toThrow('Insufficient credits')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('getCreditTransactions', () => {
  it('returns the user ledger newest-first', async () => {
    const txList = [
      { id: 'tx_2', delta: -3, type: 'usage', createdAt: new Date('2026-01-02') },
      { id: 'tx_1', delta: 10, type: 'admin_adjustment', createdAt: new Date('2026-01-01') },
    ]
    mockPrisma.creditTransaction.findMany.mockResolvedValue(txList)

    const result = await getCreditTransactions('user_1')

    expect(mockPrisma.creditTransaction.findMany).toHaveBeenCalledWith({
      where: { userId: 'user_1', channel: { not: 'discord' } },
      orderBy: { createdAt: 'desc' },
    })
    expect(result).toHaveLength(2)
    expect(result[0].id).toBe('tx_2')
  })

  it('returns an empty array when the user has no transactions', async () => {
    mockPrisma.creditTransaction.findMany.mockResolvedValue([])
    expect(await getCreditTransactions('nobody')).toEqual([])
  })
})

// ─────────────────────────────────────────────────────────────────────────────
/**
 * Ending a subscription forfeits what is left of the monthly allowance, but
 * credits the user bought outright — a Flex pack, a promo, a referral reward —
 * are theirs and survive. Spend draws the allowance down first.
 */
describe('forfeitableCredits', () => {
  it('forfeits what is left of the subscription allowance', () => {
    // 2,500 granted, 1,200 spent, plus an 800-credit Flex pack: balance 2,100.
    expect(
      forfeitableCredits({ subscriptionGrants: 2500, refunds: 0, spend: 1200, balance: 2100 }),
    ).toBe(1300)
  })

  it('leaves purchased credits untouched', () => {
    const balance = 2100
    const forfeit = forfeitableCredits({
      subscriptionGrants: 2500,
      refunds: 0,
      spend: 1200,
      balance,
    })
    expect(balance - forfeit).toBe(800)
  })

  it('forfeits nothing once the allowance is spent', () => {
    expect(
      forfeitableCredits({ subscriptionGrants: 2500, refunds: 0, spend: 3000, balance: 300 }),
    ).toBe(0)
  })

  it('forfeits nothing from someone who only ever bought credits', () => {
    expect(forfeitableCredits({ subscriptionGrants: 0, refunds: 0, spend: 0, balance: 800 })).toBe(
      0,
    )
  })

  it('returns refunded work to the allowance it was paid from', () => {
    expect(
      forfeitableCredits({ subscriptionGrants: 2500, refunds: 1200, spend: 1200, balance: 3300 }),
    ).toBe(2500)
  })

  it('never forfeits more than the balance', () => {
    expect(
      forfeitableCredits({ subscriptionGrants: 5000, refunds: 0, spend: 4900, balance: 100 }),
    ).toBe(100)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('endSubscription', () => {
  /** A ledger where `granted` came from the plan and the rest was bought. */
  function ledger({ granted = 0, refunded = 0, spent = 0, balance = 0 } = {}) {
    const create = vi.fn().mockResolvedValue({})
    const aggregate = vi.fn(async ({ where }: any) => {
      if (where.type === 'subscription_grant') return { _sum: { delta: granted } }
      if (where.type === 'refund') return { _sum: { delta: refunded } }
      if (where.delta?.lt === 0) return { _sum: { delta: -spent } }
      return { _sum: { delta: balance } }
    })
    mockPrisma.$transaction = vi.fn(async (cb: any) =>
      cb({
        subscription: {
          findUnique: vi.fn().mockResolvedValue({ id: 'sub_row', userId: 'user_1' }),
          update: vi.fn().mockResolvedValue({}),
        },
        creditTransaction: { aggregate, findUnique: vi.fn().mockResolvedValue(null), create },
      }),
    )
    return { create }
  }

  it('forfeits the unused allowance and leaves purchased credits behind', async () => {
    // 2,500 from the plan, 800 bought as Flex, 1,200 spent.
    const { create } = ledger({ granted: 2500, spent: 1200, balance: 2100 })

    await endSubscription('sub_dodo', 'expired')

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: 'user_1', delta: -1300 }),
    })
  })

  it('writes no adjustment when the user only holds credits they bought', async () => {
    const { create } = ledger({ granted: 0, spent: 0, balance: 800 })

    await endSubscription('sub_dodo', 'cancelled')

    expect(create).not.toHaveBeenCalled()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('recordTopUp', () => {
  /** Wires $transaction with a ledger that has no active subscription. */
  function noSubscription() {
    const create = vi.fn().mockResolvedValue({ id: 'topup_1' })
    const grant = vi.fn().mockResolvedValue({})
    mockPrisma.$transaction = vi.fn(async (cb: any) =>
      cb({
        topUpPurchase: { findUnique: vi.fn().mockResolvedValue(null), create },
        subscription: { findFirst: vi.fn().mockResolvedValue(null) },
        creditTransaction: {
          findUnique: vi.fn().mockResolvedValue(null),
          create: grant,
          aggregate: vi.fn().mockResolvedValue({ _sum: { delta: 800 } }),
        },
      }),
    )
    return { create, grant }
  }

  it('grants a standalone pack bought without a subscription', async () => {
    // Flex is the entry product: charging the card and granting nothing would
    // take the money and give back no credits.
    const { create, grant } = noSubscription()

    await recordTopUp({
      userId: 'user_1',
      dodoPaymentId: 'pay_1',
      packKey: 'flex',
      credits: 800,
      amountUsd: 20,
    })

    expect(create).toHaveBeenCalledWith({ data: expect.objectContaining({ credits: 800 }) })
    expect(grant).toHaveBeenCalledWith({
      data: expect.objectContaining({ delta: 800, type: 'topup_grant' }),
    })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('deductCredit channel attribution', () => {
  it('defaults to the product channel when the caller does not say otherwise', async () => {
    const aggregateMock = vi.fn().mockResolvedValue({ _sum: { delta: 500 } })
    const createMock = vi.fn().mockResolvedValue({})
    mockPrisma.$transaction = makeTx({ aggregate: aggregateMock, create: createMock })

    await deductCredit('user_1', 40, 'turn_billed', { projectId: 'proj_xyz' })

    expect(createMock).toHaveBeenCalledWith({
      data: expect.objectContaining({ channel: 'product' }),
    })
  })

  it('records the api channel for a project stamped source: "api"', async () => {
    const aggregateMock = vi.fn().mockResolvedValue({ _sum: { delta: 500 } })
    const createMock = vi.fn().mockResolvedValue({})
    mockPrisma.$transaction = makeTx({ aggregate: aggregateMock, create: createMock })

    await deductCredit('user_1', 40, 'turn_billed', { projectId: 'proj_xyz', channel: 'api' })

    expect(createMock).toHaveBeenCalledWith({
      data: expect.objectContaining({ channel: 'api' }),
    })
  })

  it('can only spend today’s Discord allowance on the discord channel', async () => {
    const aggregateMock = vi.fn().mockResolvedValue({ _sum: { delta: 120 } })
    const createMock = vi.fn().mockResolvedValue({})
    mockPrisma.$transaction = makeTx({ aggregate: aggregateMock, create: createMock })

    await deductCredit('user_1', 120, 'Discord video', {
      projectId: 'proj_discord',
      channel: 'discord',
    })

    expect(aggregateMock).toHaveBeenCalledWith({
      where: expect.objectContaining({ userId: 'user_1', channel: 'discord' }),
      _sum: { delta: true },
    })
    expect(createMock).toHaveBeenCalledWith({
      data: expect.objectContaining({ channel: 'discord' }),
    })
  })
})
