import * as db from '@saas/db'
import { createLogger } from '@saas/shared'
import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'

const logger = createLogger('api')

export const router = Router()

/**
 * GET /credits
 *
 * Returns the full billing summary for the authenticated user:
 * - balance: calculated credit balance (SUM of all transactions)
 * - activeSubscription: current active subscription if any
 * - subscriptions: full subscription history
 * - topUps: all one-time top-up purchases
 * - transactions: immutable credit ledger, newest first
 */
router.get('/', async (req, res) => {
  const userId = requireAuth(req, res)
  if (!userId) return

  try {
    const [summary, projects] = await Promise.all([
      db.getCreditSummary(userId),
      db.prisma.project.findMany({
        where: { userId },
        select: {
          id: true,
          title: true,
          creditsCharged: true,
          usageUsd: true,
          updatedAt: true,
        },
        orderBy: { updatedAt: 'desc' },
      }),
    ])
    res.json({
      ...summary,
      usage: {
        credits: projects.reduce((total, project) => total + project.creditsCharged, 0),
        usd: projects.reduce((total, project) => total + project.usageUsd, 0),
        projects,
      },
    })
  } catch (error: any) {
    logger.error({ err: error, userId }, 'Failed to fetch credits')
    res.status(500).json({ error: error.message })
  }
})
