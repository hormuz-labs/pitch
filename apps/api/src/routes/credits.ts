import * as db from '@saas/db'
import { createLogger } from '@saas/shared'
import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { router as discordRewardRouter } from './discord-reward.js'

const logger = createLogger('api')

export const router = Router()
router.use('/discord', discordRewardRouter)

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/
const MAX_USAGE_RANGE_DAYS = 366

/** Every UTC calendar day from `from` to `to`, inclusive, as `YYYY-MM-DD`. */
function daysBetween(from: Date, to: Date): string[] {
  const days: string[] = []
  for (let t = from.getTime(); t <= to.getTime(); t += 24 * 60 * 60 * 1000) {
    days.push(new Date(t).toISOString().slice(0, 10))
  }
  return days
}

/**
 * GET /credits
 *
 * Returns the full billing summary for the authenticated user:
 * - balance: calculated main-platform balance (Discord sponsorship excluded)
 * - activeSubscription: current active subscription if any
 * - subscriptions: full subscription history
 * - topUps: all one-time top-up purchases
 * - transactions: immutable main-platform ledger, newest first
 */
router.get('/', async (req, res) => {
  const userId = requireAuth(req, res)
  if (!userId) return

  try {
    const [summary, availableBalance, projects] = await Promise.all([
      db.getCreditSummary(userId),
      db.getAvailableCreditBalance(userId),
      db.prisma.project.findMany({
        where: {
          userId,
          // New bot projects spend regular credits; historical sponsored
          // projects remain outside this main-platform usage summary.
          OR: [
            { source: { not: 'discord' } },
            { creditTransactions: { none: { channel: 'discord' } } },
          ],
        },
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
      balance: availableBalance,
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

/**
 * GET /credits/usage/daily?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * One bar per UTC calendar day in the range (inclusive, both ends filled even
 * when nothing was spent), split into what the app spent vs. what the public
 * API spent — the distinction the settings chart draws as two colors.
 */
router.get('/usage/daily', async (req, res) => {
  const userId = requireAuth(req, res)
  if (!userId) return

  const fromRaw = req.query.from
  const toRaw = req.query.to
  if (typeof fromRaw !== 'string' || typeof toRaw !== 'string') {
    return res.status(400).json({ error: 'from and to are required (YYYY-MM-DD)' })
  }
  if (!DATE_ONLY.test(fromRaw) || !DATE_ONLY.test(toRaw)) {
    return res.status(400).json({ error: 'from and to must be dates in YYYY-MM-DD form' })
  }
  const from = new Date(`${fromRaw}T00:00:00.000Z`)
  const to = new Date(`${toRaw}T00:00:00.000Z`)
  if (from.getTime() > to.getTime()) {
    return res.status(400).json({ error: 'from must not be after to' })
  }
  const days = daysBetween(from, to)
  if (days.length > MAX_USAGE_RANGE_DAYS) {
    return res.status(400).json({ error: `Range cannot exceed ${MAX_USAGE_RANGE_DAYS} days` })
  }

  try {
    // Spend is negative delta; the raw query flips the sign per channel so a
    // day with nothing spent is absent rather than a row of zeros — the
    // in-memory fill below is what actually guarantees every day appears.
    const rows = await db.prisma.$queryRaw<Array<{ day: Date; studio: bigint; api: bigint }>>`
      SELECT
        date_trunc('day', "createdAt" AT TIME ZONE 'UTC') AS day,
        SUM(CASE WHEN "channel" = 'product' THEN -"delta" ELSE 0 END)::bigint AS studio,
        SUM(CASE WHEN "channel" = 'api' THEN -"delta" ELSE 0 END)::bigint AS api
      FROM "CreditTransaction"
      WHERE "userId" = ${userId}
        AND "type" = 'usage'
        AND "channel" IN ('product', 'api')
        AND "createdAt" >= ${from}
        AND "createdAt" < ${new Date(to.getTime() + 24 * 60 * 60 * 1000)}
      GROUP BY day
    `
    const byDay = new Map(rows.map(row => [row.day.toISOString().slice(0, 10), row] as const))
    res.json(
      days.map(date => {
        const row = byDay.get(date)
        return { date, studio: Number(row?.studio ?? 0), api: Number(row?.api ?? 0) }
      }),
    )
  } catch (error: any) {
    logger.error({ err: error, userId }, 'Failed to fetch daily credit usage')
    res.status(500).json({ error: error.message })
  }
})
