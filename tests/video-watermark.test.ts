import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  subscription: vi.fn(),
  topUp: vi.fn(async () => ({ id: 'topup_flex' })),
}))

vi.mock('@saas/db', () => ({
  prisma: {
    subscription: { findFirst: mocks.subscription },
    topUpPurchase: { findFirst: mocks.topUp },
  },
}))

import { shouldWatermarkVideo } from '../apps/api/src/projects/watermark'

const NOW = new Date('2026-09-25T12:00:00Z')

/**
 * A stand-in for the subscription table that honours the query's OR clause,
 * so each case is decided by the row's status and period end, not by a mock
 * that answers yes regardless.
 */
const withSubscription = (row: { status: string; currentPeriodEnd: Date } | null) =>
  mocks.subscription.mockImplementation(
    async ({ where }: { where: { OR: Record<string, any>[] } }) => {
      if (!row) return null
      const matches = where.OR.some(clause =>
        'status' in clause
          ? row.status === clause.status
          : row.currentPeriodEnd > clause.currentPeriodEnd.gt,
      )
      return matches ? { id: 'sub_1' } : null
    },
  )

describe('video watermark entitlement', () => {
  beforeEach(() => {
    mocks.subscription.mockReset()
    withSubscription(null)
  })

  it('watermarks accounts with no paid plan', async () => {
    await expect(shouldWatermarkVideo('user_free', NOW)).resolves.toBe(true)
  })

  it.each(['pro', 'max'])('removes watermarks for an active %s plan', async planKey => {
    withSubscription({ status: 'active', currentPeriodEnd: new Date('2026-10-25T00:00:00Z') })
    await expect(shouldWatermarkVideo(`user_${planKey}`, NOW)).resolves.toBe(false)
  })

  it('keeps exports clean after cancelling, until the paid period ends', async () => {
    withSubscription({ status: 'cancelled', currentPeriodEnd: new Date('2026-10-01T00:00:00Z') })
    await expect(shouldWatermarkVideo('user_cancelled', NOW)).resolves.toBe(false)
  })

  it('brings the watermark back once a cancelled plan has run out', async () => {
    withSubscription({ status: 'cancelled', currentPeriodEnd: new Date('2026-09-20T00:00:00Z') })
    await expect(shouldWatermarkVideo('user_lapsed', NOW)).resolves.toBe(true)
  })

  it('brings the watermark back after a failed renewal ends the plan', async () => {
    withSubscription({ status: 'on_hold', currentPeriodEnd: new Date('2026-09-24T00:00:00Z') })
    await expect(shouldWatermarkVideo('user_on_hold', NOW)).resolves.toBe(true)
  })

  it('does not let leftover Flex credits keep exports clean after the plan ends', async () => {
    // Flex can only be bought on an active plan; once that plan has run out the
    // purchase history is irrelevant and the watermark returns.
    withSubscription({ status: 'cancelled', currentPeriodEnd: new Date('2026-09-01T00:00:00Z') })
    await expect(shouldWatermarkVideo('user_flex_lapsed', NOW)).resolves.toBe(true)
    expect(mocks.topUp).not.toHaveBeenCalled()
  })
})
