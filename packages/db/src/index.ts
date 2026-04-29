import { PrismaClient } from '@prisma/client';
import { JobStatus, Job } from '@saas/shared';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient({});

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

export async function updateJob(id: string, data: { status?: JobStatus; videoUrl?: string }) {
  console.log(`[DB] Updating job ${id}:`, data);
  const updated = await prisma.job.update({
    where: { id },
    data: {
      status: data.status,
      videoUrl: data.videoUrl,
    },
  });
  
  return {
    ...updated,
    status: updated.status as JobStatus,
    parameters: JSON.parse(updated.parameters)
  };
}

export async function createJob(data: { userId: string; parameters: any }): Promise<Job> {
  console.log(`[DB] Creating job for user ${data.userId}`);
  
  const created = await prisma.job.create({
    data: {
      userId: data.userId,
      status: JobStatus.PENDING,
      parameters: JSON.stringify(data.parameters),
    },
  });
  
  return {
    ...created,
    status: created.status as JobStatus,
    parameters: JSON.parse(created.parameters)
  };
}

export async function getJob(id: string): Promise<Job | null> {
  const job = await prisma.job.findUnique({ where: { id } });
  
  if (!job) return null;
  
  return {
    ...job,
    status: job.status as JobStatus,
    parameters: JSON.parse(job.parameters)
  };
}
