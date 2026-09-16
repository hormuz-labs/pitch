import { clerkClient } from '@clerk/express'
import * as db from '@saas/db'
import { createLogger } from '@saas/shared'
import { type Response, Router } from 'express'
import { getVerifiedClerkProfile } from '../lib/clerk.js'
import {
  DiscordMembershipError,
  discordRewardConfigured,
  joinDiscordGuild,
  verifyDiscordMembership,
} from '../lib/discord-membership.js'
import { requireAuth } from '../middleware/auth.js'

export const router = Router()
const logger = createLogger('api:discord-reward')

type RewardState = 'unlinked' | 'available' | 'claimed' | 'discord-claimed'

interface Reward {
  state: RewardState
  credits: number
  configured: boolean
  claimedAt: Date | null
  /** True only on the read that actually added the credits. */
  granted: boolean
  /** Linked but not rewarded yet: what the user still has to do in Discord. */
  blocker: string | null
}

async function rewardState(userId: string) {
  // Read Clerk afresh; the stored profile mirror may predate an unlink.
  const { discordUserId } = await getVerifiedClerkProfile(userId)
  const claim = await db.getDiscordWelcomeClaim(userId, discordUserId)
  const state: RewardState = claim
    ? claim.userId === userId
      ? 'claimed'
      : 'discord-claimed'
    : discordUserId
      ? 'available'
      : 'unlinked'
  return { discordUserId, claim, state }
}

/**
 * Clerk keeps the Discord OAuth token. With the `guilds.join` scope on the
 * Discord connection the bot can add the member itself, so connecting the
 * account is the whole flow. Without it, this is a no-op and the user joins
 * by invite.
 */
async function joinOnBehalf(userId: string, discordUserId: string) {
  try {
    const tokens = await clerkClient.users.getUserOauthAccessToken(userId, 'discord')
    const token = tokens.data.find(item => item.token)
    if (!token) return
    const outcome = await joinDiscordGuild(discordUserId, token.token)
    if (outcome === 'joined' || outcome === 'pending') {
      logger.info({ userId, discordUserId, outcome }, 'Added the user to the Discord server')
    }
  } catch (error) {
    logger.debug({ err: error, userId }, 'Could not join the Discord server on behalf of the user')
  }
}

/**
 * Every read settles the reward: a linked member gets the credits right
 * there, so the page they come back to after connecting is the one that pays.
 */
async function settle(userId: string): Promise<Reward> {
  const { discordUserId, claim, state } = await rewardState(userId)
  const configured = discordRewardConfigured()
  const base = { credits: db.DISCORD_WELCOME_CREDITS, configured, granted: false, blocker: null }
  if (state === 'claimed') return { ...base, state, claimedAt: claim!.claimedAt }
  if (state !== 'available' || !configured || !discordUserId) {
    return { ...base, state, claimedAt: null }
  }
  try {
    await joinOnBehalf(userId, discordUserId)
    const guildId = await verifyDiscordMembership(discordUserId)
    const result = await db.grantDiscordWelcomeReward(userId, discordUserId, guildId)
    if (result.claim.userId !== userId) {
      return { ...base, state: 'discord-claimed', claimedAt: null }
    }
    if (result.granted) logger.info({ userId, discordUserId }, 'Discord welcome credits granted')
    return { ...base, state: 'claimed', granted: result.granted, claimedAt: result.claim.claimedAt }
  } catch (error) {
    if (error instanceof DiscordMembershipError) {
      return { ...base, state, claimedAt: null, blocker: error.message }
    }
    throw error
  }
}

function fail(res: Response, error: unknown, userId: string) {
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
    res.json(await settle(userId))
  } catch (error) {
    fail(res, error, userId)
  }
})

router.post('/claim', async (req, res) => {
  const userId = requireAuth(req, res)
  if (!userId) return
  try {
    const reward = await settle(userId)
    if (reward.state === 'discord-claimed') {
      return res
        .status(409)
        .json({ error: 'This Discord account has already claimed the welcome reward.' })
    }
    if (reward.state === 'unlinked') {
      return res
        .status(400)
        .json({ error: 'Connect your Discord account before claiming the reward.' })
    }
    if (reward.state === 'available') {
      return res.status(403).json({ error: reward.blocker ?? 'Join the Pitch Discord server.' })
    }
    res.json({
      granted: reward.granted,
      credits: reward.credits,
      balance: await db.getCreditBalance(userId),
    })
  } catch (error) {
    fail(res, error, userId)
  }
})
