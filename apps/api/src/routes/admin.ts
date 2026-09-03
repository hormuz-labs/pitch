import * as db from '@saas/db'
import { renderNewsletterEmail, sendNewsletterEmail } from '@saas/email'
import {
  createLogger,
  JOB_CANCELLATIONS_CHANNEL,
  JOB_UPDATES_CHANNEL,
  JobStatus,
  type PhaseUpdate,
} from '@saas/shared'
import { Router } from 'express'
import { connection, videoQueue } from '../config.js'
import { listAllProjects } from '../lib/launch-video/projects.js'
import { requireAuth } from '../middleware/auth.js'

const logger = createLogger('admin-routes')
export const router: Router = Router()

const requireAdmin = async (req: any, res: any, next: any) => {
  const userId = requireAuth(req, res)
  if (!userId) return

  try {
    const profile = await db.prisma.userProfile.findUnique({ where: { id: userId } })
    if (!profile) {
      return res.status(403).json({ error: 'User profile not found' })
    }

    if (profile.role !== 'admin') {
      return res.status(403).json({ error: 'Not authorized as admin' })
    }
    req.adminUser = profile
    next()
  } catch (e: any) {
    logger.error({ err: e }, 'Admin auth check failed')
    res.status(500).json({ error: 'Internal server error checking admin status' })
  }
}

router.use(requireAdmin)

router.get('/newsletter', async (_req, res) => {
  try {
    const subscribers = await db.prisma.newsletterSubscriber.findMany({
      where: { status: { not: 'removed' } },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        email: true,
        firstName: true,
        source: true,
        status: true,
        createdAt: true,
        unsubscribedAt: true,
      },
    })
    res.json({
      subscribers,
      subscribed: subscribers.filter(contact => contact.status === 'subscribed').length,
      unsubscribed: subscribers.filter(contact => contact.status === 'unsubscribed').length,
    })
  } catch (error: any) {
    logger.error({ err: error }, 'Failed to list newsletter audience')
    res.status(500).json({ error: 'Failed to load newsletter audience' })
  }
})

router.post('/newsletter/subscribers', async (req, res) => {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : ''
  const firstName =
    typeof req.body?.firstName === 'string' && req.body.firstName.trim()
      ? req.body.firstName.trim().slice(0, 100)
      : undefined
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Enter a valid email address' })
  }

  try {
    const existing = await db.prisma.newsletterSubscriber.findUnique({ where: { email } })
    if (existing?.status === 'unsubscribed') {
      return res.status(409).json({ error: 'This contact previously unsubscribed' })
    }
    const subscriber = existing
      ? await db.prisma.newsletterSubscriber.update({
          where: { id: existing.id },
          data: {
            ...(firstName ? { firstName } : {}),
            status: 'subscribed',
            unsubscribedAt: null,
            source: 'manual',
          },
        })
      : await db.prisma.newsletterSubscriber.create({
          data: { email, firstName, source: 'manual' },
        })
    return res.status(existing ? 200 : 201).json(subscriber)
  } catch (error: any) {
    logger.error({ err: error, email }, 'Failed to add newsletter contact')
    return res.status(500).json({ error: 'Failed to add newsletter contact' })
  }
})

router.delete('/newsletter/subscribers/:id', async (req, res) => {
  try {
    const deleted = await db.prisma.newsletterSubscriber.updateMany({
      where: { id: req.params.id },
      data: { status: 'removed', unsubscribedAt: new Date() },
    })
    if (!deleted.count) return res.status(404).json({ error: 'Contact not found' })
    return res.status(204).send()
  } catch (error: any) {
    logger.error({ err: error, subscriberId: req.params.id }, 'Failed to delete newsletter contact')
    return res.status(500).json({ error: 'Failed to delete newsletter contact' })
  }
})

router.post('/newsletter/preview', (req, res) => {
  const subject =
    typeof req.body?.subject === 'string' ? req.body.subject.trim().replace(/[—–]/g, '-') : ''
  const message =
    typeof req.body?.message === 'string' ? req.body.message.trim().replace(/[—–]/g, '-') : ''
  const ctaLabel = typeof req.body?.ctaLabel === 'string' ? req.body.ctaLabel.trim() : ''
  const ctaUrl = typeof req.body?.ctaUrl === 'string' ? req.body.ctaUrl.trim() : ''
  if (!subject || !message) {
    return res.status(400).json({ error: 'Subject and message are required for preview' })
  }
  if (ctaUrl && !/^https?:\/\/[^\s]+$/i.test(ctaUrl)) {
    return res.status(400).json({ error: 'CTA URL must be a complete http or https URL' })
  }

  const content = renderNewsletterEmail({
    to: 'preview@trypitch.co',
    firstName: 'Adnan',
    subject,
    message,
    ctaLabel: ctaLabel || undefined,
    ctaUrl: ctaUrl || undefined,
    unsubscribeUrl: 'https://api.trypitch.co/newsletter/unsubscribe?token=preview',
  })
  return res.json({ html: content.html })
})

router.post('/newsletter/send', async (req, res) => {
  const subject =
    typeof req.body?.subject === 'string' ? req.body.subject.trim().replace(/[—–]/g, '-') : ''
  const message =
    typeof req.body?.message === 'string' ? req.body.message.trim().replace(/[—–]/g, '-') : ''
  const ctaLabel = typeof req.body?.ctaLabel === 'string' ? req.body.ctaLabel.trim() : ''
  const ctaUrl = typeof req.body?.ctaUrl === 'string' ? req.body.ctaUrl.trim() : ''
  const recipientIds: string[] | null = Array.isArray(req.body?.recipientIds)
    ? [
        ...new Set<string>(
          req.body.recipientIds.filter((id: unknown): id is string => typeof id === 'string'),
        ),
      ]
    : null
  if (!subject || !message)
    return res.status(400).json({ error: 'Subject and message are required' })
  if (subject.length > 180 || message.length > 20_000) {
    return res.status(400).json({ error: 'Newsletter content is too long' })
  }
  if (ctaLabel.length > 60) return res.status(400).json({ error: 'CTA label is too long' })
  if (ctaUrl && !/^https?:\/\/[^\s]+$/i.test(ctaUrl)) {
    return res.status(400).json({ error: 'CTA URL must be a complete http or https URL' })
  }
  if (recipientIds && recipientIds.length === 0) {
    return res.status(400).json({ error: 'Select at least one subscribed contact' })
  }
  if (recipientIds && recipientIds.length > 5_000) {
    return res.status(400).json({ error: 'Too many recipients selected' })
  }

  try {
    const subscribers = await db.prisma.newsletterSubscriber.findMany({
      where: {
        status: 'subscribed',
        ...(recipientIds ? { id: { in: recipientIds } } : {}),
      },
      select: { email: true, firstName: true, unsubscribeToken: true },
    })
    const publicUrl = (process.env.NEWSLETTER_PUBLIC_URL ?? 'https://api.trypitch.co').replace(
      /\/$/,
      '',
    )
    let sent = 0
    const failures: string[] = []

    // A small concurrency window avoids hammering the mail provider while keeping
    // an admin send responsive for a typical early-stage audience.
    for (let offset = 0; offset < subscribers.length; offset += 8) {
      const batch = subscribers.slice(offset, offset + 8)
      const results = await Promise.all(
        batch.map(contact =>
          sendNewsletterEmail({
            to: contact.email,
            firstName: contact.firstName,
            subject,
            message,
            ctaLabel: ctaLabel || undefined,
            ctaUrl: ctaUrl || undefined,
            unsubscribeUrl: `${publicUrl}/newsletter/unsubscribe?token=${encodeURIComponent(contact.unsubscribeToken)}`,
          }),
        ),
      )
      results.forEach((result, index) => {
        if (result.error) failures.push(batch[index].email)
        else sent += 1
      })
    }

    logger.info({ sent, failed: failures.length }, 'Newsletter broadcast completed')
    res.json({ sent, failed: failures.length, failures })
  } catch (error: any) {
    logger.error({ err: error }, 'Failed to send newsletter broadcast')
    res.status(500).json({ error: 'Failed to send newsletter broadcast' })
  }
})

// 1. Dashboard Overview
router.get('/dashboard', async (_req, res) => {
  try {
    const jobCounts = await videoQueue.getJobCounts(
      'waiting',
      'active',
      'delayed',
      'completed',
      'failed',
    )
    const workers = await videoQueue.getWorkers()

    // Check if queue is paused
    const isPaused = await videoQueue.isPaused()

    const users = await db.prisma.userProfile.findMany({
      orderBy: { createdAt: 'desc' },
      include: { onboardingSurvey: true },
    })

    const userIds = users.map(u => u.id)

    // Fetch balances via ledger aggregate
    const creditAggregates = await db.prisma.creditTransaction.groupBy({
      by: ['userId'],
      _sum: { delta: true },
    })
    const positiveTxAggregates = await db.prisma.creditTransaction.groupBy({
      by: ['userId'],
      where: { delta: { gt: 0 } },
      _sum: { delta: true },
    })

    // Fetch subscriptions and top-ups for all users
    const subscriptions = await db.prisma.subscription.findMany({
      where: { userId: { in: userIds } },
      orderBy: { createdAt: 'desc' },
    })
    const topUps = await db.prisma.topUpPurchase.findMany({
      where: { userId: { in: userIds } },
      orderBy: { createdAt: 'desc' },
    })

    // Aggregate total revenue from top-ups
    const revenueAgg = await db.prisma.topUpPurchase.aggregate({
      _sum: { amountUsd: true },
    })

    // Total job count
    const totalJobs = await db.prisma.job.count()

    const usersData = users.map(u => {
      const balAgg = creditAggregates.find(b => b.userId === u.id)
      const posTxAgg = positiveTxAggregates.find(b => b.userId === u.id)
      const creditsRemaining = balAgg?._sum?.delta ?? 0
      const creditsBought = posTxAgg?._sum?.delta ?? 0

      // Most recent active subscription for this user
      const userSubs = subscriptions.filter(s => s.userId === u.id)
      const activeSub = userSubs.find(s => s.status === 'active') || userSubs[0] || null

      // All top-ups for this user
      const userTopUps = topUps.filter(t => t.userId === u.id)

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
        onboardingSurvey: u.onboardingSurvey,
      }
    })

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
      users: usersData,
    })
  } catch (error: any) {
    logger.error({ err: error }, 'Failed to fetch admin dashboard')
    res.status(500).json({ error: error.message })
  }
})

// 2. Fetch all jobs flat structure
router.get('/jobs', async (_req, res) => {
  try {
    const jobs = await db.prisma.job.findMany({
      orderBy: { createdAt: 'desc' },
      take: 200, // limit to recent 200 for performance, can paginate later
    })

    const userIds = [...new Set(jobs.map(j => j.userId))]
    const profiles = await db.prisma.userProfile.findMany({
      where: { id: { in: userIds } },
      select: { id: true, email: true, firstName: true, lastName: true },
    })

    const refunds = await db.prisma.creditTransaction.findMany({
      where: { type: 'refund' },
    })

    const jobsData = jobs.map((job: any) => {
      let timeTakenMs = null
      if (job.status === 'COMPLETED' || job.status === 'FAILED') {
        timeTakenMs = new Date(job.updatedAt).getTime() - new Date(job.createdAt).getTime()
      }

      const isRefunded = refunds.some((r: any) => r.jobId === job.id)
      const user = profiles.find(p => p.id === job.userId)

      return {
        ...job,
        userEmail: user?.email || 'Unknown',
        userName: `${user?.firstName || ''} ${user?.lastName || ''}`.trim(),
        parameters: job.parameters ? JSON.parse(job.parameters) : {},
        phases: job.phases ? JSON.parse(job.phases) : null,
        timeTakenMs,
        isRefunded,
      }
    })

    res.json(jobsData)
  } catch (error: any) {
    logger.error({ err: error }, 'Failed to fetch global jobs')
    res.status(500).json({ error: error.message })
  }
})

// 2b. Launch video project workspaces and their persisted agent-session metadata
router.get('/launch-videos', async (_req, res) => {
  try {
    const projects = await listAllProjects()
    const userIds = [...new Set(projects.map(p => p.userId))]
    const [profiles, dbProjects] = await Promise.all([
      db.prisma.userProfile.findMany({
        where: { id: { in: userIds } },
        select: { id: true, email: true, firstName: true, lastName: true },
      }),
      db.prisma.launchVideoProject.findMany({
        where: { userId: { in: userIds } },
        select: { userId: true, name: true, createdAt: true },
      }),
    ])

    const createdAtByKey = new Map(
      dbProjects.map(p => [`${p.userId}--${p.name}`, p.createdAt.toISOString()]),
    )

    const projectsData = projects.map(p => {
      const user = profiles.find(u => u.id === p.userId)
      return {
        ...p,
        userEmail: user?.email || 'Unknown',
        userName: `${user?.firstName || ''} ${user?.lastName || ''}`.trim(),
        createdAt: createdAtByKey.get(`${p.userId}--${p.name}`) ?? null,
      }
    })

    res.json(projectsData)
  } catch (error: any) {
    logger.error({ err: error }, 'Failed to fetch launch video projects')
    res.status(500).json({ error: error.message })
  }
})

// 3. User Specific Jobs
router.get('/users/:id/jobs', async (req, res) => {
  const targetUserId = req.params.id
  try {
    const jobs = await db.prisma.job.findMany({
      where: { userId: targetUserId },
      orderBy: { createdAt: 'desc' },
    })

    const refunds = await db.prisma.creditTransaction.findMany({
      where: { userId: targetUserId, type: 'refund' },
    })

    const jobsData = jobs.map((job: any) => {
      let timeTakenMs = null
      if (job.status === 'COMPLETED' || job.status === 'FAILED') {
        timeTakenMs = new Date(job.updatedAt).getTime() - new Date(job.createdAt).getTime()
      }
      const isRefunded = refunds.some((r: any) => r.jobId === job.id)

      return {
        ...job,
        parameters: job.parameters ? JSON.parse(job.parameters) : {},
        phases: job.phases ? JSON.parse(job.phases) : null,
        timeTakenMs,
        isRefunded,
      }
    })

    res.json(jobsData)
  } catch (error: any) {
    logger.error({ err: error }, 'Failed to fetch user jobs')
    res.status(500).json({ error: error.message })
  }
})

// 4. Delete / Cancel Job (Bypass RLS)
router.delete('/jobs/:id', async (req, res) => {
  const { id } = req.params
  try {
    // 1. Abort active processing via PubSub
    await connection.publish(JOB_CANCELLATIONS_CHANNEL, JSON.stringify({ jobId: id }))

    // 2. Remove from BullMQ
    const bullJob = await videoQueue.getJob(id)
    if (bullJob) {
      await bullJob.remove().catch(e => logger.warn({ err: e }, 'Failed to remove job from BullMQ'))
    }

    // 3. Mark as FAILED if currently PROCESSING, otherwise delete
    const job = await db.getJob(id)
    if (job && job.status === JobStatus.PROCESSING) {
      let newPhases: PhaseUpdate[] = []
      if (job.phases) {
        newPhases = job.phases.map(p => {
          if (p.status === 'running') {
            return { ...p, status: 'failed', completedAt: new Date().toISOString() }
          }
          return p
        })
      }
      const failedJob = await db.updateJob(id, {
        status: JobStatus.FAILED,
        error: 'Video generation was cancelled/aborted by the administrator.',
        ...(newPhases.length > 0 ? { phases: JSON.stringify(newPhases) } : {}),
      })
      await connection.publish(JOB_UPDATES_CHANNEL, JSON.stringify(failedJob))

      const isPdf = job.parameters?.jobType === 'pdf'
      const refundCredits = isPdf ? 1 : 3
      await db.addCredits(
        job.userId,
        refundCredits,
        'refund',
        `Refund: ${isPdf ? 'PDF' : 'video'} generation cancelled by admin`,
        { jobId: id },
      )
      logger.info(
        { jobId: id },
        `Job marked as failed by admin and ${refundCredits} credits refunded`,
      )
    } else {
      await db.prisma.job.delete({ where: { id } })
      logger.info({ jobId: id }, 'Job deleted by admin')
    }

    res.status(204).send()
  } catch (error: any) {
    logger.error({ err: error }, 'Failed to delete job as admin')
    res.status(500).json({ error: error.message })
  }
})

// 4b. Update Job Status
router.post('/jobs/:id/status', async (req, res) => {
  const { id } = req.params
  const { status } = req.body

  const validStatuses = ['PENDING', 'PROCESSING', 'AWAITING_REVIEW', 'COMPLETED', 'FAILED']
  if (!validStatuses.includes(status)) {
    return res
      .status(400)
      .json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` })
  }

  try {
    const job = await db.prisma.job.findUnique({ where: { id } })
    if (!job) {
      return res.status(404).json({ error: 'Job not found' })
    }

    const updatedJob = await db.updateJob(id, {
      status: status as any,
    })

    if (status === 'FAILED') {
      const existingRefund = await db.prisma.creditTransaction.findFirst({
        where: { jobId: id, type: 'refund' },
      })
      if (!existingRefund) {
        let isPdf = false
        try {
          const parsedParams = JSON.parse(job.parameters)
          isPdf = parsedParams?.jobType === 'pdf'
        } catch {}
        const refundCredits = isPdf ? 1 : 3
        await db.addCredits(
          job.userId,
          refundCredits,
          'refund',
          `Refund: ${isPdf ? 'PDF' : 'video'} generation failed`,
          { jobId: id },
        )
        logger.info(
          { jobId: id },
          `Job marked as failed manually and ${refundCredits} credits refunded`,
        )
      }
    }

    await connection.publish(JOB_UPDATES_CHANNEL, JSON.stringify(updatedJob))
    logger.info({ jobId: id, status }, 'Job status manually updated by admin')

    res.json({ success: true, job: updatedJob })
  } catch (error: any) {
    logger.error({ err: error, jobId: id }, 'Failed to update job status as admin')
    res.status(500).json({ error: error.message })
  }
})

// 5. Global Queue Pause / Resume
router.post('/queue/toggle', async (_req, res) => {
  try {
    const isPaused = await videoQueue.isPaused()
    if (isPaused) {
      await videoQueue.resume()
    } else {
      await videoQueue.pause()
    }
    res.json({ paused: !isPaused })
  } catch (error: any) {
    logger.error({ err: error }, 'Failed to toggle queue state')
    res.status(500).json({ error: error.message })
  }
})

// 6. Per-user financials: subscriptions, top-ups, credit ledger, balance, and user profile
router.get('/users/:id/financials', async (req, res) => {
  const { id } = req.params
  try {
    const [subscriptions, topUps, transactions, balance, user] = await Promise.all([
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
      db.getCreditBalance(id),
      db.prisma.userProfile.findUnique({
        where: { id },
      }),
    ])
    res.json({ subscriptions, topUps, transactions, balance, user })
  } catch (error: any) {
    logger.error({ err: error }, 'Failed to fetch user financials')
    res.status(500).json({ error: error.message })
  }
})

// 6b. Manually add or deduct user credits
router.post('/users/:id/credits', async (req, res) => {
  const targetUserId = req.params.id
  const { amount, description, isDeduction } = req.body

  if (
    typeof amount !== 'number' ||
    Number.isNaN(amount) ||
    amount <= 0 ||
    !Number.isInteger(amount)
  ) {
    return res.status(400).json({ error: 'Amount must be a positive integer' })
  }

  try {
    const delta = isDeduction ? -amount : amount
    const desc =
      description || `Manual admin adjustment: ${isDeduction ? '-' : '+'}${amount} credits`

    const newBalance = await db.addCredits(targetUserId, delta, 'admin_adjustment', desc)
    res.json({ success: true, newBalance })
  } catch (error: any) {
    logger.error({ err: error }, 'Failed to adjust user credits')
    res.status(500).json({ error: error.message })
  }
})

// 7. Per-user affiliate record
router.get('/users/:id/affiliate', async (req, res) => {
  const { id } = req.params
  try {
    const affiliate = await db.prisma.affiliate.findUnique({
      where: { userId: id },
      include: {
        clicks: { orderBy: { clickedAt: 'desc' }, take: 100 },
        conversions: { orderBy: { createdAt: 'desc' } },
        _count: { select: { leads: true } },
      },
    })
    if (!affiliate) return res.json(null)

    const creditAgg = await db.prisma.creditTransaction.aggregate({
      where: { userId: id, type: 'referral' },
      _sum: { delta: true },
    })
    const creditsEarned = creditAgg._sum.delta ?? 0

    res.json({
      ...affiliate,
      signups: affiliate._count.leads,
      creditsEarned,
      videosEarned: Math.floor(creditsEarned / 3),
    })
  } catch (error: any) {
    logger.error({ err: error }, 'Failed to fetch user affiliate')
    res.status(500).json({ error: error.message })
  }
})

// 8. Analytics: feedback summary + affiliates overview
router.get('/analytics', async (_req, res) => {
  try {
    const [affiliatesRaw, jobsWithFeedbackRaw, referralCreditRows] = await Promise.all([
      db.prisma.affiliate.findMany({
        include: {
          userProfile: { select: { email: true, firstName: true, lastName: true, imageUrl: true } },
          clicks: true,
          conversions: true,
          _count: { select: { leads: true } },
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
      // Referral credits earned, summed per affiliate user.
      db.prisma.creditTransaction.groupBy({
        by: ['userId'],
        where: { type: 'referral', delta: { gt: 0 } },
        _sum: { delta: true },
      }),
    ])

    const creditsByUser = new Map(referralCreditRows.map(r => [r.userId, r._sum.delta ?? 0]))

    const affiliates = affiliatesRaw.map(a => {
      const creditsEarned = creditsByUser.get(a.userId) ?? 0
      return {
        id: a.id,
        code: a.code,
        status: a.status,
        createdAt: a.createdAt,
        user: a.userProfile,
        totalClicks: a.clicks.length,
        totalSignups: a._count.leads,
        totalConversions: a.conversions.length,
        conversionRate:
          a.clicks.length > 0 ? ((a.conversions.length / a.clicks.length) * 100).toFixed(1) : '0.0',
        totalRevenue: a.conversions.reduce((s, c) => s + c.saleAmountUsd, 0),
        creditsEarned,
        videosEarned: Math.floor(creditsEarned / 3),
        conversions: a.conversions,
      }
    })

    const jobsWithFeedback = jobsWithFeedbackRaw.map(j => ({
      ...j,
      parameters: j.parameters ? JSON.parse(j.parameters) : {},
    }))

    const feedbackSummary = {
      thumbsUp: jobsWithFeedback.filter(j => j.rating === 'up').length,
      thumbsDown: jobsWithFeedback.filter(j => j.rating === 'down').length,
      withText: jobsWithFeedback.filter(j => j.feedback && j.feedback.trim().length > 0).length,
      total: jobsWithFeedback.length,
    }

    res.json({ affiliates, jobsWithFeedback, feedbackSummary })
  } catch (error: any) {
    logger.error({ err: error }, 'Failed to fetch admin analytics')
    res.status(500).json({ error: error.message })
  }
})

export default router
