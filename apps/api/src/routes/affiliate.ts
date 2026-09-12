import * as db from '@saas/db'
import { sendReferralInviteEmail } from '@saas/email'
import { createLogger } from '@saas/shared'
import crypto from 'crypto'
import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const _logger = createLogger('affiliate-routes')

export const redirectRouter = Router()

redirectRouter.get('/r/:code', async (req, res) => {
  const affiliate = await db.getAffiliateByCode(req.params.code)
  if (affiliate?.status !== 'active') {
    return res.redirect(302, 'https://trypitch.co')
  }

  const rawIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || ''
  const hashedIp = crypto
    .createHash('sha256')
    .update(rawIp + (process.env.IP_SALT || 'salt'))
    .digest('hex')

  const platform = (req.query.utm_source as string) || 'direct'
  const refPage = (req.query.landing as string) || '/'

  // Record the click for analytics. Attribution itself flows through the
  // `?ref=<CODE>` query param on the redirect target — the web app captures
  // it and forwards it to /users/sync and /checkout in the request body.
  // The `aff` httpOnly cookie this route used to set is no longer the
  // attribution channel: in production Vercel proxies /r/<CODE> from
  // trypitch.co to api.trypitch.co, and the cross-origin rewrite doesn't
  // deliver the Set-Cookie to the browser, so the API never sees it on
  // subsequent requests. The body param is robust against any proxy/CDN.
  await db.createAffiliateClick({
    affiliateId: affiliate.id,
    ip: hashedIp,
    userAgent: req.headers['user-agent']?.slice(0, 250),
    platform,
    refPage,
  })

  const appUrl = process.env.APP_URL || 'https://trypitch.co'
  res.redirect(302, `${appUrl}?ref=${req.params.code}`)
})

export const router = Router()

router.post('/register', async (req, res) => {
  const userId = requireAuth(req, res)
  if (!userId) return

  try {
    const profile = await db.prisma.userProfile.findUnique({ where: { id: userId } })
    const firstName = profile?.firstName || 'User'
    const affiliate = await db.registerAffiliate(userId, firstName)
    res.json(affiliate)
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
})

router.post('/invite', async (req, res) => {
  const userId = requireAuth(req, res)
  if (!userId) return

  const raw = (req.body as { email?: unknown } | undefined)?.email
  const email = typeof raw === 'string' ? raw.trim() : ''
  if (!EMAIL_PATTERN.test(email)) {
    return res.status(400).json({ error: 'Enter a valid email address' })
  }

  try {
    const affiliate = await db.getAffiliateByUserId(userId)
    if (!affiliate) return res.status(404).json({ error: 'Register for rewards first' })
    if (affiliate.status !== 'active') {
      return res.status(403).json({ error: 'Reward invitations are unavailable for this account' })
    }

    const profile = await db.prisma.userProfile.findUnique({ where: { id: userId } })
    const appUrl = (process.env.APP_URL || 'https://trypitch.co').replace(/\/$/, '')

    const result = await sendReferralInviteEmail({
      to: email,
      fromName: profile?.firstName || 'A Pitch user',
      referralUrl: `${appUrl}/r/${affiliate.code}`,
    })
    if (result.error || !result.id) {
      _logger.warn(
        { error: result.error, userId },
        'Referral invite was not accepted by email provider',
      )
      return res
        .status(500)
        .json({ error: 'Could not send the invite email. Please try again later.' })
    }
    res.json({ sent: true })
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
})

router.get('/me', async (req, res) => {
  const userId = requireAuth(req, res)
  if (!userId) return

  try {
    const affiliate = await db.getAffiliateByUserId(userId)
    if (!affiliate) return res.status(404).json({ error: 'Not an affiliate yet' })

    const stats = await db.getAffiliateStats(affiliate.id)
    res.json({ ...affiliate, stats })
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
})
