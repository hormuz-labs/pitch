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
  getCreditBalance,
  getCreditTransactions,
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
      where: { userId: 'user_1' },
      _sum: { delta: true },
    })
  })

  it('returns 0 for a user with no transactions', async () => {
    mockPrisma.creditTransaction.aggregate.mockResolvedValue({ _sum: { delta: null } })
    expect(await getCreditBalance('brand_new')).toBe(0)
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
        jobId: undefined,
        subscriptionId: undefined,
        topUpId: undefined,
        idempotencyKey: undefined,
      },
    })
    expect(result).toBe(10)
  })

  it('attaches jobId to the transaction record when provided', async () => {
    mockPrisma.creditTransaction.create.mockResolvedValue({})
    mockPrisma.creditTransaction.aggregate.mockResolvedValue({ _sum: { delta: 5 } })

    await addCredits('user_1', 5, 'refund', 'job failed refund', { jobId: 'job_abc' })

    expect(mockPrisma.creditTransaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ jobId: 'job_abc' }),
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

// ─────────────────────────────────────────────────────────────────────────────
describe('deductCredit', () => {
  it('deducts inside a transaction and returns the new balance', async () => {
    const aggregateMock = vi.fn().mockResolvedValue({ _sum: { delta: 5 } })
    const createMock = vi.fn().mockResolvedValue({})
    mockPrisma.$transaction = makeTx({ aggregate: aggregateMock, create: createMock })

    expect(await deductCredit('user_1', 1, 'job_created', { jobId: 'job_xyz' })).toBe(4)

    expect(createMock).toHaveBeenCalledWith({
      data: {
        userId: 'user_1',
        delta: -1,
        type: 'usage',
        description: 'job_created',
        jobId: 'job_xyz',
        idempotencyKey: undefined,
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
      where: { userId: 'user_1' },
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
