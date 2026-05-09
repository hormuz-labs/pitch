/**
 * Unit tests for packages/db credit functions.
 *
 * All Prisma calls are intercepted via vi.mock so no real database is needed.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Prisma mock ───────────────────────────────────────────────────────────────
// The factory must be self-contained (no outer variable references) because
// vi.mock is hoisted to the top of the file before any let/const are initialised.
vi.mock('@prisma/client', () => {
  const instance = {
    creditBalance: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
    creditTransaction: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
    job: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    $transaction: vi.fn(),
  };
  // PrismaClient must be a proper constructor function
  function PrismaClient() {
    return instance;
  }
  return { PrismaClient };
});

vi.mock('@zenstackhq/runtime', () => ({
  enhance: vi.fn((p: any) => p),
}));

vi.mock('dotenv', () => ({ config: vi.fn(), default: { config: vi.fn() } }));

// Import AFTER mocks are registered
import { PrismaClient } from '@prisma/client';
import {
  getCreditBalance,
  addCredits,
  deductCredit,
  getCreditTransactions,
} from '../packages/db/src/index.js';

// The singleton the module uses — same object returned by the constructor
const mockPrisma = new (PrismaClient as any)() as any;

// ── Helper: wire up $transaction to call its callback with a mini tx-client ──
function makeTxImpl(ops: { findUnique?: any; upsert?: any; create?: any } = {}) {
  return vi.fn(async (cb: any) => {
    const tx = {
      creditBalance: {
        findUnique: ops.findUnique ?? vi.fn(),
        upsert:     ops.upsert     ?? vi.fn(),
      },
      creditTransaction: {
        create: ops.create ?? vi.fn(),
      },
    };
    return cb(tx);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ─────────────────────────────────────────────────────────────────────────────
describe('getCreditBalance', () => {
  it('returns the balance when a row exists', async () => {
    mockPrisma.creditBalance.findUnique.mockResolvedValue({ balance: 42 });
    expect(await getCreditBalance('org_1')).toBe(42);
    expect(mockPrisma.creditBalance.findUnique).toHaveBeenCalledWith({ where: { tenantId: 'org_1' } });
  });

  it('returns 0 for a new tenant with no row', async () => {
    mockPrisma.creditBalance.findUnique.mockResolvedValue(null);
    expect(await getCreditBalance('brand_new')).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('addCredits', () => {
  it('upserts balance, records transaction, and returns new balance', async () => {
    const upsertMock = vi.fn().mockResolvedValue({ balance: 10 });
    const createMock = vi.fn().mockResolvedValue({});
    mockPrisma.$transaction = makeTxImpl({ upsert: upsertMock, create: createMock });

    const result = await addCredits('org_1', 10, 'admin_adjustment');

    expect(upsertMock).toHaveBeenCalledWith({
      where: { tenantId: 'org_1' },
      create: { tenantId: 'org_1', balance: 10 },
      update: { balance: { increment: 10 } },
    });
    expect(createMock).toHaveBeenCalledWith({
      data: { tenantId: 'org_1', delta: 10, reason: 'admin_adjustment', jobId: undefined },
    });
    expect(result).toBe(10);
  });

  it('attaches jobId to the transaction record when provided', async () => {
    const createMock = vi.fn().mockResolvedValue({});
    const upsertMock = vi.fn().mockResolvedValue({ balance: 5 });
    mockPrisma.$transaction = makeTxImpl({ upsert: upsertMock, create: createMock });

    await addCredits('org_1', 5, 'job_failed_refund', 'job_abc');

    expect(createMock).toHaveBeenCalledWith({
      data: expect.objectContaining({ jobId: 'job_abc' }),
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('deductCredit', () => {
  it('deducts when sufficient balance and returns new balance', async () => {
    const findUniqueMock = vi.fn().mockResolvedValue({ balance: 5 });
    const upsertMock     = vi.fn().mockResolvedValue({ balance: 4 });
    const createMock     = vi.fn().mockResolvedValue({});
    mockPrisma.$transaction = makeTxImpl({ findUnique: findUniqueMock, upsert: upsertMock, create: createMock });

    expect(await deductCredit('org_1', 1, 'job_created', 'job_xyz')).toBe(4);

    expect(upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({ update: { balance: { decrement: 1 } } })
    );
    expect(createMock).toHaveBeenCalledWith({
      data: { tenantId: 'org_1', delta: -1, reason: 'job_created', jobId: 'job_xyz' },
    });
  });

  it('throws Insufficient credits when balance is 0', async () => {
    mockPrisma.$transaction = makeTxImpl({ findUnique: vi.fn().mockResolvedValue({ balance: 0 }) });
    await expect(deductCredit('org_1', 1, 'job_created')).rejects.toThrow('Insufficient credits');
  });

  it('throws Insufficient credits when no balance row exists', async () => {
    mockPrisma.$transaction = makeTxImpl({ findUnique: vi.fn().mockResolvedValue(null) });
    await expect(deductCredit('org_1', 1, 'job_created')).rejects.toThrow('Insufficient credits');
  });

  it('throws Insufficient credits when balance is less than amount requested', async () => {
    mockPrisma.$transaction = makeTxImpl({ findUnique: vi.fn().mockResolvedValue({ balance: 2 }) });
    await expect(deductCredit('org_1', 5, 'job_created')).rejects.toThrow('Insufficient credits');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('getCreditTransactions', () => {
  it('calls findMany with correct args and returns results', async () => {
    const txList = [
      { id: 'tx_2', delta: -1, reason: 'job_created',      createdAt: new Date('2026-01-02') },
      { id: 'tx_1', delta: 10, reason: 'admin_adjustment', createdAt: new Date('2026-01-01') },
    ];
    mockPrisma.creditTransaction.findMany.mockResolvedValue(txList);

    const result = await getCreditTransactions('org_1');

    expect(mockPrisma.creditTransaction.findMany).toHaveBeenCalledWith({
      where:   { tenantId: 'org_1' },
      orderBy: { createdAt: 'desc' },
    });
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('tx_2');
  });

  it('returns empty array when no transactions exist', async () => {
    mockPrisma.creditTransaction.findMany.mockResolvedValue([]);
    expect(await getCreditTransactions('nobody')).toEqual([]);
  });
});
