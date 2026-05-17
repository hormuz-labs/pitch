import { Router, type Request, type Response, type NextFunction } from 'express';
import * as db from '@saas/db';
import { requireAuth } from '../middleware/auth.js';
import { videoQueue, connection } from '../config.js';
import { createLogger, JOB_CANCELLATIONS_CHANNEL } from '@saas/shared';

const logger = createLogger('admin-routes');
export const router: Router = Router();

const requireAdmin = async (req: any, res: any, next: any) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  try {
    const profile = await db.prisma.userProfile.findUnique({ where: { id: userId } });
    if (!profile) {
      return res.status(403).json({ error: 'User profile not found' });
    }
    
    if (process.env.ADMIN_EMAILS) {
      const admins = process.env.ADMIN_EMAILS.split(',').map(e => e.trim().toLowerCase());
      if (!admins.includes(profile.email.toLowerCase())) {
        return res.status(403).json({ error: 'Not authorized as admin' });
      }
    }
    req.adminUser = profile;
    next();
  } catch(e: any) {
    logger.error({ err: e }, 'Admin auth check failed');
    res.status(500).json({ error: 'Internal server error checking admin status' });
  }
};

router.use(requireAdmin);

// 1. Dashboard Overview
router.get('/dashboard', async (req, res) => {
  try {
    const jobCounts = await videoQueue.getJobCounts('waiting', 'active', 'delayed', 'completed', 'failed');
    const workers = await videoQueue.getWorkers();
    
    // Check if queue is paused
    const isPaused = await videoQueue.isPaused();

    const users = await db.prisma.userProfile.findMany({
      orderBy: { createdAt: 'desc' },
    });

    const balances = await db.prisma.creditBalance.findMany();
    const transactions = await db.prisma.creditTransaction.findMany({
      where: { delta: { gt: 0 } }, 
    });

    const usersData = users.map(u => {
      const bal = balances.find(b => b.tenantId === u.id);
      const userTxs = transactions.filter(t => t.tenantId === u.id);
      const creditsBought = userTxs.reduce((acc, t) => acc + t.delta, 0);

      return {
        id: u.id,
        email: u.email,
        firstName: u.firstName,
        lastName: u.lastName,
        createdAt: u.createdAt,
        creditsRemaining: bal?.balance ?? 0,
        creditsBought
      };
    });

    res.json({
      stats: {
        activeWorkers: workers.length,
        queuedJobs: (jobCounts.waiting || 0) + (jobCounts.delayed || 0), 
        activeJobs: jobCounts.active || 0,
        completedJobs: jobCounts.completed || 0,
        failedJobs: jobCounts.failed || 0,
        isPaused
      },
      users: usersData
    });

  } catch (error: any) {
    logger.error({ err: error }, 'Failed to fetch admin dashboard');
    res.status(500).json({ error: error.message });
  }
});

// 2. Fetch all jobs flat structure
router.get('/jobs', async (req, res) => {
  try {
    const jobs = await db.prisma.job.findMany({
      orderBy: { createdAt: 'desc' },
      take: 200 // limit to recent 200 for performance, can paginate later
    });

    const userIds = [...new Set(jobs.map(j => j.userId))];
    const profiles = await db.prisma.userProfile.findMany({
      where: { id: { in: userIds } },
      select: { id: true, email: true, firstName: true, lastName: true }
    });

    const refunds = await db.prisma.creditTransaction.findMany({
      where: { reason: 'job_failed_refund' }
    });

    const jobsData = jobs.map((job: any) => {
      let timeTakenMs = null;
      if (job.status === 'COMPLETED' || job.status === 'FAILED') {
        timeTakenMs = new Date(job.updatedAt).getTime() - new Date(job.createdAt).getTime();
      }

      const isRefunded = refunds.some((r: any) => r.jobId === job.id);
      const user = profiles.find(p => p.id === job.userId);

      return {
        ...job,
        userEmail: user?.email || 'Unknown',
        userName: `${user?.firstName || ''} ${user?.lastName || ''}`.trim(),
        parameters: job.parameters ? JSON.parse(job.parameters) : {},
        timeTakenMs,
        isRefunded
      };
    });

    res.json(jobsData);
  } catch (error: any) {
    logger.error({ err: error }, 'Failed to fetch global jobs');
    res.status(500).json({ error: error.message });
  }
});

// 3. User Specific Jobs
router.get('/users/:id/jobs', async (req, res) => {
  const targetUserId = req.params.id;
  try {
    const jobs = await db.prisma.job.findMany({
      where: { userId: targetUserId },
      orderBy: { createdAt: 'desc' }
    });

    const refunds = await db.prisma.creditTransaction.findMany({
      where: { tenantId: targetUserId, reason: 'job_failed_refund' }
    });
    
    const jobsData = jobs.map((job: any) => {
      let timeTakenMs = null;
      if (job.status === 'COMPLETED' || job.status === 'FAILED') {
        timeTakenMs = new Date(job.updatedAt).getTime() - new Date(job.createdAt).getTime();
      }
      const isRefunded = refunds.some((r: any) => r.jobId === job.id);

      return {
        ...job,
        parameters: job.parameters ? JSON.parse(job.parameters) : {},
        timeTakenMs,
        isRefunded
      };
    });

    res.json(jobsData);
  } catch (error: any) {
    logger.error({ err: error }, 'Failed to fetch user jobs');
    res.status(500).json({ error: error.message });
  }
});

// 4. Delete / Cancel Job (Bypass RLS)
router.delete('/jobs/:id', async (req, res) => {
  const { id } = req.params;
  try {
    // 1. Abort active processing via PubSub
    await connection.publish(JOB_CANCELLATIONS_CHANNEL, JSON.stringify({ jobId: id }));
    
    // 2. Remove from BullMQ
    const bullJob = await videoQueue.getJob(id);
    if (bullJob) {
      await bullJob.remove().catch(e => logger.warn({err: e}, 'Failed to remove job from BullMQ'));
    }

    // 3. Force delete from Database
    await db.prisma.job.delete({ where: { id } });
    
    res.status(204).send();
  } catch (error: any) {
    logger.error({ err: error }, 'Failed to delete job as admin');
    res.status(500).json({ error: error.message });
  }
});

// 5. Global Queue Pause / Resume
router.post('/queue/toggle', async (req, res) => {
  try {
    const isPaused = await videoQueue.isPaused();
    if (isPaused) {
      await videoQueue.resume();
    } else {
      await videoQueue.pause();
    }
    res.json({ paused: !isPaused });
  } catch (error: any) {
    logger.error({ err: error }, 'Failed to toggle queue state');
    res.status(500).json({ error: error.message });
  }
});

export default router;
