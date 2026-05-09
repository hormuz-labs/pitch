import { PrismaClient } from '@prisma/client';
import { enhance } from '@zenstackhq/runtime';
import { JobStatus, Job } from '@saas/shared';
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
  orgId?: string | null;
}

export function getEnhancedPrisma(user?: AuthUser) {
  return enhance(prisma, { user });
}

export async function updateJob(id: string, data: { status?: JobStatus; videoUrl?: string; audioUrl?: string }) {
  console.log(`[DB] Updating job ${id}:`, data);
  // System-level bypass for webhook/worker updates
  const updated = await prisma.job.update({
    where: { id },
    data: {
      status: data.status,
      videoUrl: data.videoUrl,
      audioUrl: data.audioUrl,
    },
  });
  
  return {
    ...updated,
    videoUrl: updated.videoUrl ?? undefined,
    audioUrl: updated.audioUrl ?? undefined,
    status: updated.status as JobStatus,
    parameters: JSON.parse(updated.parameters)
  };
}

export async function createJob(data: { userId: string; orgId: string; parameters: any }, user?: AuthUser): Promise<Job> {
  console.log(`[DB] Creating job for user ${data.userId} in org ${data.orgId}`);
  
  const client = getEnhancedPrisma(user);
  const created = await client.job.create({
    data: {
      userId: data.userId,
      orgId: data.orgId,
      status: JobStatus.PENDING,
      parameters: JSON.stringify(data.parameters),
    },
  });
  
  return {
    ...created,
    videoUrl: created.videoUrl ?? undefined,
    audioUrl: created.audioUrl ?? undefined,
    status: created.status as JobStatus,
    parameters: JSON.parse(created.parameters)
  };
}

export async function getJob(id: string, user?: AuthUser): Promise<Job | null> {
  const client = getEnhancedPrisma(user);
  const job = await client.job.findUnique({ where: { id } });
  
  if (!job) return null;
  
  return {
    ...job,
    videoUrl: job.videoUrl ?? undefined,
    audioUrl: job.audioUrl ?? undefined,
    status: job.status as JobStatus,
    parameters: JSON.parse(job.parameters)
  };
}

export async function listJobs(user?: AuthUser): Promise<Job[]> {
  const client = getEnhancedPrisma(user);
  const jobs = await client.job.findMany({
    orderBy: { createdAt: 'desc' }
  });
  
  return jobs.map((job: any) => ({
    ...job,
    videoUrl: job.videoUrl ?? undefined,
    audioUrl: job.audioUrl ?? undefined,
    status: job.status as JobStatus,
    parameters: JSON.parse(job.parameters)
  }));
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
