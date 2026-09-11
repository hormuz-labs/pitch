/**
 * Promo codes.
 *
 * A code carries credits, so the only rule that really matters is that one
 * account can redeem it once. That is enforced by the unique (userId, codeId)
 * row rather than by the checks below: two simultaneous requests both pass the
 * pre-checks, and the index is what settles which one pays out.
 */
import * as db from '@saas/db'
import { createLogger } from '@saas/shared'
import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'

const logger = createLogger('api')

export const router = Router()

/** Codes are minted by hand, so creating them is an admin-only act. */
async function requireAdmin(req: any, res: any): Promise<boolean> {
  const userId = requireAuth(req, res)
  if (!userId) return false
  const profile = await db.prisma.userProfile.findUnique({ where: { id: userId } })
  if (profile?.role !== 'admin') {
    res.status(403).json({ error: 'Not authorized as admin' })
    return false
  }
  return true
}

router.post('/codes', async (req, res) => {
  if (!(await requireAdmin(req, res))) return

  const body = req.body as Record<string, unknown>
  const code = typeof body.code === 'string' ? body.code.trim().toUpperCase() : ''
  const credits = typeof body.credits === 'number' ? Math.floor(body.credits) : 0
  if (!code) return res.status(400).json({ error: 'code is required' })
  if (credits <= 0) return res.status(400).json({ error: 'credits must be greater than zero' })

  const maxRedemptions =
    typeof body.maxRedemptions === 'number' ? Math.floor(body.maxRedemptions) : null
  const expiresAt = typeof body.expiresAt === 'string' ? new Date(body.expiresAt) : null
  if (expiresAt && Number.isNaN(expiresAt.getTime())) {
    return res.status(400).json({ error: 'expiresAt must be a date' })
  }

  try {
    const promo = await db.prisma.promoCode.create({
      data: { code, credits, maxRedemptions, expiresAt },
    })
    res.status(201).json(promo)
  } catch (error: any) {
    if (error?.code === 'P2002') return res.status(409).json({ error: 'That code already exists' })
    logger.error({ err: error, code }, 'Failed to create promo code')
    res.status(500).json({ error: error.message })
  }
})

router.get('/codes', async (req, res) => {
  if (!(await requireAdmin(req, res))) return

  try {
    res.json(await db.prisma.promoCode.findMany({ orderBy: { createdAt: 'desc' } }))
  } catch (error: any) {
    logger.error({ err: error }, 'Failed to list promo codes')
    res.status(500).json({ error: error.message })
  }
})

router.post('/redeem', async (req, res) => {
  const userId = requireAuth(req, res)
  if (!userId) return

  const raw = (req.body as { code?: unknown } | undefined)?.code
  const code = typeof raw === 'string' ? raw.trim().toUpperCase() : ''
  if (!code) return res.status(400).json({ error: 'Enter a promo code' })

  try {
    const promo = await db.prisma.promoCode.findUnique({ where: { code } })
    if (!promo) return res.status(404).json({ error: 'That code is not valid' })
    if (promo.expiresAt && promo.expiresAt.getTime() < Date.now()) {
      return res.status(400).json({ error: 'That code has expired' })
    }
    if (promo.maxRedemptions !== null && promo.redemptionCount >= promo.maxRedemptions) {
      return res.status(409).json({ error: 'That code has been fully redeemed' })
    }

    try {
      await db.prisma.$transaction(async tx => {
        await tx.promoCodeRedemption.create({
          data: { userId, codeId: promo.id, credits: promo.credits },
        })
        await tx.promoCode.update({
          where: { id: promo.id },
          data: { redemptionCount: { increment: 1 } },
        })
      })
    } catch (error: any) {
      if (error?.code === 'P2002') {
        return res.status(409).json({ error: 'You have already redeemed that code' })
      }
      throw error
    }

    const balance = await db.addCredits(userId, promo.credits, 'promo', `Promo code ${code}`, {
      idempotencyKey: `promo:${promo.id}:${userId}`,
    })
    res.json({ credits: promo.credits, balance })
  } catch (error: any) {
    logger.error({ err: error, userId, code }, 'Failed to redeem promo code')
    res.status(500).json({ error: error.message })
  }
})
