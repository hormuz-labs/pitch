import { PrismaClient } from '@prisma/client';
import { enhance } from '@zenstackhq/runtime';
import { JobStatus, Job, PhaseUpdate, PHASE_WEIGHTS } from '@saas/shared';
import * as dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../../..');
dotenv.config({ path: path.join(rootDir, '.env') });

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient({});

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

export interface AuthUser extends Record<string, unknown> {
  id: string;
}

export function getEnhancedPrisma(user?: AuthUser) {
  return enhance(prisma, { user });
}

/** Parse the raw phases JSON string and compute weighted progress 0–100 */
function parseJobPhases(rawPhases: string | null | undefined): { phases: PhaseUpdate[]; progress: number } {
  const phases: PhaseUpdate[] = rawPhases ? JSON.parse(rawPhases) : [];
  const progress = phases
    .filter(p => p.status === 'completed')
    .reduce((acc, p) => acc + (PHASE_WEIGHTS[p.phase] ?? 0), 0);
  return { phases, progress };
}

export async function updateJob(id: string, data: {
  status?: JobStatus;
  videoUrl?: string;
  audioUrl?: string;
  thumbnailUrl?: string;
  phases?: string; // raw JSON string from publishPhaseUpdate
  error?: string;
  workerId?: string;
  cost?: number;
  rating?: string;
  feedback?: string;
}) {
  console.log(`[DB] Updating job ${id}:`, { ...data, phases: data.phases ? '<phases>' : undefined });
  // System-level bypass for webhook/worker updates
  const updated = await prisma.job.update({
    where: { id },
    data: {
      status: data.status,
      videoUrl: data.videoUrl,
      audioUrl: data.audioUrl,
      thumbnailUrl: data.thumbnailUrl,
      error: data.error,
      workerId: data.workerId,
      cost: data.cost,
      rating: data.rating,
      feedback: data.feedback,
      ...(data.phases !== undefined ? { phases: data.phases } : {}),
    },
  });
  
  const { phases, progress } = parseJobPhases((updated as any).phases);
  return {
    ...updated,
    videoUrl: updated.videoUrl ?? undefined,
    audioUrl: updated.audioUrl ?? undefined,
    thumbnailUrl: (updated as any).thumbnailUrl ?? undefined,
    status: updated.status as JobStatus,
    parameters: JSON.parse(updated.parameters),
    phases,
    progress,
  };
}

export async function createJob(data: { userId: string; parameters: any }, user?: AuthUser): Promise<Job> {
  console.log(`[DB] Creating job for user ${data.userId}`);
  
  const client = getEnhancedPrisma(user);
  const created = await client.job.create({
    data: {
      userId: data.userId,
      status: JobStatus.PENDING,
      parameters: JSON.stringify(data.parameters),
    },
  });
  
  const { phases, progress } = parseJobPhases((created as any).phases);
  return {
    ...created,
    videoUrl: created.videoUrl ?? undefined,
    audioUrl: created.audioUrl ?? undefined,
    thumbnailUrl: (created as any).thumbnailUrl ?? undefined,
    status: created.status as JobStatus,
    parameters: JSON.parse(created.parameters),
    phases,
    progress,
  };
}

export async function getJob(id: string, user?: AuthUser): Promise<Job | null> {
  const client = getEnhancedPrisma(user);
  const job = await client.job.findUnique({ where: { id } });
  
  if (!job) return null;
  
  const { phases, progress } = parseJobPhases((job as any).phases);
  return {
    ...job,
    videoUrl: job.videoUrl ?? undefined,
    audioUrl: job.audioUrl ?? undefined,
    thumbnailUrl: (job as any).thumbnailUrl ?? undefined,
    status: job.status as JobStatus,
    parameters: JSON.parse(job.parameters),
    phases,
    progress,
  };
}

export async function listJobs(user?: AuthUser): Promise<Job[]> {
  const client = getEnhancedPrisma(user);
  const jobs = await client.job.findMany({
    orderBy: { createdAt: 'desc' }
  });
  
  return jobs.map((job: any) => {
    const { phases, progress } = parseJobPhases(job.phases);
    return {
      ...job,
      videoUrl: job.videoUrl ?? undefined,
      audioUrl: job.audioUrl ?? undefined,
      thumbnailUrl: job.thumbnailUrl ?? undefined,
      status: job.status as JobStatus,
      parameters: JSON.parse(job.parameters),
      phases,
      progress,
    };
  });
}

export async function deleteJob(id: string, user?: AuthUser) {
  console.log(`[DB] Deleting job ${id}`);
  const client = getEnhancedPrisma(user);
  return await client.job.delete({
    where: { id },
  });
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
  | 'promo';

/**
 * Calculates the current credit balance for a user from the ledger.
 * Returns 0 if the user has no transactions yet.
 */
export async function getCreditBalance(userId: string): Promise<number> {
  const agg = await prisma.creditTransaction.aggregate({
    where: { userId },
    _sum: { delta: true },
  });
  return agg._sum.delta ?? 0;
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
    jobId?: string;
    subscriptionId?: string;
    topUpId?: string;
    idempotencyKey?: string;
  }
): Promise<number> {
  // Check idempotency — skip if we've already processed this key
  if (opts?.idempotencyKey) {
    const existing = await prisma.creditTransaction.findUnique({
      where: { idempotencyKey: opts.idempotencyKey },
    });
    if (existing) {
      console.log(`[Credits] Skipped duplicate grant (key: ${opts.idempotencyKey})`);
      return getCreditBalance(userId);
    }
  }

  await prisma.creditTransaction.create({
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
  });

  const newBalance = await getCreditBalance(userId);
  console.log(`[Credits] +${amount} (${type}) for user ${userId}. New balance: ${newBalance}`);
  return newBalance;
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
    jobId?: string;
    idempotencyKey?: string;
  }
): Promise<number> {
  const result = await prisma.$transaction(async (tx) => {
    // Compute current balance inside the transaction to prevent races
    const agg = await tx.creditTransaction.aggregate({
      where: { userId },
      _sum: { delta: true },
    });
    const current = agg._sum.delta ?? 0;

    if (current < amount) {
      throw new Error(`Insufficient credits: balance is ${current}, need ${amount}`);
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
    });

    return current - amount;
  });

  console.log(`[Credits] -${amount} (usage) for user ${userId}. New balance: ${result}`);
  return result;
}

/**
 * Returns the full transaction history for a user, newest first.
 */
export async function getCreditTransactions(userId: string) {
  return prisma.creditTransaction.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  });
}

// ─── Subscriptions ────────────────────────────────────────────────────────────

/**
 * Upserts a Subscription record when a Dodo subscription.active or
 * subscription.renewed event fires. Also grants credits for the new cycle.
 *
 * Returns the subscription record.
 */
export async function upsertSubscription(data: {
  userId: string;
  dodoSubscriptionId: string;
  planKey: string;
  status: string;
  creditsPerCycle: number;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  idempotencyKey: string; // e.g. "sub_grant:<subscriptionId>:<periodStart.toISOString()>"
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
  });

  // Grant credits (idempotent — safe to call multiple times)
  await addCredits(
    data.userId,
    data.creditsPerCycle,
    'subscription_grant',
    `${data.planKey} plan — ${data.creditsPerCycle} credits for cycle starting ${data.currentPeriodStart.toISOString().slice(0, 10)}`,
    { subscriptionId: subscription.id, idempotencyKey: data.idempotencyKey }
  );

  return subscription;
}

/**
 * Marks a subscription as cancelled.
 */
export async function cancelSubscription(dodoSubscriptionId: string) {
  return prisma.subscription.update({
    where: { dodoSubscriptionId },
    data: { status: 'cancelled', cancelledAt: new Date() },
  });
}

/**
 * Returns the active subscription for a user, if any.
 */
export async function getActiveSubscription(userId: string) {
  return prisma.subscription.findFirst({
    where: { userId, status: 'active' },
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * Returns all subscriptions for a user (history).
 */
export async function getSubscriptions(userId: string) {
  return prisma.subscription.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  });
}

// ─── Top-Up Purchases ─────────────────────────────────────────────────────────

/**
 * Records a completed one-time top-up purchase and grants credits.
 * Idempotent — safe to call from both webhook and polling fallback.
 */
export async function recordTopUp(data: {
  userId: string;
  dodoPaymentId: string;
  packKey: string;
  credits: number;
  amountUsd: number;
}) {
  // Check if already processed
  const existing = await prisma.topUpPurchase.findUnique({
    where: { dodoPaymentId: data.dodoPaymentId },
  });
  if (existing) {
    console.log(`[Credits] Skipped duplicate top-up (paymentId: ${data.dodoPaymentId})`);
    return existing;
  }

  const topUp = await prisma.topUpPurchase.create({
    data: {
      userId: data.userId,
      dodoPaymentId: data.dodoPaymentId,
      packKey: data.packKey,
      credits: data.credits,
      amountUsd: data.amountUsd,
    },
  });

  await addCredits(
    data.userId,
    data.credits,
    'topup_grant',
    `Top-up: ${data.credits} credits ($${data.amountUsd.toFixed(2)})`,
    {
      topUpId: topUp.id,
      idempotencyKey: `topup_grant:${data.dodoPaymentId}`,
    }
  );

  return topUp;
}

/**
 * Returns all top-up purchases for a user, newest first.
 */
export async function getTopUpPurchases(userId: string) {
  return prisma.topUpPurchase.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  });
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
  ]);

  return { balance, activeSubscription, subscriptions, topUps, transactions };
}

// ─── User Profiles ────────────────────────────────────────────────────────────

export interface UserProfileData {
  id: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  imageUrl?: string | null;
}

/**
 * Upserts a Clerk user's profile into the database.
 * Called on every sign-in to keep details up to date.
 */
export async function upsertUser(data: UserProfileData) {
  console.log(`[DB] Upserting user profile for ${data.id} (${data.email})`);
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
  });
}

// ── Affiliate Program ─────────────────────────────────────────────────────────

import { randomBytes } from 'crypto';

/** Generate a unique, human-readable affiliate code like "MUKUND-X7K2" */
export function generateAffiliateCode(firstName: string): string {
  const prefix = firstName.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 6) || 'REF';
  const suffix = randomBytes(2).toString('hex').toUpperCase();
  return `${prefix}-${suffix}`;
}

/** Register a new influencer — idempotent, returns existing if already registered */
export async function registerAffiliate(userId: string, firstName: string) {
  const existing = await prisma.affiliate.findUnique({ where: { userId } });
  if (existing) return existing;

  // Collision-safe: retry if generated code already exists
  let code = generateAffiliateCode(firstName);
  while (await prisma.affiliate.findUnique({ where: { code } })) {
    code = generateAffiliateCode(firstName);
  }

  return prisma.affiliate.create({ data: { userId, code } });
}

/** Get an affiliate by userId */
export async function getAffiliateByUserId(userId: string) {
  return prisma.affiliate.findUnique({ where: { userId } });
}

/** Get an affiliate by their referral code (public lookup for redirect) */
export async function getAffiliateByCode(code: string) {
  return prisma.affiliate.findUnique({ where: { code } });
}

/** Record a single link click */
export async function createAffiliateClick(data: {
  affiliateId: string;
  ip?: string;
  userAgent?: string;
  platform?: string;
  refPage?: string;
}) {
  return prisma.affiliateClick.create({ data });
}

/** Record a confirmed conversion (sale) attributed to an influencer */
export async function createAffiliateConversion(data: {
  affiliateId: string;
  clickId?: string;
  referredUserId: string;
  saleAmountUsd: number;
  commissionAmt: number;
  dodoSessionId?: string;
}) {
  return prisma.affiliateConversion.create({ data });
}

/** Check if a given user has already been attributed to this affiliate (prevents double commission) */
export async function hasExistingConversion(affiliateId: string, referredUserId: string) {
  const existing = await prisma.affiliateConversion.findUnique({
    where: { affiliateId_referredUserId: { affiliateId, referredUserId } },
  });
  return !!existing;
}

/** Get aggregated stats for the influencer dashboard */
export async function getAffiliateStats(affiliateId: string) {
  const [clicks, conversions, payouts] = await Promise.all([
    prisma.affiliateClick.count({ where: { affiliateId } }),
    prisma.affiliateConversion.findMany({ where: { affiliateId } }),
    prisma.affiliatePayout.findMany({ where: { affiliateId }, orderBy: { requestedAt: 'desc' } }),
  ]);

  const totalRevenue = conversions.reduce((s, c) => s + c.saleAmountUsd, 0);
  const totalCommission = conversions.reduce((s, c) => s + c.commissionAmt, 0);
  const paidOut = payouts.filter(p => p.status === 'paid').reduce((s, p) => s + p.amount, 0);
  const pendingPayout = totalCommission - paidOut;

  return { clicks, signups: conversions.length, totalRevenue, totalCommission, paidOut, pendingPayout, payouts };
}

/** Request a payout for pending commission earnings */
export async function requestAffiliatePayout(affiliateId: string, amount: number) {
  return prisma.affiliatePayout.create({
    data: { affiliateId, amount, method: 'dodo', status: 'requested' },
  });
}

/** Mark a conversion as approved (called 7 days after sale, auto or by admin) */
export async function approveConversion(conversionId: string) {
  return prisma.affiliateConversion.update({
    where: { id: conversionId },
    data: { status: 'approved' },
  });
}
