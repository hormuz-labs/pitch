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
