import { PrismaClient } from '@prisma/client';
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

export async function updateJob(id: string, data: { status?: JobStatus; videoUrl?: string; audioUrl?: string }) {
  console.log(`[DB] Updating job ${id}:`, data);
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

export async function createJob(data: { userId: string; orgId: string; parameters: any }): Promise<Job> {
  console.log(`[DB] Creating job for user ${data.userId} in org ${data.orgId}`);
  
  const created = await prisma.job.create({
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

export async function getJob(id: string): Promise<Job | null> {
  const job = await prisma.job.findUnique({ where: { id } });
  
  if (!job) return null;
  
  return {
    ...job,
    videoUrl: job.videoUrl ?? undefined,
    audioUrl: job.audioUrl ?? undefined,
    status: job.status as JobStatus,
    parameters: JSON.parse(job.parameters)
  };
}

export async function listJobs(orgId?: string): Promise<Job[]> {
  const jobs = await prisma.job.findMany({
    where: orgId ? { orgId } : undefined,
    orderBy: { createdAt: 'desc' }
  });
  
  return jobs.map(job => ({
    ...job,
    videoUrl: job.videoUrl ?? undefined,
    audioUrl: job.audioUrl ?? undefined,
    status: job.status as JobStatus,
    parameters: JSON.parse(job.parameters)
  }));
}

export async function deleteJob(id: string) {
  console.log(`[DB] Deleting job ${id}`);
  return await prisma.job.delete({
    where: { id },
  });
}
