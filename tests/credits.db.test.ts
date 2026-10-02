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
    subscription: { update: vi.fn(), upsert: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn() },
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
  DISCORD_WELCOME_CREDITS,
  deductCredit,
  deductUpTo,
  endSubscription,
  getAvailableCreditBalance,
  getCreditBalance,
  getCreditTransactions,
  getDiscordCreditBalance,
  grantDiscordWelcomeReward,
  recordTopUp,
  refundProjectUsage,
  reserveCredits,
  settleCreditReservation,
  upsertSubscription,
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

  const holdFor = async (balance: number, credits: number, minCredits?: number) => {
    const reservation = {
      findUnique: vi.fn().mockResolvedValue(null),
      aggregate: vi.fn().mockResolvedValue({ _sum: { credits: 0 } }),
      create: vi.fn(async ({ data }: any) => data),
      update: vi.fn(),
    }
    mockPrisma.$transaction = makeTx({
      aggregate: vi.fn().mockResolvedValue({ _sum: { delta: balance } }),
      creditReservation: reservation,
    })
    return reserveCredits({
      key: 'project:1',
      userId: 'user_1',
      projectId: 'project_1',
      kind: 'cinematic',
      credits,
      minCredits,
    })
  }

  it('shrinks the hold to the balance instead of refusing a user who can start', async () => {
    // Reported: 231 credits, a 313-credit estimate, and the film never started.
    await expect(holdFor(231, 313, 40)).resolves.toMatchObject({ credits: 231 })
    await expect(holdFor(1000, 313, 40)).resolves.toMatchObject({ credits: 313 })
  })

  it('still refuses below the minimum, and a strict hold stays strict', async () => {
    await expect(holdFor(30, 313, 40)).rejects.toThrow('need 40')
    await expect(holdFor(231, 313)).rejects.toThrow('need 313')
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

  it('takes an overshoot to zero when asked to, instead of failing', async () => {
    const pending = {
      id: 'hold_1',
      key: 'project:1',
      userId: 'user_1',
      status: 'pending',
      credits: 40,
    }
    const creditReservation = {
      findUnique: vi.fn().mockResolvedValue(pending),
      aggregate: vi.fn().mockResolvedValue({ _sum: { credits: 0 } }),
      update: vi.fn(),
    }
    const create = vi.fn()
    mockPrisma.$transaction = makeTx({
      aggregate: vi.fn().mockResolvedValue({ _sum: { delta: 60 } }),
      create,
      creditReservation,
    })

    await expect(settleCreditReservation('project:1', 90)).rejects.toThrow('Insufficient')
    await expect(settleCreditReservation('project:1', 90, { capAtAvailable: true })).resolves.toBe(
      60,
    )
    expect(create).toHaveBeenCalledWith({ data: expect.objectContaining({ delta: -60 }) })
    expect(creditReservation.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'settled', settledCredits: 60 } }),
    )
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

  it('gracefully handles P2002 unique constraint race conditions', async () => {
    mockPrisma.creditTransaction.findUnique.mockResolvedValue(null)
    mockPrisma.creditTransaction.create.mockRejectedValue({
      code: 'P2002',
      message: 'Unique constraint failed',
    })
    mockPrisma.creditTransaction.aggregate.mockResolvedValue({ _sum: { delta: 15 } })

    const result = await addCredits('user_1', 10, 'subscription_grant', 'monthly', {
      idempotencyKey: 'sub_grant:sub_1:initial',
    })

    expect(result).toBe(15)
  })
})

describe('upsertSubscription', () => {
  it('guards against duplicate initial grants even if idempotency key check was bypassed', async () => {
    const txOps = {
      subscription: {
        upsert: vi.fn().mockResolvedValue({ id: 'sub_row_1', dodoSubscriptionId: 'sub_123' }),
      },
      creditTransaction: {
        findFirst: vi.fn().mockResolvedValue({ id: 'existing_initial_tx' }),
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn(),
        aggregate: vi.fn().mockResolvedValue({ _sum: { delta: 2500 } }),
      },
    }
    mockPrisma.$transaction.mockImplementation(async (cb: any) => cb(txOps))

    const sub = await upsertSubscription({
      userId: 'user_1',
      dodoSubscriptionId: 'sub_123',
      planKey: 'pro',
      status: 'active',
      creditsPerCycle: 2500,
      currentPeriodStart: new Date('2026-09-22T00:00:00Z'),
      currentPeriodEnd: new Date('2026-10-22T00:00:00Z'),
      idempotencyKey: 'sub_grant:sub_123:initial',
    })

    expect(sub.id).toBe('sub_row_1')
    expect(txOps.creditTransaction.create).not.toHaveBeenCalled()
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
        delta: DISCORD_WELCOME_CREDITS,
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
describe('deductUpTo', () => {
  function ledger(balance: number, heldCredits = 0) {
    const create = vi.fn().mockResolvedValue({})
    const $queryRaw = vi.fn()
    mockPrisma.$transaction = vi.fn(async (cb: any) =>
      cb({
        $queryRaw,
        creditTransaction: {
          aggregate: vi.fn().mockResolvedValue({ _sum: { delta: balance } }),
          create,
        },
        creditReservation: {
          aggregate: vi.fn().mockResolvedValue({ _sum: { credits: heldCredits } }),
        },
      }),
    )
    return { create, $queryRaw }
  }

  it('charges the full amount when the account can pay it', async () => {
    const { create, $queryRaw } = ledger(500)
    expect(await deductUpTo('user_1', 120, 'Usage: film', { projectId: 'p1' })).toBe(120)
    expect($queryRaw).toHaveBeenCalled() // the account lock
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({ delta: -120, projectId: 'p1', channel: 'product' }),
    })
  })

  it('charges down to zero, never below', async () => {
    const { create } = ledger(30)
    expect(await deductUpTo('user_1', 120, 'Usage: film')).toBe(30)
    expect(create).toHaveBeenCalledWith({ data: expect.objectContaining({ delta: -30 }) })
  })

  it("leaves another job's hold alone", async () => {
    const { create } = ledger(100, 70)
    expect(await deductUpTo('user_1', 50, 'Usage: film')).toBe(30)
    expect(create).toHaveBeenCalledWith({ data: expect.objectContaining({ delta: -30 }) })
  })

  it('writes nothing at zero, for a zero amount, or for a fraction of a credit', async () => {
    const { create } = ledger(0)
    expect(await deductUpTo('user_1', 50, 'Usage: film')).toBe(0)
    expect(await deductUpTo('user_1', 0, 'Usage: film')).toBe(0)
    expect(await deductUpTo('user_1', 0.9, 'Usage: film')).toBe(0)
    expect(create).not.toHaveBeenCalled()
  })

  it('treats an overdrawn account as empty', async () => {
    const { create } = ledger(-5)
    expect(await deductUpTo('user_1', 50, 'Usage: film')).toBe(0)
    expect(create).not.toHaveBeenCalled()
  })
})

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
describe('endSubscription', () => {
  it('ends plan access without changing the credit ledger', async () => {
    mockPrisma.subscription.update.mockResolvedValue({ id: 'sub_row', status: 'expired' })
    await endSubscription('sub_dodo', 'expired')

    expect(mockPrisma.subscription.update).toHaveBeenCalledWith({
      where: { dodoSubscriptionId: 'sub_dodo' },
      data: { status: 'expired', cancelledAt: expect.any(Date) },
    })
    expect(mockPrisma.creditTransaction.create).not.toHaveBeenCalled()
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
