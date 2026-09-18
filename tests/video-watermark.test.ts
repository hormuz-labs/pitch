import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  subscription: vi.fn(),
  topUp: vi.fn(),
}))

vi.mock('@saas/db', () => ({
  prisma: {
    subscription: { findFirst: mocks.subscription },
    topUpPurchase: { findFirst: mocks.topUp },
  },
}))

import { shouldWatermarkVideo } from '../apps/api/src/projects/watermark'

describe('video watermark entitlement', () => {
  beforeEach(() => {
    mocks.subscription.mockReset().mockResolvedValue(null)
    mocks.topUp.mockReset().mockResolvedValue(null)
  })

  it('watermarks accounts with no paid plan', async () => {
    await expect(shouldWatermarkVideo('user_free')).resolves.toBe(true)
  })

  it.each(['pro', 'max', 'enterprise'])('removes watermarks for the %s plan', async planKey => {
    mocks.subscription.mockResolvedValue({ id: `sub_${planKey}` })
    await expect(shouldWatermarkVideo(`user_${planKey}`)).resolves.toBe(false)
    expect(mocks.subscription).toHaveBeenCalledWith({
      where: { userId: `user_${planKey}`, status: 'active' },
      select: { id: true },
    })
  })

  it('removes watermarks after a Flex purchase', async () => {
    mocks.topUp.mockResolvedValue({ id: 'topup_flex' })
    await expect(shouldWatermarkVideo('user_flex')).resolves.toBe(false)
  })
})
