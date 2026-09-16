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
  join: vi.fn(),
  oauthTokens: vi.fn(),
}))
vi.mock('@saas/db', () => ({
  DISCORD_WELCOME_CREDITS: 120,
  getDiscordWelcomeClaim: mocks.claim,
  grantDiscordWelcomeReward: mocks.grant,
  getCreditBalance: mocks.balance,
}))
vi.mock('@saas/shared', () => ({
  createLogger: () => ({ error: vi.fn(), info: vi.fn(), debug: vi.fn() }),
}))
vi.mock('@clerk/express', () => ({
  clerkClient: { users: { getUserOauthAccessToken: mocks.oauthTokens } },
}))
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
  joinDiscordGuild: mocks.join,
  discordRewardConfigured: () => true,
}))

import { DiscordMembershipError } from '../apps/api/src/lib/discord-membership.js'
import { router } from '../apps/api/src/routes/discord-reward.js'

const app = express().use(express.json()).use('/credits/discord', router)
const status = () => request(app).get('/credits/discord')
const claim = () => request(app).post('/credits/discord/claim')

beforeEach(() => {
  vi.resetAllMocks()
  mocks.userId = 'user_1'
  mocks.profile.mockResolvedValue({ discordUserId: '99887766' })
  mocks.claim.mockResolvedValue(null)
  mocks.balance.mockResolvedValue(160)
  mocks.membership.mockResolvedValue('12345678')
  mocks.join.mockResolvedValue('member')
  mocks.oauthTokens.mockResolvedValue({ data: [] })
  mocks.grant.mockResolvedValue({
    granted: true,
    claim: { userId: 'user_1', credits: 120, claimedAt: '2026-09-16T00:00:00.000Z' },
  })
})

describe('Discord community reward', () => {
  it('requires authentication for status and claiming', async () => {
    mocks.userId = null
    expect((await status()).status).toBe(401)
    expect((await claim()).status).toBe(401)
    expect(mocks.profile).not.toHaveBeenCalled()
  })

  it('settles the reward on a status read once the linked account is a member', async () => {
    const response = await status()
    expect(response.body).toEqual({
      state: 'claimed',
      credits: 120,
      configured: true,
      claimedAt: '2026-09-16T00:00:00.000Z',
      granted: true,
      blocker: null,
    })
    expect(response.headers['cache-control']).toBe('no-store')
    expect(mocks.membership).toHaveBeenCalledWith('99887766')
    expect(mocks.grant).toHaveBeenCalledWith('user_1', '99887766', '12345678')
  })

  it('reports what is still missing when the linked account has not joined', async () => {
    mocks.membership.mockRejectedValue(new DiscordMembershipError('Join the server first', 403))
    const response = await status()
    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({
      state: 'available',
      granted: false,
      blocker: 'Join the server first',
    })
    expect(mocks.grant).not.toHaveBeenCalled()
  })

  it('joins the server on behalf of the user when Clerk holds a Discord OAuth token', async () => {
    mocks.oauthTokens.mockResolvedValue({ data: [{ token: 'oauth-token' }] })
    await status()
    expect(mocks.oauthTokens).toHaveBeenCalledWith('user_1', 'discord')
    expect(mocks.join).toHaveBeenCalledWith('99887766', 'oauth-token')
    expect(mocks.membership).toHaveBeenCalledWith('99887766')
  })

  it('still verifies membership itself when joining on behalf fails', async () => {
    mocks.oauthTokens.mockRejectedValue(new Error('Clerk unavailable'))
    const response = await status()
    expect(response.body.state).toBe('claimed')
    expect(mocks.grant).toHaveBeenCalled()
  })

  it('never checks membership or grants for an unlinked account', async () => {
    mocks.profile.mockResolvedValue({ discordUserId: null })
    const response = await status()
    expect(response.body).toMatchObject({ state: 'unlinked', granted: false, blocker: null })
    expect(mocks.oauthTokens).not.toHaveBeenCalled()
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
