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
    creditReservation: {
      aggregate: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    discordRewardClaim: { findUnique: vi.fn() },
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
  getAvailableCreditBalance,
  getCreditBalance,
  getCreditTransactions,
  getDiscordCreditBalance,
  grantDiscordWelcomeReward,
  recordTopUp,
  refundProjectUsage,
  reserveCredits,
  settleCreditReservation,
} from '../packages/db/src/index.js'

// The singleton the module uses — same object returned by the constructor.
const mockPrisma = new (PrismaClient as any)() as any

/** Wire $transaction to invoke its callback with a tx client exposing the
 *  ledger ops deductCredit needs. */
function makeTx(ops: { aggregate?: any; create?: any; creditReservation?: any } = {}) {
  return vi.fn(async (cb: any) =>
    cb({
      $queryRaw: vi.fn(),
      creditTransaction: {
        aggregate: ops.aggregate ?? vi.fn(),
        create: ops.create ?? vi.fn().mockResolvedValue({}),
      },
      creditReservation: ops.creditReservation ?? {
        aggregate: vi.fn().mockResolvedValue({ _sum: { credits: 0 } }),
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn(),
        update: vi.fn(),
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

describe('credit reservations', () => {
  it('subtracts pending reservations from available balance', async () => {
    mockPrisma.creditTransaction.aggregate.mockResolvedValue({ _sum: { delta: 100 } })
    mockPrisma.creditReservation.aggregate.mockResolvedValue({ _sum: { credits: 35 } })
    expect(await getAvailableCreditBalance('user_1')).toBe(65)
  })

  it('reserves once and returns the same hold on retry', async () => {
    const existing = { id: 'hold_1', key: 'project:1', status: 'pending', credits: 40 }
    const reservation = {
      findUnique: vi.fn().mockResolvedValue(existing),
      aggregate: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    }
    mockPrisma.$transaction = makeTx({ creditReservation: reservation })
    await expect(
      reserveCredits({
        key: 'project:1',
        userId: 'user_1',
        projectId: 'project_1',
        kind: 'teaser',
        credits: 40,
      }),
    ).resolves.toEqual(existing)
    expect(reservation.create).not.toHaveBeenCalled()
  })

  it('settles a reservation idempotently', async () => {
    const settled = { id: 'hold_1', key: 'project:1', status: 'settled', settledCredits: 22 }
    const reservation = { findUnique: vi.fn().mockResolvedValue(settled) }
    mockPrisma.$transaction = makeTx({ creditReservation: reservation })
    await expect(settleCreditReservation('project:1', 22)).resolves.toBe(22)
  })

  it('settles above the hold only when the remaining balance covers the overage', async () => {
    const pending = {
      id: 'hold_1',
      key: 'project:1',
      userId: 'user_1',
      projectId: 'project_1',
      channel: 'product',
      kind: 'cinematic',
      status: 'pending',
      credits: 40,
    }
    const creditReservation = {
      findUnique: vi.fn().mockResolvedValue(pending),
      aggregate: vi.fn().mockResolvedValue({ _sum: { credits: 10 } }),
      update: vi.fn(),
    }
    const aggregate = vi.fn().mockResolvedValue({ _sum: { delta: 100 } })
    const create = vi.fn()
    mockPrisma.$transaction = makeTx({ aggregate, create, creditReservation })

    await expect(settleCreditReservation('project:1', 90)).resolves.toBe(90)
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({ delta: -90, idempotencyKey: 'settlement:hold_1' }),
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

describe('Discord welcome reward', () => {
  beforeEach(() => {
    mockPrisma.discordRewardClaim.findUnique.mockReset().mockResolvedValue(null)
  })

  it('writes the receipt and regular credit grant through the same transaction', async () => {
    const creditTransaction = { create: vi.fn().mockResolvedValue({ id: 'credit_1' }) }
    const discordRewardClaim = {
      create: vi.fn().mockResolvedValue({ id: 'claim_1', userId: 'user_1' }),
    }
    mockPrisma.$transaction.mockImplementation(async (cb: any) =>
      cb({ creditTransaction, discordRewardClaim }),
    )

    expect(await grantDiscordWelcomeReward('user_1', '99887766', '12345678')).toEqual({
      granted: true,
      claim: { id: 'claim_1', userId: 'user_1' },
    })
    expect(creditTransaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        delta: 250,
        channel: 'product',
        type: 'promo',
        userId: 'user_1',
      }),
    })
    expect(discordRewardClaim.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        creditTransactionId: 'credit_1',
        discordUserId: '99887766',
        guildId: '12345678',
      }),
    })
  })

  it('recognizes a claimed Discord account after it moves to another Pitch account', async () => {
    mockPrisma.discordRewardClaim.findUnique.mockImplementation(({ where }: any) =>
      where.campaignId_discordUserId ? { id: 'old_claim', userId: 'original_user' } : null,
    )
    expect(await grantDiscordWelcomeReward('new_user', '99887766', '12345678')).toEqual({
      granted: false,
      claim: { id: 'old_claim', userId: 'original_user' },
    })
    expect(mockPrisma.$transaction).not.toHaveBeenCalled()
  })

  it('recovers the winning receipt after a concurrent unique conflict', async () => {
    mockPrisma.$transaction.mockImplementation(async () => {
      mockPrisma.discordRewardClaim.findUnique.mockResolvedValue({ id: 'winner', userId: 'user_1' })
      throw { code: 'P2002' }
    })
    expect(await grantDiscordWelcomeReward('user_1', '99887766', '12345678')).toEqual({
      granted: false,
      claim: { id: 'winner', userId: 'user_1' },
    })
  })

  it('propagates a failed transaction so the claim can be retried', async () => {
    mockPrisma.$transaction.mockRejectedValue(new Error('database unavailable'))
    await expect(grantDiscordWelcomeReward('user_1', '99887766', '12345678')).rejects.toThrow(
      'database unavailable',
    )
  })
})

describe('project refunds', () => {
  it('returns regular and historical sponsored charges to their original pools', async () => {
    const creditTransaction = {
      findUnique: vi.fn().mockResolvedValue(null),
      groupBy: vi.fn().mockResolvedValue([
        { channel: 'product', _sum: { delta: -40 } },
        { channel: 'discord', _sum: { delta: -120 } },
      ]),
      create: vi.fn(),
      aggregate: vi.fn().mockResolvedValue({ _sum: { delta: 0 } }),
    }
    mockPrisma.$transaction.mockImplementation(async (cb: any) => cb({ creditTransaction }))
    await refundProjectUsage('user_1', 'project_1')
    expect(creditTransaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ channel: 'product', delta: 40 }),
    })
    expect(creditTransaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ channel: 'discord', delta: 120 }),
    })
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
