import * as db from '@saas/db'
import { createLogger } from '@saas/shared'
import { type Response, Router } from 'express'
import { getVerifiedClerkProfile } from '../lib/clerk.js'
import {
  DiscordMembershipError,
  discordRewardConfigured,
  verifyDiscordMembership,
} from '../lib/discord-membership.js'
import { requireAuth } from '../middleware/auth.js'

export const router = Router()
const logger = createLogger('api:discord-reward')

async function rewardState(userId: string) {
  // Read Clerk afresh; the stored profile mirror may predate an unlink.
  const { discordUserId } = await getVerifiedClerkProfile(userId)
  const claim = await db.getDiscordWelcomeClaim(userId, discordUserId)
  const state = claim
    ? claim.userId === userId
      ? 'claimed'
      : 'discord-claimed'
    : discordUserId
      ? 'available'
      : 'unlinked'
  return { discordUserId, claim, state }
}

function fail(res: Response, error: unknown, userId: string) {
  if (error instanceof DiscordMembershipError) {
    if (error.retryAfter) res.set('Retry-After', String(error.retryAfter))
    return res.status(error.status).json({ error: error.message })
  }
  logger.error({ err: error, userId }, 'Discord reward failed')
  return res
    .status(500)
    .json({ error: 'Could not load or claim your Discord reward. Please try again.' })
}

router.get('/', async (req, res) => {
  const userId = requireAuth(req, res)
  if (!userId) return
  res.set('Cache-Control', 'no-store')
  try {
    const { state, claim } = await rewardState(userId)
    res.json({
      state,
      credits: db.DISCORD_WELCOME_CREDITS,
      configured: discordRewardConfigured(),
      claimedAt: state === 'claimed' ? claim?.claimedAt : null,
    })
  } catch (error) {
    fail(res, error, userId)
  }
})

router.post('/claim', async (req, res) => {
  const userId = requireAuth(req, res)
  if (!userId) return
  try {
    const { discordUserId, claim, state } = await rewardState(userId)
    if (state === 'discord-claimed') {
      return res
        .status(409)
        .json({ error: 'This Discord account has already claimed the welcome reward.' })
    }
    if (state === 'claimed') {
      return res.json({
        granted: false,
        credits: claim!.credits,
        balance: await db.getCreditBalance(userId),
      })
    }
    if (!discordUserId) {
      return res
        .status(400)
        .json({ error: 'Connect your Discord account before claiming the reward.' })
    }
    const guildId = await verifyDiscordMembership(discordUserId)
    const result = await db.grantDiscordWelcomeReward(userId, discordUserId, guildId)
    if (result.claim.userId !== userId) {
      return res
        .status(409)
        .json({ error: 'This Discord account has already claimed the welcome reward.' })
    }
    res.json({
      granted: result.granted,
      credits: result.claim.credits,
      balance: await db.getCreditBalance(userId),
    })
  } catch (error) {
    fail(res, error, userId)
  }
})
