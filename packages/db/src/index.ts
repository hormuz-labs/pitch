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
  phases?: string; // raw JSON string from publishPhaseUpdate
}) {
  console.log(`[DB] Updating job ${id}:`, { ...data, phases: data.phases ? '<phases>' : undefined });
  // System-level bypass for webhook/worker updates
  const updated = await prisma.job.update({
    where: { id },
    data: {
      status: data.status,
      videoUrl: data.videoUrl,
      audioUrl: data.audioUrl,
      ...(data.phases !== undefined ? { phases: data.phases } : {}),
    },
  });
  
  const { phases, progress } = parseJobPhases((updated as any).phases);
  return {
    ...updated,
    videoUrl: updated.videoUrl ?? undefined,
    audioUrl: updated.audioUrl ?? undefined,
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

/**
 * Returns the current credit balance for a tenant.
 * Returns 0 if no balance row exists yet (tenant has never received credits).
 */
export async function getCreditBalance(tenantId: string): Promise<number> {
  const row = await prisma.creditBalance.findUnique({ where: { tenantId } });
  return row?.balance ?? 0;
}

/**
 * Adds credits to a tenant's balance (creates the row if it doesn't exist).
 * Records a CreditTransaction with the given reason.
 */
export async function addCredits(tenantId: string, amount: number, reason: string, jobId?: string): Promise<number> {
  const result = await prisma.$transaction(async (tx) => {
    const row = await tx.creditBalance.upsert({
      where: { tenantId },
      create: { tenantId, balance: amount },
      update: { balance: { increment: amount } },
    });
    await tx.creditTransaction.create({
      data: { tenantId, delta: amount, reason, jobId },
    });
    return row.balance;
  });
  console.log(`[Credits] +${amount} for tenant ${tenantId} (${reason}). New balance: ${result}`);
  return result;
}

/**
 * Deducts credits from a tenant's balance atomically.
 * Throws an error if the balance would go below 0.
 * Returns the new balance on success.
 */
export async function deductCredit(tenantId: string, amount: number, reason: string, jobId?: string): Promise<number> {
  const result = await prisma.$transaction(async (tx) => {
    // Lock the row for update
    const row = await tx.creditBalance.findUnique({ where: { tenantId } });
    const current = row?.balance ?? 0;

    if (current < amount) {
      throw new Error(`Insufficient credits: balance is ${current}, need ${amount}`);
    }

    const updated = await tx.creditBalance.upsert({
      where: { tenantId },
      create: { tenantId, balance: -amount },
      update: { balance: { decrement: amount } },
    });
    await tx.creditTransaction.create({
      data: { tenantId, delta: -amount, reason, jobId },
    });
    return updated.balance;
  });
  console.log(`[Credits] -${amount} for tenant ${tenantId} (${reason}). New balance: ${result}`);
  return result;
}

/**
 * Returns the full transaction history for a tenant, newest first.
 */
export async function getCreditTransactions(tenantId: string) {
  return prisma.creditTransaction.findMany({
    where: { tenantId },
    orderBy: { createdAt: 'desc' },
  });
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
  stripeSessionId?: string;
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
    data: { affiliateId, amount, method: 'stripe', status: 'requested' },
  });
}

/** Mark a conversion as approved (called 7 days after sale, auto or by admin) */
export async function approveConversion(conversionId: string) {
  return prisma.affiliateConversion.update({
    where: { id: conversionId },
    data: { status: 'approved' },
  });
}
