/**
 * Admin: users, projects, credits, affiliates, analytics. Projects replace
 * jobs; the old Job table is read for feedback/history only.
 */
import * as db from '@saas/db'
import { createLogger } from '@saas/shared'
import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { deleteProject, failProject, getRow } from '../projects/service.js'
import { listBusy } from '../studio/session.js'

const logger = createLogger('studio:admin')
export const router: Router = Router()

const requireAdmin = async (req: any, res: any, next: any) => {
  const userId = requireAuth(req, res)
  if (!userId) return
  try {
    const profile = await db.prisma.userProfile.findUnique({ where: { id: userId } })
    if (!profile) return res.status(403).json({ error: 'User profile not found' })
    if (profile.role !== 'admin') return res.status(403).json({ error: 'Not authorized as admin' })
    req.adminUser = profile
    next()
  } catch (e: any) {
    logger.error({ err: e }, 'Admin auth check failed')
    res.status(500).json({ error: 'Internal server error checking admin status' })
  }
}
router.use(requireAdmin)

const parse = (v: unknown, fallback: any) => {
  try {
    return typeof v === 'string' ? JSON.parse(v) : (v ?? fallback)
  } catch {
    return fallback
  }
}

// 1. Dashboard overview
router.get('/dashboard', async (_req, res) => {
  try {
    const users = await db.prisma.userProfile.findMany({
      orderBy: { createdAt: 'desc' },
      include: { onboardingSurvey: true },
    })
    const userIds = users.map(u => u.id)
    const creditAggregates = await db.prisma.creditTransaction.groupBy({
      by: ['userId'],
      _sum: { delta: true },
    })
    const positiveTxAggregates = await db.prisma.creditTransaction.groupBy({
      by: ['userId'],
      where: { delta: { gt: 0 } },
      _sum: { delta: true },
    })
    const subscriptions = await db.prisma.subscription.findMany({
      where: { userId: { in: userIds } },
      orderBy: { createdAt: 'desc' },
    })
    const topUps = await db.prisma.topUpPurchase.findMany({
      where: { userId: { in: userIds } },
      orderBy: { createdAt: 'desc' },
    })
    const revenueAgg = await db.prisma.topUpPurchase.aggregate({ _sum: { amountUsd: true } })
    const [totalProjects, totalLegacyJobs, failedProjects] = await Promise.all([
      db.prisma.project.count(),
      db.prisma.job.count(),
      db.prisma.project.count({ where: { lastError: { not: null } } }),
    ])
    const busy = listBusy()

    const usersData = users.map(u => {
      const balAgg = creditAggregates.find(b => b.userId === u.id)
      const posTxAgg = positiveTxAggregates.find(b => b.userId === u.id)
      const userSubs = subscriptions.filter(s => s.userId === u.id)
      const activeSub = userSubs.find(s => s.status === 'active') || userSubs[0] || null
      return {
        id: u.id,
        email: u.email,
        firstName: u.firstName,
        lastName: u.lastName,
        imageUrl: u.imageUrl,
        role: u.role,
        createdAt: u.createdAt,
        updatedAt: u.updatedAt,
        creditsRemaining: balAgg?._sum?.delta ?? 0,
        creditsBought: posTxAgg?._sum?.delta ?? 0,
        subscription: activeSub,
        topUps: topUps.filter(t => t.userId === u.id),
        onboardingSurvey: u.onboardingSurvey,
      }
    })

    res.json({
      stats: {
        activeSessions: busy.size,
        totalProjects,
        failedProjects,
        totalLegacyJobs,
        totalUsers: users.length,
        totalRevenue: revenueAgg._sum?.amountUsd ?? 0,
      },
      users: usersData,
    })
  } catch (error: any) {
    logger.error({ err: error }, 'Failed to fetch admin dashboard')
    res.status(500).json({ error: error.message })
  }
})

async function decorate(rows: any[]) {
  const userIds = [...new Set(rows.map(r => r.userId))]
  const profiles = await db.prisma.userProfile.findMany({
    where: { id: { in: userIds } },
    select: { id: true, email: true, firstName: true, lastName: true },
  })
  const refunds = await db.prisma.creditTransaction.findMany({
    where: { type: 'refund', projectId: { in: rows.map(r => r.id) } },
    select: { projectId: true },
  })
  const refunded = new Set(refunds.map(r => r.projectId))
  const busy = listBusy()
  return rows.map(r => {
    const user = profiles.find(p => p.id === r.userId)
    const outputs = parse(r.outputs, [])
    return {
      ...r,
      options: parse(r.options, {}),
      outputs,
      status: busy.has(r.id)
        ? 'working'
        : r.lastError
          ? 'failed'
          : outputs.length
            ? 'ready'
            : r.legacyJobId
              ? 'legacy'
              : 'empty',
      userEmail: user?.email || 'Unknown',
      userName: `${user?.firstName || ''} ${user?.lastName || ''}`.trim(),
      isRefunded: refunded.has(r.id),
    }
  })
}

// 2. All projects (recent 300)
router.get('/projects', async (_req, res) => {
  try {
    const rows = await db.prisma.project.findMany({ orderBy: { createdAt: 'desc' }, take: 300 })
    res.json(await decorate(rows))
  } catch (error: any) {
    logger.error({ err: error }, 'Failed to fetch projects')
    res.status(500).json({ error: error.message })
  }
})

// 3. A user's projects
router.get('/users/:id/projects', async (req, res) => {
  try {
    const rows = await db.prisma.project.findMany({
      where: { userId: req.params.id },
      orderBy: { createdAt: 'desc' },
    })
    res.json(await decorate(rows))
  } catch (error: any) {
    logger.error({ err: error }, 'Failed to fetch user projects')
    res.status(500).json({ error: error.message })
  }
})

// 4. Delete a project (abort + workspace) as admin
router.delete('/projects/:id', async (req, res) => {
  try {
    const row = await db.prisma.project.findUnique({ where: { id: req.params.id } })
    if (!row) return res.status(404).json({ error: 'Project not found' })
    await deleteProject(row.userId, row.id)
    res.status(204).send()
  } catch (error: any) {
    logger.error({ err: error }, 'Failed to delete project as admin')
    res.status(500).json({ error: error.message })
  }
})

// 4b. Mark failed + refund (one-off support action)
router.post('/projects/:id/fail', async (req, res) => {
  try {
    const row = await db.prisma.project.findUnique({ where: { id: req.params.id } })
    if (!row) return res.status(404).json({ error: 'Project not found' })
    const p = await getRow(row.userId, row.id)
    const existingRefund = await db.prisma.creditTransaction.findFirst({
      where: { projectId: p.id, type: 'refund' },
    })
    await failProject(
      p,
      String(req.body?.reason || 'Marked failed by an administrator'),
      !existingRefund,
    )
    res.json({ success: true })
  } catch (error: any) {
    logger.error({ err: error }, 'Failed to fail project as admin')
    res.status(500).json({ error: error.message })
  }
})

// 4c. Legacy: there is no queue any more; the admin UI still asks.
router.post('/queue/toggle', (_req, res) => res.json({ paused: false }))

// 5. Per-user financials
router.get('/users/:id/financials', async (req, res) => {
  const { id } = req.params
  try {
    const [subscriptions, topUps, transactions, balance, user] = await Promise.all([
      db.prisma.subscription.findMany({ where: { userId: id }, orderBy: { createdAt: 'desc' } }),
      db.prisma.topUpPurchase.findMany({ where: { userId: id }, orderBy: { createdAt: 'desc' } }),
      db.prisma.creditTransaction.findMany({
        where: { userId: id },
        orderBy: { createdAt: 'desc' },
        take: 150,
      }),
      db.getCreditBalance(id),
      db.prisma.userProfile.findUnique({ where: { id } }),
    ])
    res.json({ subscriptions, topUps, transactions, balance, user })
  } catch (error: any) {
    logger.error({ err: error }, 'Failed to fetch user financials')
    res.status(500).json({ error: error.message })
  }
})

// 5b. Manual credit adjustment
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

// 6. Per-user affiliate record
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

// 7. Analytics: feedback summary (legacy jobs) + affiliates overview
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
      parameters: parse(j.parameters, {}),
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
