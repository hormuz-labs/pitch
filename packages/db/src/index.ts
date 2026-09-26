import { type Prisma, PrismaClient } from '@prisma/client'
import { enhance } from '@zenstackhq/runtime'
import * as dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '../../..')
dotenv.config({ path: path.join(rootDir, '.env') })

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const prisma = globalForPrisma.prisma ?? new PrismaClient({})

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma

export interface AuthUser extends Record<string, unknown> {
  id: string
}

export function getEnhancedPrisma(user?: AuthUser) {
  return enhance(prisma, { user })
}

// ─── Credits ──────────────────────────────────────────────────────────────────
//
// Balance is always computed as SUM(CreditTransaction.delta) WHERE userId = ?
// There is no separate mutable balance counter — the ledger IS the truth.
//
// Transaction types:
//   subscription_grant  — monthly credits from a subscription cycle
//   topup_grant         — credits from a one-time top-up purchase
//   usage               — credits spent on a job (negative delta)
//   refund              — credits returned when a job fails
//   admin_adjustment    — manual grant or deduction by an admin
//   promo               — promotional credits (e.g. beta sign-up bonus)

export type CreditTransactionType =
  | 'subscription_grant'
  | 'topup_grant'
  | 'usage'
  | 'refund'
  | 'admin_adjustment'
  | 'promo'
  | 'referral'

export type CreditChannel = 'product' | 'api' | 'discord'

function utcDayRange(now: Date): { gte: Date; lt: Date } {
  const day = now.toISOString().slice(0, 10)
  const gte = new Date(`${day}T00:00:00.000Z`)
  return { gte, lt: new Date(gte.getTime() + 24 * 60 * 60 * 1000) }
}

/**
 * Calculates the user's main Pitch balance, excluding Discord sponsorship.
 * Returns 0 if the user has no transactions yet.
 */
export async function getCreditBalance(
  userId: string,
  client: PrismaClient | Prisma.TransactionClient = prisma,
): Promise<number> {
  const agg = await client.creditTransaction.aggregate({
    where: { userId, channel: { not: 'discord' } },
    _sum: { delta: true },
  })
  return agg._sum.delta ?? 0
}

async function lockCreditAccount(tx: Prisma.TransactionClient, userId: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM "UserProfile" WHERE id = ${userId} FOR UPDATE`
}

export async function getAvailableCreditBalance(
  userId: string,
  client: PrismaClient | Prisma.TransactionClient = prisma,
): Promise<number> {
  const [balance, held] = await Promise.all([
    getCreditBalance(userId, client),
    client.creditReservation.aggregate({
      where: { userId, status: 'pending' },
      _sum: { credits: true },
    }),
  ])
  return balance - (held._sum.credits ?? 0)
}

export async function reserveCredits(input: {
  key: string
  userId: string
  projectId: string
  channel?: CreditChannel
  kind: string
  durationSeconds?: number
  credits: number
  /**
   * When set, a balance below `credits` but at least this much still starts:
   * the hold shrinks to what is available. The hold is an affordability check,
   * not a price, and live metering stops the turn if real spend outruns it.
   */
  minCredits?: number
}) {
  return prisma.$transaction(async tx => {
    await lockCreditAccount(tx, input.userId)
    const existing = await tx.creditReservation.findUnique({ where: { key: input.key } })
    if (existing?.status === 'pending' || existing?.status === 'settled') return existing
    const available = await getAvailableCreditBalance(input.userId, tx)
    const required = Math.min(input.credits, input.minCredits ?? input.credits)
    if (available < required)
      throw new Error(`Insufficient credits: balance is ${available}, need ${required}`)
    const credits = Math.min(input.credits, available)
    if (existing)
      return tx.creditReservation.update({
        where: { id: existing.id },
        data: {
          channel: input.channel ?? 'product',
          kind: input.kind,
          durationSeconds: input.durationSeconds,
          credits,
          status: 'pending',
          settledCredits: null,
        },
      })
    return tx.creditReservation.create({
      data: {
        key: input.key,
        userId: input.userId,
        projectId: input.projectId,
        channel: input.channel ?? 'product',
        kind: input.kind,
        durationSeconds: input.durationSeconds,
        credits,
      },
    })
  })
}

export async function getCreditReservation(key: string) {
  return prisma.creditReservation.findUnique({ where: { key } })
}

/**
 * Settle a hold for what the work measured. With `capAtAvailable`, a turn that
 * overran the balance between live checks takes the balance to zero and the
 * rest is written off, instead of failing and leaving the hold pending.
 */
export async function settleCreditReservation(
  key: string,
  credits: number,
  opts: { capAtAvailable?: boolean } = {},
): Promise<number> {
  return prisma.$transaction(async tx => {
    const reservation = await tx.creditReservation.findUnique({ where: { key } })
    if (!reservation) throw new Error(`Credit reservation not found: ${key}`)
    await lockCreditAccount(tx, reservation.userId)
    const current = await tx.creditReservation.findUnique({ where: { key } })
    if (!current) throw new Error(`Credit reservation not found: ${key}`)
    if (current.status === 'settled') return current.settledCredits ?? 0
    if (current.status !== 'pending') return 0
    const amount = Math.max(0, Math.floor(credits))
    const [balance, otherHeld] = await Promise.all([
      getCreditBalance(current.userId, tx),
      tx.creditReservation.aggregate({
        where: { userId: current.userId, status: 'pending', id: { not: current.id } },
        _sum: { credits: true },
      }),
    ])
    const available = balance - (otherHeld._sum.credits ?? 0)
    if (amount > available && !opts.capAtAvailable)
      throw new Error(`Insufficient credits: balance is ${available}, need ${amount}`)
    const charged = Math.min(amount, Math.max(0, available))
    if (charged > 0)
      await tx.creditTransaction.create({
        data: {
          userId: current.userId,
          delta: -charged,
          type: 'usage',
          description: `Generation: ${current.kind}`,
          projectId: current.projectId,
          channel: current.channel,
          idempotencyKey: `settlement:${current.id}`,
        },
      })
    await tx.creditReservation.update({
      where: { id: current.id },
      data: { status: 'settled', settledCredits: charged },
    })
    return charged
  })
}

export async function releaseCreditReservation(key: string): Promise<void> {
  await prisma.creditReservation.updateMany({
    where: { key, status: 'pending' },
    data: { status: 'released' },
  })
}

/** Historical daily sponsorship stays separate; new welcome grants use product credits. */
export async function getDiscordCreditBalance(
  userId: string,
  client: PrismaClient | Prisma.TransactionClient = prisma,
  now: Date = new Date(),
): Promise<number> {
  const agg = await client.creditTransaction.aggregate({
    where: { userId, channel: 'discord', createdAt: utcDayRange(now) },
    _sum: { delta: true },
  })
  return agg._sum.delta ?? 0
}

/**
 * Adds credits to a user's balance by writing a CreditTransaction.
 * Uses idempotencyKey to prevent double-grants (e.g. duplicate webhooks).
 * Returns the new calculated balance.
 */
export async function addCredits(
  userId: string,
  amount: number,
  type: CreditTransactionType,
  description: string,
  opts?: {
    projectId?: string
    subscriptionId?: string
    topUpId?: string
    idempotencyKey?: string
    channel?: CreditChannel
    // Run inside an existing transaction so the grant is atomic with its caller.
    tx?: Prisma.TransactionClient
  },
): Promise<number> {
  const client = opts?.tx ?? prisma

  // Check idempotency — skip if we've already processed this key
  if (opts?.idempotencyKey) {
    const existing = await client.creditTransaction.findUnique({
      where: { idempotencyKey: opts.idempotencyKey },
    })
    if (existing) {
      console.log(`[Credits] Skipped duplicate grant (key: ${opts.idempotencyKey})`)
      return opts.channel === 'discord'
        ? getDiscordCreditBalance(userId, client)
        : getCreditBalance(userId, client)
    }
  }

  try {
    await client.creditTransaction.create({
      data: {
        userId,
        delta: amount,
        type,
        description,
        projectId: opts?.projectId,
        subscriptionId: opts?.subscriptionId,
        topUpId: opts?.topUpId,
        idempotencyKey: opts?.idempotencyKey,
        channel: opts?.channel ?? 'product',
      },
    })
  } catch (err: any) {
    if (
      opts?.idempotencyKey &&
      (err?.code === 'P2002' || err?.message?.includes('Unique constraint failed'))
    ) {
      console.log(`[Credits] Skipped duplicate grant race condition (key: ${opts.idempotencyKey})`)
      return opts?.channel === 'discord'
        ? await getDiscordCreditBalance(userId, client)
        : await getCreditBalance(userId, client)
    }
    throw err
  }

  const newBalance =
    opts?.channel === 'discord'
      ? await getDiscordCreditBalance(userId, client)
      : await getCreditBalance(userId, client)
  console.log(`[Credits] +${amount} (${type}) for user ${userId}. New balance: ${newBalance}`)
  return newBalance
}

export const DISCORD_WELCOME_CAMPAIGN = 'discord-welcome-v1'
/** About one finished teaser (~630 credits on Flash), so a new user sees a whole video. */
export const DISCORD_WELCOME_CREDITS = 750

export async function getDiscordWelcomeClaim(userId: string, discordUserId: string | null) {
  const campaignId = DISCORD_WELCOME_CAMPAIGN
  const [userClaim, discordClaim] = await Promise.all([
    prisma.discordRewardClaim.findUnique({ where: { campaignId_userId: { campaignId, userId } } }),
    discordUserId
      ? prisma.discordRewardClaim.findUnique({
          where: { campaignId_discordUserId: { campaignId, discordUserId } },
        })
      : null,
  ])
  return userClaim ?? discordClaim
}

/** Called only after server-side OAuth ownership and guild membership checks. */
export async function grantDiscordWelcomeReward(
  userId: string,
  discordUserId: string,
  guildId: string,
) {
  const existing = await getDiscordWelcomeClaim(userId, discordUserId)
  if (existing) return { granted: false, claim: existing }
  try {
    return await prisma.$transaction(async tx => {
      const credit = await tx.creditTransaction.create({
        data: {
          userId,
          delta: DISCORD_WELCOME_CREDITS,
          type: 'promo',
          channel: 'product',
          description: 'Discord community welcome reward',
          idempotencyKey: `promo:${DISCORD_WELCOME_CAMPAIGN}:${userId}`,
        },
      })
      const claim = await tx.discordRewardClaim.create({
        data: {
          campaignId: DISCORD_WELCOME_CAMPAIGN,
          userId,
          discordUserId,
          guildId,
          credits: DISCORD_WELCOME_CREDITS,
          creditTransactionId: credit.id,
        },
      })
      return { granted: true, claim }
    })
  } catch (error: any) {
    // Either unique identity can win a concurrent claim. The losing ledger
    // write rolls back with the receipt; return the winner on a safe retry.
    if (error?.code === 'P2002') {
      const claim = await getDiscordWelcomeClaim(userId, discordUserId)
      if (claim) return { granted: false, claim }
    }
    throw error
  }
}

/** Refund actual charges to their original pools, including historical sponsorship. */
export async function refundProjectUsage(userId: string, projectId: string): Promise<void> {
  await prisma.$transaction(async tx => {
    // Older refunds covered the entire project under this key.
    if (
      await tx.creditTransaction.findUnique({
        where: { idempotencyKey: `refund:project:${projectId}` },
      })
    )
      return
    const charges = await tx.creditTransaction.groupBy({
      by: ['channel'],
      where: { userId, projectId, type: 'usage' },
      _sum: { delta: true },
    })
    for (const charge of charges) {
      const credits = -(charge._sum.delta ?? 0)
      if (credits <= 0) continue
      await addCredits(userId, credits, 'refund', 'Refund: the project produced nothing', {
        projectId,
        idempotencyKey: `refund:project:${projectId}:${charge.channel}`,
        channel: charge.channel as CreditChannel,
        tx,
      })
    }
  })
}

/**
 * Deducts credits from a user atomically (inside a serializable transaction).
 * Throws "Insufficient credits" if balance < amount.
 * Returns the new balance on success.
 */
export async function deductCredit(
  userId: string,
  amount: number,
  description: string,
  opts?: {
    projectId?: string
    idempotencyKey?: string
    /** Which surface spent it — drives the usage chart's app/API split. */
    channel?: CreditChannel
  },
): Promise<number> {
  const result = await prisma.$transaction(async tx => {
    await lockCreditAccount(tx, userId)
    const channel = opts?.channel ?? 'product'
    // Compute current balance inside the transaction to prevent races
    const agg = await tx.creditTransaction.aggregate({
      where:
        channel === 'discord'
          ? { userId, channel, createdAt: utcDayRange(new Date()) }
          : { userId, channel: { not: 'discord' } },
      _sum: { delta: true },
    })
    const current = agg._sum.delta ?? 0

    if (current < amount) {
      throw new Error(`Insufficient credits: balance is ${current}, need ${amount}`)
    }

    await tx.creditTransaction.create({
      data: {
        userId,
        delta: -amount,
        type: 'usage',
        description,
        projectId: opts?.projectId,
        idempotencyKey: opts?.idempotencyKey,
        channel,
      },
    })

    return current - amount
  })

  console.log(`[Credits] -${amount} (usage) for user ${userId}. New balance: ${result}`)
  return result
}

/**
 * Charge up to `amount`: whatever the account can still spend, down to zero,
 * and return what was charged. Runs under the account lock and counts other
 * jobs' holds as spent, so two turns finishing at once can never take the
 * balance below zero or spend credits another job is holding.
 */
export async function deductUpTo(
  userId: string,
  amount: number,
  description: string,
  opts?: { projectId?: string; channel?: CreditChannel },
): Promise<number> {
  const wanted = Math.max(0, Math.floor(amount))
  if (!wanted) return 0
  return prisma.$transaction(async tx => {
    await lockCreditAccount(tx, userId)
    const channel = opts?.channel ?? 'product'
    const available =
      channel === 'discord'
        ? await getDiscordCreditBalance(userId, tx)
        : await getAvailableCreditBalance(userId, tx)
    const charged = Math.min(wanted, Math.max(0, available))
    if (charged > 0)
      await tx.creditTransaction.create({
        data: {
          userId,
          delta: -charged,
          type: 'usage',
          description,
          projectId: opts?.projectId,
          channel,
        },
      })
    return charged
  })
}

/**
 * Returns the main Pitch transaction history, excluding Discord sponsorship.
 */
export async function getCreditTransactions(userId: string) {
  return prisma.creditTransaction.findMany({
    where: { userId, channel: { not: 'discord' } },
    orderBy: { createdAt: 'desc' },
  })
}

// ─── Subscriptions ────────────────────────────────────────────────────────────

/**
 * Upserts a Subscription record when a Dodo subscription.active or
 * subscription.renewed event fires. Also grants credits for the new cycle.
 *
 * Returns the subscription record.
 */
export async function upsertSubscription(data: {
  userId: string
  dodoSubscriptionId: string
  planKey: string
  status: string
  creditsPerCycle: number
  currentPeriodStart: Date
  currentPeriodEnd: Date
  idempotencyKey: string // e.g. "sub_grant:<subscriptionId>:initial" or "sub_grant:<subscriptionId>:<YYYY-MM-DD>"
}) {
  return prisma.$transaction(async tx => {
    // Upsert the subscription row
    const subscription = await tx.subscription.upsert({
      where: { dodoSubscriptionId: data.dodoSubscriptionId },
      create: {
        userId: data.userId,
        dodoSubscriptionId: data.dodoSubscriptionId,
        planKey: data.planKey,
        status: data.status,
        creditsPerCycle: data.creditsPerCycle,
        currentPeriodStart: data.currentPeriodStart,
        currentPeriodEnd: data.currentPeriodEnd,
      },
      update: {
        status: data.status,
        planKey: data.planKey,
        creditsPerCycle: data.creditsPerCycle,
        currentPeriodStart: data.currentPeriodStart,
        currentPeriodEnd: data.currentPeriodEnd,
      },
    })

    // If this is an initial grant request, guard against duplicate initial grants
    // even if an existing grant was written under an older or differing key format.
    if (data.idempotencyKey.endsWith(':initial')) {
      const existingGrant = await tx.creditTransaction.findFirst({
        where: {
          subscriptionId: subscription.id,
          type: 'subscription_grant',
        },
      })
      if (existingGrant) {
        console.log(
          `[Credits] Skipped duplicate initial subscription grant for sub ${data.dodoSubscriptionId}`,
        )
        return subscription
      }
    }

    // Grant credits (idempotent — safe to call multiple times)
    await addCredits(
      data.userId,
      data.creditsPerCycle,
      'subscription_grant',
      `${data.planKey} plan — ${data.creditsPerCycle} credits for cycle starting ${data.currentPeriodStart.toISOString().slice(0, 10)}`,
      {
        subscriptionId: subscription.id,
        idempotencyKey: data.idempotencyKey,
        tx,
      },
    )

    return subscription
  })
}

/**
 * Marks a subscription as cancelled.
 */
export async function cancelSubscription(dodoSubscriptionId: string) {
  return prisma.subscription.update({
    where: { dodoSubscriptionId },
    data: { status: 'cancelled', cancelledAt: new Date() },
  })
}

/**
 * Ends a subscription without changing its credit ledger. Plan capabilities
 * stop with the subscription, while every credit already granted remains
 * available until the user spends it.
 */
export async function endSubscription(dodoSubscriptionId: string, status: string) {
  return prisma.subscription.update({
    where: { dodoSubscriptionId },
    data: { status, cancelledAt: new Date() },
  })
}

/**
 * Returns the active subscription for a user, if any.
 */
export async function getActiveSubscription(userId: string) {
  return prisma.subscription.findFirst({
    where: { userId, status: 'active' },
    orderBy: { createdAt: 'desc' },
  })
}

/**
 * Returns all subscriptions for a user (history).
 */
export async function getSubscriptions(userId: string) {
  return prisma.subscription.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  })
}

// ─── Top-Up Purchases ─────────────────────────────────────────────────────────

/**
 * Records a completed one-time top-up purchase and grants credits.
 * Idempotent — safe to call from both webhook and polling fallback.
 */
export async function recordTopUp(data: {
  userId: string
  dodoPaymentId: string
  packKey: string
  credits: number
  amountUsd: number
}) {
  return prisma.$transaction(async tx => {
    const existing = await tx.topUpPurchase.findUnique({
      where: { dodoPaymentId: data.dodoPaymentId },
    })
    if (existing) {
      console.log(`[Credits] Skipped duplicate top-up (paymentId: ${data.dodoPaymentId})`)
      return existing
    }

    const topUp = await tx.topUpPurchase.create({
      data: {
        userId: data.userId,
        dodoPaymentId: data.dodoPaymentId,
        packKey: data.packKey,
        credits: data.credits,
        amountUsd: data.amountUsd,
      },
    })

    await addCredits(
      data.userId,
      data.credits,
      'topup_grant',
      `Top-up: ${data.credits} credits ($${data.amountUsd.toFixed(2)})`,
      {
        topUpId: topUp.id,
        idempotencyKey: `topup_grant:${data.dodoPaymentId}`,
        tx,
      },
    )

    return topUp
  })
}

/**
 * Returns all top-up purchases for a user, newest first.
 */
export async function getTopUpPurchases(userId: string) {
  return prisma.topUpPurchase.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  })
}

/**
 * Returns a full billing summary for a user:
 * - current credit balance (calculated)
 * - active subscription (if any)
 * - top-up purchase history
 * - full transaction ledger
 */
export async function getCreditSummary(userId: string) {
  const [balance, activeSubscription, subscriptions, topUps, transactions] = await Promise.all([
    getCreditBalance(userId),
    getActiveSubscription(userId),
    getSubscriptions(userId),
    getTopUpPurchases(userId),
    getCreditTransactions(userId),
  ])

  return { balance, activeSubscription, subscriptions, topUps, transactions }
}

// ─── User Profiles ────────────────────────────────────────────────────────────

export interface UserProfileData {
  id: string
  email: string
  firstName?: string | null
  lastName?: string | null
  imageUrl?: string | null
  discordUserId?: string | null
}

/**
 * Upserts a Clerk user's profile into the database.
 * Called on every sign-in to keep details up to date.
 */
export async function upsertUser(data: UserProfileData) {
  console.log(`[DB] Upserting user profile for ${data.id} (${data.email})`)
  return prisma.userProfile.upsert({
    where: { id: data.id },
    create: {
      id: data.id,
      email: data.email,
      firstName: data.firstName,
      lastName: data.lastName,
      imageUrl: data.imageUrl,
      discordUserId: data.discordUserId,
    },
    update: {
      email: data.email,
      firstName: data.firstName,
      lastName: data.lastName,
      imageUrl: data.imageUrl,
      discordUserId: data.discordUserId,
    },
  })
}

// ── Affiliate Program ─────────────────────────────────────────────────────────

import { randomBytes } from 'crypto'

/** Generate a unique, human-readable affiliate code like "MUKUND-X7K2" */
export function generateAffiliateCode(firstName: string): string {
  const prefix =
    firstName
      .toUpperCase()
      .replace(/[^A-Z]/g, '')
      .slice(0, 6) || 'REF'
  const suffix = randomBytes(2).toString('hex').toUpperCase()
  return `${prefix}-${suffix}`
}

/** Register a new influencer — idempotent, returns existing if already registered */
export async function registerAffiliate(userId: string, firstName: string) {
  const existing = await prisma.affiliate.findUnique({ where: { userId } })
  if (existing) return existing

  // Collision-safe: retry if generated code already exists
  let code = generateAffiliateCode(firstName)
  while (await prisma.affiliate.findUnique({ where: { code } })) {
    code = generateAffiliateCode(firstName)
  }

  return prisma.affiliate.create({ data: { userId, code } })
}

/** Get an affiliate by userId */
export async function getAffiliateByUserId(userId: string) {
  return prisma.affiliate.findUnique({ where: { userId } })
}

/** Get an affiliate by their referral code (public lookup for redirect) */
export async function getAffiliateByCode(code: string) {
  return prisma.affiliate.findUnique({ where: { code } })
}

/** Record a single link click */
export async function createAffiliateClick(data: {
  affiliateId: string
  ip?: string
  userAgent?: string
  platform?: string
  refPage?: string
}) {
  return prisma.affiliateClick.create({ data })
}

/**
 * Records a referred signup and grants the launch referral rewards in credits.
 * The new user gets `newUserReward`, the referrer gets `referrerReward`.
 * No-op (returns { rewarded: false }) for an inactive/missing affiliate, a
 * self-referral, or a user who has already been recorded as a lead.
 */
export async function recordReferralSignup(data: {
  affiliateId: string
  clickId?: string
  newUserId: string
  newUserReward: number
  referrerReward: number
}): Promise<{ rewarded: boolean }> {
  const affiliate = await prisma.affiliate.findUnique({ where: { id: data.affiliateId } })
  if (affiliate?.status !== 'active') return { rewarded: false }
  if (affiliate.userId === data.newUserId) return { rewarded: false } // self-referral

  const existing = await prisma.affiliateLead.findUnique({
    where: { referredUserId: data.newUserId },
  })
  if (existing) return { rewarded: false } // already attributed — idempotent

  // Lead + both credit grants are atomic: a failure rolls everything back, so we
  // never leave an orphan lead that would block the rewards from ever landing.
  // The new-user bonus is a 'promo' welcome credit (not a referrer earning), so
  // affiliate "credits earned" stats (which sum type:'referral') exclude it.
  await prisma.$transaction(async tx => {
    await tx.affiliateLead.create({
      data: {
        affiliateId: data.affiliateId,
        clickId: data.clickId,
        referredUserId: data.newUserId,
      },
    })

    if (data.newUserReward > 0) {
      await addCredits(data.newUserId, data.newUserReward, 'promo', 'Referral signup bonus', {
        idempotencyKey: `ref_signup_user:${data.newUserId}`,
        tx,
      })
    }
    if (data.referrerReward > 0) {
      await addCredits(
        affiliate.userId,
        data.referrerReward,
        'referral',
        'Referral signup reward',
        {
          idempotencyKey: `ref_signup_aff:${data.newUserId}`,
          tx,
        },
      )
    }
  })

  return { rewarded: true }
}

/**
 * Records a referred user's first purchase and grants the referrer
 * `referrerReward` credits. No cash commission. No-op for an inactive/missing
 * affiliate, a self-referral, or a user who has already converted.
 */
export async function recordReferralConversion(data: {
  affiliateId: string
  referredUserId: string
  referrerReward: number
  clickId?: string
  saleAmountUsd?: number
  dodoSessionId?: string
}): Promise<{ rewarded: boolean }> {
  const affiliate = await prisma.affiliate.findUnique({ where: { id: data.affiliateId } })
  if (affiliate?.status !== 'active') return { rewarded: false }
  if (affiliate.userId === data.referredUserId) return { rewarded: false } // self-referral

  const existing = await prisma.affiliateConversion.findUnique({
    where: {
      affiliateId_referredUserId: {
        affiliateId: data.affiliateId,
        referredUserId: data.referredUserId,
      },
    },
  })
  if (existing) return { rewarded: false } // already converted — idempotent

  // Conversion record + referrer reward are atomic: a failure rolls both back,
  // so we never leave a conversion row that would block the reward on retry.
  await prisma.$transaction(async tx => {
    await tx.affiliateConversion.create({
      data: {
        affiliateId: data.affiliateId,
        clickId: data.clickId,
        referredUserId: data.referredUserId,
        saleAmountUsd: data.saleAmountUsd ?? 0,
        status: 'approved',
        dodoSessionId: data.dodoSessionId,
      },
    })

    if (data.referrerReward > 0) {
      await addCredits(
        affiliate.userId,
        data.referrerReward,
        'referral',
        'Referral purchase reward',
        {
          idempotencyKey: `ref_purchase:${data.affiliateId}:${data.referredUserId}`,
          tx,
        },
      )
    }
  })

  return { rewarded: true }
}

/**
 * Aggregated stats for the referral dashboard. Rewards are paid in credits, so
 * we report counts plus the credits the referrer has earned (and the equivalent
 * number of free videos). No cash/commission/payout figures.
 */
export async function getAffiliateStats(affiliateId: string) {
  const affiliate = await prisma.affiliate.findUnique({ where: { id: affiliateId } })

  const [clicks, signups, conversions, creditAgg] = await Promise.all([
    prisma.affiliateClick.count({ where: { affiliateId } }),
    prisma.affiliateLead.count({ where: { affiliateId } }),
    prisma.affiliateConversion.count({ where: { affiliateId } }),
    affiliate
      ? prisma.creditTransaction.aggregate({
          where: { userId: affiliate.userId, type: 'referral' },
          _sum: { delta: true },
        })
      : Promise.resolve({ _sum: { delta: 0 } }),
  ])

  const creditsEarned = creditAgg._sum.delta ?? 0

  return {
    clicks,
    signups,
    conversions,
    creditsEarned,
    videosEarned: Math.floor(creditsEarned / CREDITS_PER_VIDEO),
  }
}

/**
 * Roughly what a narrated demo video costs in credits (see
 * tests/credit-pricing.test.ts). Used to show earned credits as videos.
 */
export const CREDITS_PER_VIDEO = 120

export * from './browser-profiles.js'

// ── API keys (MCP / programmatic access) ──────────────────────────────────────
//
// The full key is only ever shown once at creation time — the DB stores its
// SHA-256 hash (`keyHash`) and a display `prefix`. `findApiKeyByHash` is the
// auth bootstrap for the /mcp endpoint, so it deliberately uses the raw client
// (there is no authenticated user context yet at that point).

export interface ApiKey {
  id: string
  userId: string
  name: string
  prefix: string
  lastUsedAt?: Date
  revokedAt?: Date
  createdAt: Date
}

export async function createApiKey(
  data: { userId: string; name: string; prefix: string; keyHash: string },
  user?: AuthUser,
): Promise<ApiKey> {
  const client = getEnhancedPrisma(user)
  const created = await client.apiKey.create({ data })
  return serializeApiKey(created)
}

export async function listApiKeys(user: AuthUser): Promise<ApiKey[]> {
  const client = getEnhancedPrisma(user)
  const keys = await client.apiKey.findMany({ orderBy: { createdAt: 'desc' } })
  return keys.map(serializeApiKey)
}

/** Revoke a key by setting revokedAt. Returns null when the key is not found/owned. */
export async function revokeApiKey(id: string, user: AuthUser): Promise<ApiKey | null> {
  const client = getEnhancedPrisma(user)
  const existing = await client.apiKey.findUnique({ where: { id } })
  if (!existing) return null
  const updated = await client.apiKey.update({ where: { id }, data: { revokedAt: new Date() } })
  return serializeApiKey(updated)
}

/** Raw-client lookup by SHA-256 hash — used by API-key auth before any user context exists. */
export async function findApiKeyByHash(keyHash: string) {
  return prisma.apiKey.findUnique({ where: { keyHash } })
}

/** Fire-and-forget lastUsedAt bump after a successful API-key authentication. */
export async function touchApiKey(id: string): Promise<void> {
  await prisma.apiKey.update({ where: { id }, data: { lastUsedAt: new Date() } })
}

function serializeApiKey(key: any): ApiKey {
  return {
    id: key.id,
    userId: key.userId,
    name: key.name,
    prefix: key.prefix,
    lastUsedAt: key.lastUsedAt ?? undefined,
    revokedAt: key.revokedAt ?? undefined,
    createdAt: key.createdAt,
  }
}

// ── Webhook Endpoints & Deliveries ──────────────────────────────────────────────

export interface WebhookEndpoint {
  id: string
  userId: string
  url: string
  secret: string
  events: string[]
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

export interface WebhookDelivery {
  id: string
  endpointId?: string | null
  userId: string
  jobId: string
  event: string
  payload: Record<string, unknown>
  status: 'PENDING' | 'SUCCESS' | 'FAILED'
  statusCode?: number | null
  responseBody?: string | null
  error?: string | null
  attempts: number
  maxAttempts: number
  nextRetryAt?: Date | null
  createdAt: Date
  updatedAt: Date
}

function serializeWebhookEndpoint(ep: any): WebhookEndpoint {
  let eventsList: string[] = ['job.completed', 'job.failed']
  try {
    if (ep.events) eventsList = typeof ep.events === 'string' ? JSON.parse(ep.events) : ep.events
  } catch {}

  return {
    id: ep.id,
    userId: ep.userId,
    url: ep.url,
    secret: ep.secret,
    events: eventsList,
    isActive: ep.isActive,
    createdAt: ep.createdAt,
    updatedAt: ep.updatedAt,
  }
}

function serializeWebhookDelivery(d: any): WebhookDelivery {
  let parsedPayload: Record<string, unknown> = {}
  try {
    if (d.payload) parsedPayload = typeof d.payload === 'string' ? JSON.parse(d.payload) : d.payload
  } catch {}

  return {
    id: d.id,
    endpointId: d.endpointId ?? undefined,
    userId: d.userId,
    jobId: d.jobId,
    event: d.event,
    payload: parsedPayload,
    status: d.status as 'PENDING' | 'SUCCESS' | 'FAILED',
    statusCode: d.statusCode ?? undefined,
    responseBody: d.responseBody ?? undefined,
    error: d.error ?? undefined,
    attempts: d.attempts,
    maxAttempts: d.maxAttempts,
    nextRetryAt: d.nextRetryAt ?? undefined,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  }
}

export async function createWebhookEndpoint(
  data: {
    userId: string
    url: string
    secret?: string
    events?: string[]
    isActive?: boolean
  },
  user?: AuthUser,
): Promise<WebhookEndpoint> {
  const client = getEnhancedPrisma(user)
  const secret = data.secret || `whsec_${randomBytes(16).toString('hex')}`
  const events = JSON.stringify(data.events ?? ['job.completed', 'job.failed'])

  const created = await client.webhookEndpoint.create({
    data: {
      userId: data.userId,
      url: data.url,
      secret,
      events,
      isActive: data.isActive ?? true,
    },
  })
  return serializeWebhookEndpoint(created)
}

export async function listWebhookEndpoints(user: AuthUser): Promise<WebhookEndpoint[]> {
  const client = getEnhancedPrisma(user)
  const endpoints = await client.webhookEndpoint.findMany({
    orderBy: { createdAt: 'desc' },
  })
  return endpoints.map(serializeWebhookEndpoint)
}

export async function getWebhookEndpoint(
  id: string,
  user: AuthUser,
): Promise<WebhookEndpoint | null> {
  const client = getEnhancedPrisma(user)
  const endpoint = await client.webhookEndpoint.findUnique({ where: { id } })
  return endpoint ? serializeWebhookEndpoint(endpoint) : null
}

export async function updateWebhookEndpoint(
  id: string,
  data: {
    url?: string
    secret?: string
    events?: string[]
    isActive?: boolean
  },
  user: AuthUser,
): Promise<WebhookEndpoint | null> {
  const client = getEnhancedPrisma(user)
  const existing = await client.webhookEndpoint.findUnique({ where: { id } })
  if (!existing) return null

  const updateData: any = {}
  if (data.url !== undefined) updateData.url = data.url
  if (data.secret !== undefined) updateData.secret = data.secret
  if (data.events !== undefined) updateData.events = JSON.stringify(data.events)
  if (data.isActive !== undefined) updateData.isActive = data.isActive

  const updated = await client.webhookEndpoint.update({
    where: { id },
    data: updateData,
  })
  return serializeWebhookEndpoint(updated)
}

export async function deleteWebhookEndpoint(id: string, user: AuthUser): Promise<boolean> {
  const client = getEnhancedPrisma(user)
  const existing = await client.webhookEndpoint.findUnique({ where: { id } })
  if (!existing) return false

  await client.webhookEndpoint.delete({ where: { id } })
  return true
}

export async function listActiveWebhookEndpointsForUser(
  userId: string,
): Promise<WebhookEndpoint[]> {
  const endpoints = await prisma.webhookEndpoint.findMany({
    where: { userId, isActive: true },
  })
  return endpoints.map(serializeWebhookEndpoint)
}

export async function createWebhookDelivery(data: {
  endpointId?: string
  userId: string
  jobId: string
  event: string
  payload: Record<string, unknown>
  maxAttempts?: number
}): Promise<WebhookDelivery> {
  const created = await prisma.webhookDelivery.create({
    data: {
      endpointId: data.endpointId,
      userId: data.userId,
      jobId: data.jobId,
      event: data.event,
      payload: JSON.stringify(data.payload),
      status: 'PENDING',
      maxAttempts: data.maxAttempts ?? 5,
    },
  })
  return serializeWebhookDelivery(created)
}

export async function updateWebhookDelivery(
  id: string,
  data: {
    status?: 'PENDING' | 'SUCCESS' | 'FAILED'
    statusCode?: number | null
    responseBody?: string | null
    error?: string | null
    attempts?: number
    nextRetryAt?: Date | null
  },
): Promise<WebhookDelivery> {
  const updated = await prisma.webhookDelivery.update({
    where: { id },
    data: {
      ...(data.status !== undefined ? { status: data.status } : {}),
      ...(data.statusCode !== undefined ? { statusCode: data.statusCode } : {}),
      ...(data.responseBody !== undefined ? { responseBody: data.responseBody } : {}),
      ...(data.error !== undefined ? { error: data.error } : {}),
      ...(data.attempts !== undefined ? { attempts: data.attempts } : {}),
      ...(data.nextRetryAt !== undefined ? { nextRetryAt: data.nextRetryAt } : {}),
    },
  })
  return serializeWebhookDelivery(updated)
}

export async function listWebhookDeliveries(
  user: AuthUser,
  opts?: { jobId?: string; limit?: number },
): Promise<WebhookDelivery[]> {
  const client = getEnhancedPrisma(user)
  const deliveries = await client.webhookDelivery.findMany({
    where: {
      ...(opts?.jobId ? { jobId: opts.jobId } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: opts?.limit ?? 50,
  })
  return deliveries.map(serializeWebhookDelivery)
}

export async function getWebhookDelivery(
  id: string,
  user?: AuthUser,
): Promise<WebhookDelivery | null> {
  const client = user ? getEnhancedPrisma(user) : prisma
  const delivery = await (client as any).webhookDelivery.findUnique({ where: { id } })
  return delivery ? serializeWebhookDelivery(delivery) : null
}

export * from './webhook-service.js'
