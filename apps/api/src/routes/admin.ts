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

    const userIds = users.map(u => u.id);

    // Fetch balances via ledger aggregate
    const creditAggregates = await db.prisma.creditTransaction.groupBy({
      by: ['userId'],
      _sum: { delta: true },
    });
    const positiveTxAggregates = await db.prisma.creditTransaction.groupBy({
      by: ['userId'],
      where: { delta: { gt: 0 } },
      _sum: { delta: true },
    });

    // Fetch subscriptions and top-ups for all users
    const subscriptions = await db.prisma.subscription.findMany({
      where: { userId: { in: userIds } },
      orderBy: { createdAt: 'desc' },
    });
    const topUps = await db.prisma.topUpPurchase.findMany({
      where: { userId: { in: userIds } },
      orderBy: { createdAt: 'desc' },
    });

    // Aggregate total revenue from top-ups
    const revenueAgg = await db.prisma.topUpPurchase.aggregate({
      _sum: { amountUsd: true },
    });

    // Total job count
    const totalJobs = await db.prisma.job.count();

    const usersData = users.map(u => {
      const balAgg = creditAggregates.find(b => b.userId === u.id);
      const posTxAgg = positiveTxAggregates.find(b => b.userId === u.id);
      const creditsRemaining = balAgg?._sum?.delta ?? 0;
      const creditsBought = posTxAgg?._sum?.delta ?? 0;

      // Most recent active subscription for this user
      const userSubs = subscriptions.filter(s => s.userId === u.id);
      const activeSub = userSubs.find(s => s.status === 'active') || userSubs[0] || null;

      // All top-ups for this user
      const userTopUps = topUps.filter(t => t.userId === u.id);

      return {
        id: u.id,
        email: u.email,
        firstName: u.firstName,
        lastName: u.lastName,
        imageUrl: u.imageUrl,
        role: u.role,
        createdAt: u.createdAt,
        updatedAt: u.updatedAt,
        creditsRemaining,
        creditsBought,
        subscription: activeSub,
        topUps: userTopUps,
      };
    });

    res.json({
      stats: {
        activeWorkers: workers.length,
        queuedJobs: (jobCounts.waiting || 0) + (jobCounts.delayed || 0), 
        activeJobs: jobCounts.active || 0,
        completedJobs: jobCounts.completed || 0,
        failedJobs: jobCounts.failed || 0,
        isPaused,
        totalUsers: users.length,
        totalRevenue: revenueAgg._sum?.amountUsd ?? 0,
        totalJobs,
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
      where: { type: 'refund' }
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
        phases: job.phases ? JSON.parse(job.phases) : null,
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
      where: { userId: targetUserId, type: 'refund' }
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
        phases: job.phases ? JSON.parse(job.phases) : null,
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

// 6. Per-user financials: subscriptions, top-ups, credit ledger
router.get('/users/:id/financials', async (req, res) => {
  const { id } = req.params;
  try {
    const [subscriptions, topUps, transactions] = await Promise.all([
      db.prisma.subscription.findMany({
        where: { userId: id },
        orderBy: { createdAt: 'desc' },
      }),
      db.prisma.topUpPurchase.findMany({
        where: { userId: id },
        orderBy: { createdAt: 'desc' },
      }),
      db.prisma.creditTransaction.findMany({
        where: { userId: id },
        orderBy: { createdAt: 'desc' },
        take: 150,
      }),
    ]);
    res.json({ subscriptions, topUps, transactions });
  } catch (error: any) {
    logger.error({ err: error }, 'Failed to fetch user financials');
    res.status(500).json({ error: error.message });
  }
});

// 7. Per-user affiliate record
router.get('/users/:id/affiliate', async (req, res) => {
  const { id } = req.params;
  try {
    const affiliate = await db.prisma.affiliate.findUnique({
      where: { userId: id },
      include: {
        clicks: { orderBy: { clickedAt: 'desc' }, take: 100 },
        conversions: { orderBy: { createdAt: 'desc' } },
        payouts: { orderBy: { requestedAt: 'desc' } },
      },
    });
    res.json(affiliate || null);
  } catch (error: any) {
    logger.error({ err: error }, 'Failed to fetch user affiliate');
    res.status(500).json({ error: error.message });
  }
});

// 8. Analytics: feedback summary + affiliates overview
router.get('/analytics', async (req, res) => {
  try {
    const [affiliatesRaw, jobsWithFeedbackRaw] = await Promise.all([
      db.prisma.affiliate.findMany({
        include: {
          userProfile: { select: { email: true, firstName: true, lastName: true, imageUrl: true } },
          clicks: true,
          conversions: true,
          payouts: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      db.prisma.job.findMany({
        where: { OR: [{ rating: { not: null } }, { feedback: { not: null } }] },
        orderBy: { updatedAt: 'desc' },
        select: {
          id: true,
          userId: true,
          rating: true,
          feedback: true,
          status: true,
          cost: true,
          createdAt: true,
          updatedAt: true,
          parameters: true,
          userProfile: { select: { email: true, firstName: true, lastName: true } },
        },
      }),
    ]);

    const affiliates = affiliatesRaw.map(a => ({
      id: a.id,
      code: a.code,
      commissionPct: a.commissionPct,
      status: a.status,
      createdAt: a.createdAt,
      user: a.userProfile,
      totalClicks: a.clicks.length,
      totalConversions: a.conversions.length,
      conversionRate: a.clicks.length > 0
        ? ((a.conversions.length / a.clicks.length) * 100).toFixed(1)
        : '0.0',
      totalRevenue: a.conversions.reduce((s, c) => s + c.saleAmountUsd, 0),
      totalCommission: a.conversions.reduce((s, c) => s + c.commissionAmt, 0),
      pendingCommission: a.conversions
        .filter(c => c.status === 'pending' || c.status === 'approved')
        .reduce((s, c) => s + c.commissionAmt, 0),
      payouts: a.payouts,
      conversions: a.conversions,
    }));

    const jobsWithFeedback = jobsWithFeedbackRaw.map(j => ({
      ...j,
      parameters: j.parameters ? JSON.parse(j.parameters) : {},
    }));

    const feedbackSummary = {
      thumbsUp: jobsWithFeedback.filter(j => j.rating === 'up').length,
      thumbsDown: jobsWithFeedback.filter(j => j.rating === 'down').length,
      withText: jobsWithFeedback.filter(j => j.feedback && j.feedback.trim().length > 0).length,
      total: jobsWithFeedback.length,
    };

    res.json({ affiliates, jobsWithFeedback, feedbackSummary });
  } catch (error: any) {
    logger.error({ err: error }, 'Failed to fetch admin analytics');
    res.status(500).json({ error: error.message });
  }
});

export default router;
