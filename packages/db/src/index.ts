import { type Prisma, PrismaClient } from '@prisma/client'
import { type Job, JobStatus, PHASE_WEIGHTS, type PhaseUpdate } from '@saas/shared'
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

/** Parse the raw phases JSON string and compute weighted progress 0–100 */
function parseJobPhases(rawPhases: string | null | undefined): {
  phases: PhaseUpdate[]
  progress: number
} {
  const phases: PhaseUpdate[] = rawPhases ? JSON.parse(rawPhases) : []
  const progress = phases
    .filter(p => p.status === 'completed')
    .reduce((acc, p) => acc + (PHASE_WEIGHTS[p.phase] ?? 0), 0)
  return { phases, progress }
}

function serializeJob(updated: any) {
  const { phases, progress } = parseJobPhases(updated.phases)
  return {
    ...updated,
    videoUrl: updated.videoUrl ?? undefined,
    rawVideoUrl: updated.rawVideoUrl ?? undefined,
    pdfUrl: updated.pdfUrl ?? undefined,
    audioUrl: updated.audioUrl ?? undefined,
    thumbnailUrl: updated.thumbnailUrl ?? undefined,
    status: updated.status as JobStatus,
    parameters: JSON.parse(updated.parameters),
    phases,
    progress,
  }
}

export interface VideoEdition {
  id: string
  jobId: string
  editionNumber: number
  videoUrl: string
  rawVideoUrl?: string
  audioUrl?: string
  thumbnailUrl?: string
  storyboard?: Record<string, unknown>
  storyboardRevision?: number
  createdAt: Date
}

function serializeVideoEdition(edition: any): VideoEdition {
  return {
    ...edition,
    rawVideoUrl: edition.rawVideoUrl ?? undefined,
    audioUrl: edition.audioUrl ?? undefined,
    thumbnailUrl: edition.thumbnailUrl ?? undefined,
    storyboard: edition.storyboard ? JSON.parse(edition.storyboard) : undefined,
    storyboardRevision: edition.storyboardRevision ?? undefined,
  }
}

export async function saveVideoEdition(input: {
  jobId: string
  videoUrl: string
  rawVideoUrl?: string
  audioUrl?: string
  thumbnailUrl?: string
  storyboard?: Record<string, unknown>
}): Promise<VideoEdition> {
  const edition = await prisma.$transaction(async tx => {
    const existing = await tx.videoEdition.findUnique({
      where: { jobId_videoUrl: { jobId: input.jobId, videoUrl: input.videoUrl } },
    })
    if (existing) return existing

    const latest = await tx.videoEdition.findFirst({
      where: { jobId: input.jobId },
      orderBy: { editionNumber: 'desc' },
      select: { editionNumber: true },
    })
    const revision = input.storyboard?.revision
    return tx.videoEdition.create({
      data: {
        jobId: input.jobId,
        editionNumber: (latest?.editionNumber ?? 0) + 1,
        videoUrl: input.videoUrl,
        rawVideoUrl: input.rawVideoUrl,
        audioUrl: input.audioUrl,
        thumbnailUrl: input.thumbnailUrl,
        storyboard: input.storyboard ? JSON.stringify(input.storyboard) : undefined,
        storyboardRevision: typeof revision === 'number' ? revision : undefined,
      },
    })
  })
  return serializeVideoEdition(edition)
}

export async function listVideoEditions(jobId: string): Promise<VideoEdition[]> {
  const editions = await prisma.videoEdition.findMany({
    where: { jobId },
    orderBy: { editionNumber: 'desc' },
  })
  return editions.map(serializeVideoEdition)
}

export async function getVideoEdition(
  jobId: string,
  editionId: string,
): Promise<VideoEdition | null> {
  const edition = await prisma.videoEdition.findFirst({ where: { id: editionId, jobId } })
  return edition ? serializeVideoEdition(edition) : null
}

export async function completeVideoJobWithEdition(
  id: string,
  data: {
    videoUrl: string
    rawVideoUrl?: string
    gitHash?: string
    storyboard: Record<string, unknown>
  },
) {
  const updated = await prisma.$transaction(async tx => {
    const currentJob = await tx.job.findUniqueOrThrow({ where: { id } })
    const existing = await tx.videoEdition.findUnique({
      where: { jobId_videoUrl: { jobId: id, videoUrl: data.videoUrl } },
    })
    if (!existing) {
      const latest = await tx.videoEdition.findFirst({
        where: { jobId: id },
        orderBy: { editionNumber: 'desc' },
        select: { editionNumber: true },
      })
      const revision = data.storyboard.revision
      await tx.videoEdition.create({
        data: {
          jobId: id,
          editionNumber: (latest?.editionNumber ?? 0) + 1,
          videoUrl: data.videoUrl,
          rawVideoUrl: data.rawVideoUrl,
          audioUrl: currentJob.audioUrl,
          thumbnailUrl: currentJob.thumbnailUrl,
          storyboard: JSON.stringify(data.storyboard),
          storyboardRevision: typeof revision === 'number' ? revision : undefined,
        },
      })
    }

    return tx.job.update({
      where: { id },
      data: {
        status: JobStatus.COMPLETED,
        videoUrl: data.videoUrl,
        ...(data.rawVideoUrl !== undefined ? { rawVideoUrl: data.rawVideoUrl } : {}),
        ...(data.gitHash !== undefined ? { gitHash: data.gitHash } : {}),
      },
    })
  })
  return serializeJob(updated)
}

export async function updateJob(
  id: string,
  data: {
    status?: JobStatus
    videoUrl?: string
    rawVideoUrl?: string
    pdfUrl?: string
    audioUrl?: string
    thumbnailUrl?: string
    phases?: string | null // raw JSON string from publishPhaseUpdate
    error?: string | null
    workerId?: string | null
    cost?: number
    gitHash?: string
    rating?: string
    feedback?: string
    parameters?: Record<string, unknown>
  },
) {
  console.log(`[DB] Updating job ${id}:`, { ...data, phases: data.phases ? '<phases>' : undefined })

  // Build the Prisma data object dynamically so we never pass `undefined`
  // for fields that weren't supplied. Passing explicit undefined can cause
  // ZenStack/Prisma to reject the update with "Invalid invocation".
  const updateData: Prisma.JobUpdateInput = {}
  if (data.status !== undefined) updateData.status = data.status
  if (data.videoUrl !== undefined) updateData.videoUrl = data.videoUrl
  if (data.rawVideoUrl !== undefined) updateData.rawVideoUrl = data.rawVideoUrl
  if (data.pdfUrl !== undefined) updateData.pdfUrl = data.pdfUrl
  if (data.audioUrl !== undefined) updateData.audioUrl = data.audioUrl
  if (data.thumbnailUrl !== undefined) updateData.thumbnailUrl = data.thumbnailUrl
  if (data.error !== undefined) updateData.error = data.error
  if (data.workerId !== undefined) updateData.workerId = data.workerId
  if (data.cost !== undefined) updateData.cost = data.cost
  if (data.gitHash !== undefined) updateData.gitHash = data.gitHash
  if (data.rating !== undefined) updateData.rating = data.rating
  if (data.feedback !== undefined) updateData.feedback = data.feedback
  if (data.phases !== undefined) updateData.phases = data.phases
  if (data.parameters !== undefined) updateData.parameters = JSON.stringify(data.parameters)

  // System-level bypass for webhook/worker updates
  const updated = await prisma.job.update({
    where: { id },
    data: updateData,
  })

  return serializeJob(updated)
}

export async function createJob(
  data: { userId: string; parameters: any },
  user?: AuthUser,
): Promise<Job> {
  console.log(`[DB] Creating job for user ${data.userId}`)

  const client = getEnhancedPrisma(user)
  const created = await client.job.create({
    data: {
      userId: data.userId,
      status: JobStatus.PENDING,
      parameters: JSON.stringify(data.parameters),
    },
  })

  const { phases, progress } = parseJobPhases((created as any).phases)
  return {
    ...created,
    videoUrl: created.videoUrl ?? undefined,
    rawVideoUrl: created.rawVideoUrl ?? undefined,
    pdfUrl: created.pdfUrl ?? undefined,
    audioUrl: created.audioUrl ?? undefined,
    thumbnailUrl: (created as any).thumbnailUrl ?? undefined,
    shareSlug: (created as any).shareSlug ?? undefined,
    status: created.status as JobStatus,
    parameters: JSON.parse(created.parameters),
    phases,
    progress,
  }
}

export async function getJob(id: string, user?: AuthUser): Promise<Job | null> {
  const client = getEnhancedPrisma(user)
  const job = await client.job.findUnique({ where: { id } })

  if (!job) return null

  const { phases, progress } = parseJobPhases((job as any).phases)
  return {
    ...job,
    videoUrl: job.videoUrl ?? undefined,
    rawVideoUrl: job.rawVideoUrl ?? undefined,
    pdfUrl: job.pdfUrl ?? undefined,
    audioUrl: job.audioUrl ?? undefined,
    thumbnailUrl: (job as any).thumbnailUrl ?? undefined,
    shareSlug: (job as any).shareSlug ?? undefined,
    status: job.status as JobStatus,
    parameters: JSON.parse(job.parameters),
    phases,
    progress,
  }
}

export async function listJobs(user?: AuthUser): Promise<Job[]> {
  const client = getEnhancedPrisma(user)
  // Scope to the requesting user explicitly. Relying on the access policy
  // alone is not enough: ZenStack's `isPublic == true` read carve-out applies
  // to authenticated clients too, which would leak other users' shared
  // demo/launch videos into every dashboard's job list.
  const jobs = await client.job.findMany({
    where: user ? { userId: user.id } : undefined,
    orderBy: { createdAt: 'desc' },
  })

  return jobs.map((job: any) => {
    const { phases, progress } = parseJobPhases(job.phases)
    return {
      ...job,
      videoUrl: job.videoUrl ?? undefined,
      audioUrl: job.audioUrl ?? undefined,
      thumbnailUrl: job.thumbnailUrl ?? undefined,
      status: job.status as JobStatus,
      parameters: JSON.parse(job.parameters),
      phases,
      progress,
    }
  })
}

export async function deleteJob(id: string, user?: AuthUser) {
  console.log(`[DB] Deleting job ${id}`)
  const client = getEnhancedPrisma(user)
  return await client.job.delete({
    where: { id },
  })
}

// ─── Public sharing ─────────────────────────────────────────────────────────
//
// Opt-in only — a job is never public until its owner explicitly shares it
// (see the Job model's `isPublic == true` read carve-out in schema.zmodel).

function generateShareSlug(): string {
  return randomBytes(6).toString('base64url')
}

/** Mark a job public, assigning it a share slug on first call. Idempotent —
 * calling again on an already-public job returns the same slug rather than
 * rotating it, so a previously shared link keeps working. Owner-scoped via
 * the enhanced client; throws if the job doesn't exist or isn't owned by `user`. */
export async function makeJobPublic(id: string, user: AuthUser): Promise<{ shareSlug: string }> {
  const client = getEnhancedPrisma(user)
  const existing = await client.job.findUnique({ where: { id }, select: { shareSlug: true } })
  if (!existing) throw new Error('Job not found')

  if (existing.shareSlug) {
    await client.job.update({ where: { id }, data: { isPublic: true } })
    return { shareSlug: existing.shareSlug }
  }

  // Collision-safe: retry if generated slug already exists (same idiom as
  // generateAffiliateCode/registerAffiliate above).
  let shareSlug = generateShareSlug()
  while (await prisma.job.findUnique({ where: { shareSlug } })) {
    shareSlug = generateShareSlug()
  }

  await client.job.update({ where: { id }, data: { isPublic: true, shareSlug } })
  return { shareSlug }
}

/** Revoke public access. The slug is kept (not cleared) so re-sharing later
 * reuses the same URL instead of silently breaking previously shared links. */
export async function unmakeJobPublic(id: string, user: AuthUser): Promise<void> {
  const client = getEnhancedPrisma(user)
  await client.job.update({ where: { id }, data: { isPublic: false } })
}

/** Anonymous lookup by share slug. Goes through the enhanced client with no
 * user so ZenStack's `isPublic == true` policy is what actually gates this —
 * do not bypass to the raw `prisma` client here (see getWebhookDelivery for
 * the unsafe version of this pattern this deliberately avoids). */
export async function getPublicJobBySlug(slug: string): Promise<Job | null> {
  const client = getEnhancedPrisma(undefined)
  const job = await client.job.findUnique({ where: { shareSlug: slug } })
  if (!job) return null
  return serializeJob(job)
}

/** Fire-and-forget view counter for real page loads of /d/:slug. */
export async function incrementShareViews(id: string): Promise<void> {
  await prisma.job.update({ where: { id }, data: { shareViews: { increment: 1 } } })
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

/**
 * Calculates the current credit balance for a user from the ledger.
 * Returns 0 if the user has no transactions yet.
 */
export async function getCreditBalance(
  userId: string,
  client: PrismaClient | Prisma.TransactionClient = prisma,
): Promise<number> {
  const agg = await client.creditTransaction.aggregate({
    where: { userId },
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
    jobId?: string
    subscriptionId?: string
    topUpId?: string
    idempotencyKey?: string
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
      return getCreditBalance(userId, client)
    }
  }

  await client.creditTransaction.create({
    data: {
      userId,
      delta: amount,
      type,
      description,
      jobId: opts?.jobId,
      subscriptionId: opts?.subscriptionId,
      topUpId: opts?.topUpId,
      idempotencyKey: opts?.idempotencyKey,
    },
  })

  const newBalance = await getCreditBalance(userId, client)
  console.log(`[Credits] +${amount} (${type}) for user ${userId}. New balance: ${newBalance}`)
  return newBalance
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
    jobId?: string
    idempotencyKey?: string
  },
): Promise<number> {
  const result = await prisma.$transaction(async tx => {
    // Compute current balance inside the transaction to prevent races
    const agg = await tx.creditTransaction.aggregate({
      where: { userId },
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
        jobId: opts?.jobId,
        idempotencyKey: opts?.idempotencyKey,
      },
    })

    return current - amount
  })

  console.log(`[Credits] -${amount} (usage) for user ${userId}. New balance: ${result}`)
  return result
}

/**
 * Returns the full transaction history for a user, newest first.
 */
export async function getCreditTransactions(userId: string) {
  return prisma.creditTransaction.findMany({
    where: { userId },
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
  idempotencyKey: string // e.g. "sub_grant:<subscriptionId>:<periodStart.toISOString()>"
}) {
  // Upsert the subscription row
  const subscription = await prisma.subscription.upsert({
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

  // Grant credits (idempotent — safe to call multiple times)
  await addCredits(
    data.userId,
    data.creditsPerCycle,
    'subscription_grant',
    `${data.planKey} plan — ${data.creditsPerCycle} credits for cycle starting ${data.currentPeriodStart.toISOString().slice(0, 10)}`,
    { subscriptionId: subscription.id, idempotencyKey: data.idempotencyKey },
  )

  return subscription
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
  // Check if already processed
  const existing = await prisma.topUpPurchase.findUnique({
    where: { dodoPaymentId: data.dodoPaymentId },
  })
  if (existing) {
    console.log(`[Credits] Skipped duplicate top-up (paymentId: ${data.dodoPaymentId})`)
    return existing
  }

  const topUp = await prisma.topUpPurchase.create({
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
    },
  )

  return topUp
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
    },
    update: {
      email: data.email,
      firstName: data.firstName,
      lastName: data.lastName,
      imageUrl: data.imageUrl,
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
    videosEarned: Math.floor(creditsEarned / 3),
  }
}

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

export async function getWebhookEndpoint(id: string, user: AuthUser): Promise<WebhookEndpoint | null> {
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

export async function listActiveWebhookEndpointsForUser(userId: string): Promise<WebhookEndpoint[]> {
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

export async function getWebhookDelivery(id: string, user?: AuthUser): Promise<WebhookDelivery | null> {
  const client = user ? getEnhancedPrisma(user) : prisma
  const delivery = await (client as any).webhookDelivery.findUnique({ where: { id } })
  return delivery ? serializeWebhookDelivery(delivery) : null
}

export * from './webhook-service.js'
