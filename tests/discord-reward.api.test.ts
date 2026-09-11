import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  userId: 'user_1' as string | null,
  profile: vi.fn(),
  claim: vi.fn(),
  grant: vi.fn(),
  balance: vi.fn(),
  membership: vi.fn(),
}))
vi.mock('@saas/db', () => ({
  DISCORD_WELCOME_CREDITS: 120,
  getDiscordWelcomeClaim: mocks.claim,
  grantDiscordWelcomeReward: mocks.grant,
  getCreditBalance: mocks.balance,
}))
vi.mock('@saas/shared', () => ({ createLogger: () => ({ error: vi.fn() }) }))
vi.mock('../apps/api/src/lib/clerk.js', () => ({ getVerifiedClerkProfile: mocks.profile }))
vi.mock('../apps/api/src/middleware/auth.js', () => ({
  requireAuth: (_req: unknown, res: express.Response) => {
    if (!mocks.userId) res.status(401).json({ error: 'Unauthorized' })
    return mocks.userId
  },
}))
vi.mock('../apps/api/src/lib/discord-membership.js', async importOriginal => ({
  ...(await importOriginal<typeof import('../apps/api/src/lib/discord-membership.js')>()),
  verifyDiscordMembership: mocks.membership,
  discordRewardConfigured: () => true,
}))

import { DiscordMembershipError } from '../apps/api/src/lib/discord-membership.js'
import { router } from '../apps/api/src/routes/discord-reward.js'

const app = express().use(express.json()).use('/credits/discord', router)
const claim = () => request(app).post('/credits/discord/claim')

beforeEach(() => {
  vi.resetAllMocks()
  mocks.userId = 'user_1'
  mocks.profile.mockResolvedValue({ discordUserId: '99887766' })
  mocks.claim.mockResolvedValue(null)
  mocks.balance.mockResolvedValue(160)
  mocks.membership.mockResolvedValue('12345678')
  mocks.grant.mockResolvedValue({ granted: true, claim: { userId: 'user_1', credits: 120 } })
})

describe('Discord community reward', () => {
  it('requires authentication for status and claiming', async () => {
    mocks.userId = null
    expect((await request(app).get('/credits/discord')).status).toBe(401)
    expect((await claim()).status).toBe(401)
    expect(mocks.profile).not.toHaveBeenCalled()
  })

  it('shows the current linking/claim state without granting or checking membership', async () => {
    const response = await request(app).get('/credits/discord')
    expect(response.body).toEqual({
      state: 'available',
      credits: 120,
      configured: true,
      claimedAt: null,
    })
    expect(response.headers['cache-control']).toBe('no-store')
    expect(mocks.membership).not.toHaveBeenCalled()
    expect(mocks.grant).not.toHaveBeenCalled()
  })

  it('uses the authenticated Clerk identity and configured guild, ignoring request-supplied values', async () => {
    const response = await claim().send({
      userId: 'attacker',
      discordUserId: '11111111',
      guildId: '22222222',
      credits: 99999,
    })
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ granted: true, credits: 120, balance: 160 })
    expect(mocks.profile).toHaveBeenCalledWith('user_1')
    expect(mocks.membership).toHaveBeenCalledWith('99887766')
    expect(mocks.grant).toHaveBeenCalledWith('user_1', '99887766', '12345678')
  })

  it('requires a current OAuth link even if an old profile mirror exists', async () => {
    mocks.profile.mockResolvedValue({ discordUserId: null })
    expect((await claim()).status).toBe(400)
    expect(mocks.membership).not.toHaveBeenCalled()
    expect(mocks.grant).not.toHaveBeenCalled()
  })

  it.each([403, 503, 429])('never grants when membership verification fails (%s)', async status => {
    mocks.membership.mockRejectedValue(
      new DiscordMembershipError('Try again', status, status === 429 ? 5 : undefined),
    )
    const response = await claim()
    expect(response.status).toBe(status)
    if (status === 429) expect(response.headers['retry-after']).toBe('5')
    expect(mocks.grant).not.toHaveBeenCalled()
  })

  it('returns a successful retry after the user has claimed, even if they have since unlinked', async () => {
    mocks.profile.mockResolvedValue({ discordUserId: null })
    mocks.claim.mockResolvedValue({ userId: 'user_1', credits: 120 })
    expect((await claim()).body).toEqual({ granted: false, credits: 120, balance: 160 })
    expect(mocks.membership).not.toHaveBeenCalled()
    expect(mocks.grant).not.toHaveBeenCalled()
  })

  it('blocks a Discord identity already rewarded on another Pitch account', async () => {
    mocks.claim.mockResolvedValue({ userId: 'original_owner', credits: 120 })
    const response = await claim()
    expect(response.status).toBe(409)
    expect(JSON.stringify(response.body)).not.toContain('original_owner')
    expect(mocks.grant).not.toHaveBeenCalled()
  })

  it('handles a different account winning a concurrent claim', async () => {
    mocks.grant.mockResolvedValue({
      granted: false,
      claim: { userId: 'original_owner', credits: 120 },
    })
    expect((await claim()).status).toBe(409)
  })
})
