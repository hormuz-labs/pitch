/**
 * Admin: users, projects, credits, affiliates, analytics. Projects replace
 * projects.
 */
import * as db from '@saas/db'
import { renderNewsletterEmail, sendNewsletterEmail } from '@saas/email'
import { createLogger } from '@saas/shared'
import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { normalizePublishedOutputs, normalizePublishedUrl } from '../projects/output-urls.js'
import { parseRow } from '../projects/rows.js'
import {
  busyProjects,
  deleteProject,
  failProject,
  getEntries,
  getRow,
} from '../projects/service.js'

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
    const [totalProjects, failedProjects, busyRows] = await Promise.all([
      db.prisma.project.count(),
      db.prisma.project.count({ where: { lastError: { not: null } } }),
      db.prisma.project.findMany({ where: { busyAt: { not: null } } }),
    ])
    const busy = await busyProjects(busyRows.map(parseRow))

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
        gptEnabled: u.gptEnabled,
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

router.patch('/users/:id/gpt-access', async (req, res) => {
  if (typeof req.body?.gptEnabled !== 'boolean') {
    return res.status(400).json({ error: 'gptEnabled must be a boolean' })
  }
  try {
    const result = await db.prisma.userProfile.updateMany({
      where: { id: req.params.id },
      data: { gptEnabled: req.body.gptEnabled },
    })
    if (!result.count) return res.status(404).json({ error: 'User not found' })
    res.json({ gptEnabled: req.body.gptEnabled })
  } catch (error) {
    logger.error({ err: error }, 'Failed to update GPT access')
    res.status(500).json({ error: 'Failed to update GPT access' })
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
  const busy = await busyProjects(rows.map(parseRow))
  return rows.map(r => {
    const user = profiles.find(p => p.id === r.userId)
    const outputs = normalizePublishedOutputs(parse(r.outputs, []))
    const videoOutput = outputs.find(
      (o: any) => o.kind === 'video' || o.url?.endsWith('.mp4') || o.url?.endsWith('.webm'),
    )
    const finalVideoUrl =
      videoOutput?.url ||
      (r.thumbnailUrl?.endsWith('.mp4') ? normalizePublishedUrl(r.thumbnailUrl) : null)

    return {
      ...r,
      options: parse(r.options, {}),
      outputs,
      thumbnailUrl: r.thumbnailUrl ? normalizePublishedUrl(r.thumbnailUrl) : null,
      finalVideoUrl,
      status: busy.has(r.id)
        ? 'working'
        : r.lastError
          ? 'failed'
          : outputs.length
            ? 'ready'
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

// 2b. Single project detailed view (prompts, entries, render jobs, transactions, final video)
router.get('/projects/:id', async (req, res) => {
  try {
    const row = await db.prisma.project.findUnique({ where: { id: req.params.id } })
    if (!row) return res.status(404).json({ error: 'Project not found' })

    const [decorated] = await decorate([row])

    let entries: any[] = []
    let activeModel: string | null = null
    try {
      if (typeof getEntries === 'function') {
        const p = parseRow(row)
        const messages = await getEntries(p)
        entries = messages?.entries || []
        activeModel = messages?.activeModel || null
      }
    } catch (err) {
      logger.debug({ err, projectId: row.id }, 'could not fetch project entries for admin')
    }

    const userPrompts: Array<{ text: string; at: number }> = []
    if (row.prompt?.trim()) {
      userPrompts.push({ text: row.prompt.trim(), at: row.createdAt.getTime() })
    }
    for (const e of entries) {
      if (e.role === 'user' && e.text?.trim()) {
        const text = e.text.trim()
        if (!userPrompts.some(up => up.text === text)) {
          userPrompts.push({ text, at: e.at || row.createdAt.getTime() })
        }
      }
    }

    const [renderJobs, creditTransactions, userProfile] = await Promise.all([
      db.prisma.renderJob.findMany({
        where: { projectId: row.id },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      db.prisma.creditTransaction.findMany({
        where: { projectId: row.id },
        orderBy: { createdAt: 'desc' },
      }),
      db.prisma.userProfile.findUnique({
        where: { id: row.userId },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          imageUrl: true,
          role: true,
          createdAt: true,
        },
      }),
    ])

    res.json({
      ...decorated,
      user: userProfile,
      userPrompts,
      entries,
      activeModel,
      renderJobs: renderJobs.map(j => ({
        ...j,
        params: parse(j.params, {}),
        result: parse(j.result, null),
      })),
      creditTransactions,
    })
  } catch (error: any) {
    logger.error({ err: error }, 'Failed to fetch project details')
    res.status(500).json({ error: error.message })
  }
})

// 3. User details (profile, financials, survey, affiliate, projects)
router.get('/users/:id', async (req, res) => {
  const { id } = req.params
  try {
    const [
      user,
      subscriptions,
      topUps,
      transactions,
      balance,
      projectsRaw,
      affiliate,
      creditAgg,
      positiveTxAgg,
    ] = await Promise.all([
      db.prisma.userProfile.findUnique({
        where: { id },
        include: { onboardingSurvey: true },
      }),
      db.prisma.subscription.findMany({ where: { userId: id }, orderBy: { createdAt: 'desc' } }),
      db.prisma.topUpPurchase.findMany({ where: { userId: id }, orderBy: { createdAt: 'desc' } }),
      db.prisma.creditTransaction.findMany({
        where: { userId: id },
        orderBy: { createdAt: 'desc' },
        take: 150,
      }),
      db.getCreditBalance(id),
      db.prisma.project.findMany({
        where: { userId: id },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      db.prisma.affiliate.findUnique({
        where: { userId: id },
        include: {
          clicks: { orderBy: { clickedAt: 'desc' }, take: 50 },
          conversions: { orderBy: { createdAt: 'desc' } },
          _count: { select: { leads: true } },
        },
      }),
      db.prisma.creditTransaction.aggregate({
        where: { userId: id, type: 'referral' },
        _sum: { delta: true },
      }),
      db.prisma.creditTransaction.aggregate({
        where: { userId: id, delta: { gt: 0 } },
        _sum: { delta: true },
      }),
    ])

    if (!user) return res.status(404).json({ error: 'User not found' })

    const projects = await decorate(projectsRaw)
    const referralCredits = creditAgg._sum.delta ?? 0

    res.json({
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        imageUrl: user.imageUrl,
        username: user.username,
        discordUserId: user.discordUserId,
        role: user.role,
        gptEnabled: user.gptEnabled,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        onboardingSkippedAt: user.onboardingSkippedAt,
        onboardingSurvey: user.onboardingSurvey,
      },
      credits: {
        remaining: balance,
        lifetimeBought: positiveTxAgg._sum.delta ?? 0,
      },
      subscription: subscriptions.find(s => s.status === 'active') || subscriptions[0] || null,
      subscriptions,
      topUps,
      transactions,
      projects,
      affiliate: affiliate
        ? {
            id: affiliate.id,
            code: affiliate.code,
            status: affiliate.status,
            createdAt: affiliate.createdAt,
            totalClicks: affiliate.clicks.length,
            totalSignups: affiliate._count.leads,
            totalConversions: affiliate.conversions.length,
            creditsEarned: referralCredits,
            videosEarned: Math.floor(referralCredits / 3),
            totalRevenue: affiliate.conversions.reduce((s, c) => s + c.saleAmountUsd, 0),
          }
        : null,
    })
  } catch (error: any) {
    logger.error({ err: error }, 'Failed to fetch user details for admin')
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

// 7. Analytics: affiliates overview
router.get('/analytics', async (_req, res) => {
  try {
    const [affiliatesRaw, referralCreditRows] = await Promise.all([
      db.prisma.affiliate.findMany({
        include: {
          userProfile: { select: { email: true, firstName: true, lastName: true, imageUrl: true } },
          clicks: true,
          conversions: true,
          _count: { select: { leads: true } },
        },
        orderBy: { createdAt: 'desc' },
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
    res.json({ affiliates })
  } catch (error: any) {
    logger.error({ err: error }, 'Failed to fetch admin analytics')
    res.status(500).json({ error: error.message })
  }
})

// ── Newsletter ───────────────────────────────────────────────────────────────
// The email list and its broadcasts. Brought over from apps/api when the
// flows collapsed into the studio; the routes are unchanged.

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

router.post('/newsletter/sync-users', async (_req, res) => {
  try {
    const users = await db.prisma.userProfile.findMany({
      select: { id: true, email: true, firstName: true },
    })
    let added = 0
    let updated = 0
    let suppressed = 0

    for (const user of users) {
      const email = user.email.trim().toLowerCase()
      const existing = await db.prisma.newsletterSubscriber.findFirst({
        where: { OR: [{ userId: user.id }, { email }] },
      })
      if (existing) {
        await db.prisma.newsletterSubscriber.update({
          where: { id: existing.id },
          data: { email, firstName: user.firstName, userId: user.id },
        })
        updated += 1
        if (existing.status !== 'subscribed') suppressed += 1
      } else {
        await db.prisma.newsletterSubscriber.create({
          data: { email, firstName: user.firstName, userId: user.id, source: 'user-sync' },
        })
        added += 1
      }
    }

    logger.info({ users: users.length, added, updated, suppressed }, 'Synced users to newsletter')
    return res.json({ users: users.length, added, updated, suppressed })
  } catch (error: any) {
    logger.error({ err: error }, 'Failed to sync users to newsletter')
    return res.status(500).json({ error: 'Failed to sync users to newsletter' })
  }
})

router.get('/newsletter/history', async (_req, res) => {
  try {
    const campaigns = await db.prisma.newsletterCampaign.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { deliveries: { orderBy: { createdAt: 'asc' } } },
    })
    return res.json(campaigns)
  } catch (error: any) {
    logger.error({ err: error }, 'Failed to load newsletter history')
    return res.status(500).json({ error: 'Failed to load newsletter history' })
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
    const admin = (req as any).adminUser as {
      id: string
      email: string
      firstName?: string | null
      lastName?: string | null
    }
    const campaign = await db.prisma.newsletterCampaign.create({
      data: {
        subject,
        message,
        ctaLabel: ctaLabel || null,
        ctaUrl: ctaUrl || null,
        sentByUserId: admin.id,
        sentByEmail: admin.email,
        sentByName: [admin.firstName, admin.lastName].filter(Boolean).join(' ') || null,
        recipientCount: subscribers.length,
      },
    })
    const deliveries: Array<{
      campaignId: string
      email: string
      firstName: string | null
      status: string
      providerId: string | null
      error: string | null
    }> = []

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
            unsubscribeUrl: `${publicUrl}/newsletter/unsubscribe?token=${encodeURIComponent(contact.unsubscribeToken || '')}`,
          }),
        ),
      )
      results.forEach((result, index) => {
        const contact = batch[index]
        if (result.error) failures.push(contact.email)
        else sent += 1
        deliveries.push({
          campaignId: campaign.id,
          email: contact.email,
          firstName: contact.firstName,
          status: result.error ? 'failed' : 'sent',
          providerId: result.id ?? null,
          error: result.error ?? null,
        })
      })
    }

    if (deliveries.length) {
      await db.prisma.newsletterDelivery.createMany({ data: deliveries })
    }
    await db.prisma.newsletterCampaign.update({
      where: { id: campaign.id },
      data: {
        status: failures.length ? (sent ? 'partial' : 'failed') : 'completed',
        sentCount: sent,
        failedCount: failures.length,
        completedAt: new Date(),
      },
    })

    logger.info({ sent, failed: failures.length }, 'Newsletter broadcast completed')
    res.json({ sent, failed: failures.length, failures, campaignId: campaign.id })
  } catch (error: any) {
    logger.error({ err: error }, 'Failed to send newsletter broadcast')
    res.status(500).json({ error: 'Failed to send newsletter broadcast' })
  }
})

export default router
