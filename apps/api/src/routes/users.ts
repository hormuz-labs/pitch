import assert from 'node:assert/strict'
import * as db from '@saas/db'
import { sendWelcomeEmail } from '@saas/email'
import { createLogger, sendDiscordMessage } from '@saas/shared'
import { type Request, Router } from 'express'
import { REFERRAL_REWARDS, SIGNUP_BONUS_CREDITS } from '../config.js'
import { getVerifiedClerkProfile } from '../lib/clerk.js'
import { requireAuth } from '../middleware/auth.js'

const logger = createLogger('api')

export const router = Router()

const ONBOARDING_OPTIONS = {
  creationGoal: [
    'product-demos',
    'launch-videos',
    'onboarding',
    'pitch-decks',
    'explainers',
    'social-clips',
    'investor-updates',
    'other',
  ],
  role: [
    'founder',
    'product-manager',
    'marketer',
    'designer',
    'developer',
    'sales-success',
    'agency-freelancer',
    'other',
  ],
  teamSize: ['just-me', '2-10', '11-50', '51-200', '201-1000', '1000-plus'],
  monthlyVolume: ['1-2', '3-5', '6-10', '11-25', '26-50', '50-plus'],
  discoverySource: [
    'google',
    'x-twitter',
    'linkedin',
    'youtube',
    'chatgpt',
    'claude',
    'friend-teammate',
    'community',
    'other',
  ],
} as const

router.get('/onboarding', async (req, res) => {
  const userId = requireAuth(req, res)
  if (!userId) return

  try {
    const [survey, profile] = await Promise.all([
      db.prisma.onboardingSurvey.findUnique({ where: { userId } }),
      db.prisma.userProfile.findUnique({
        where: { id: userId },
        select: { onboardingSkippedAt: true },
      }),
    ])
    res.json({ completed: !!survey, skipped: !!profile?.onboardingSkippedAt, survey })
  } catch (error: any) {
    logger.error({ err: error, userId }, 'Failed to fetch onboarding status')
    res.status(500).json({ error: 'Failed to fetch onboarding status' })
  }
})

/**
 * Dismiss the welcome survey. Nothing in the product waits on onboarding, so
 * this only records that we should stop asking — on every device, not just
 * the browser the user skipped from.
 */
router.post('/onboarding/skip', async (req, res) => {
  const userId = requireAuth(req, res)
  if (!userId) return

  try {
    await db.prisma.userProfile.update({
      where: { id: userId },
      data: { onboardingSkippedAt: new Date() },
    })
    res.json({ skipped: true })
  } catch (error: any) {
    logger.error({ err: error, userId }, 'Failed to record onboarding skip')
    res.status(500).json({ error: 'Failed to record onboarding skip' })
  }
})

router.post('/onboarding', async (req, res) => {
  const userId = requireAuth(req, res)
  if (!userId) return

  const answers = req.body as Record<string, unknown>
  for (const [field, options] of Object.entries(ONBOARDING_OPTIONS)) {
    if (
      typeof answers[field] !== 'string' ||
      !(options as readonly string[]).includes(answers[field] as string)
    ) {
      return res.status(400).json({ error: `Invalid ${field}` })
    }
  }

  try {
    const existing = await db.prisma.onboardingSurvey.findUnique({ where: { userId } })
    if (existing) return res.status(409).json({ error: 'Onboarding already completed' })

    const survey = await db.prisma.onboardingSurvey.create({
      data: {
        userId,
        creationGoal: answers.creationGoal as string,
        role: answers.role as string,
        teamSize: answers.teamSize as string,
        monthlyVolume: answers.monthlyVolume as string,
        discoverySource: answers.discoverySource as string,
      },
    })
    res.status(201).json({ completed: true, survey })
  } catch (error: any) {
    if (error?.code === 'P2002')
      return res.status(409).json({ error: 'Onboarding already completed' })
    logger.error({ err: error, userId }, 'Failed to save onboarding survey')
    res.status(500).json({ error: 'Failed to save onboarding survey' })
  }
})

router.get('/me', async (req, res) => {
  const userId = requireAuth(req, res)
  if (!userId) return

  try {
    const user = await db.prisma.userProfile.findUnique({ where: { id: userId } })
    if (!user) {
      return res.status(404).json({ error: 'User profile not found' })
    }

    const creditAggregates = await db.prisma.creditTransaction.aggregate({
      where: { userId },
      _sum: { delta: true },
    })
    const balance = creditAggregates._sum.delta ?? 0

    res.json({ ...user, balance })
  } catch (error: any) {
    logger.error({ err: error, userId }, 'Failed to fetch user profile')
    res.status(500).json({ error: error.message })
  }
})

/**
 * Resolves the referral attribution for a signup. Best-effort: never throws
 * to the caller — a DB blip is logged and yields `null`, so the signup
 * flow always proceeds. Postcondition (asserted at the call site): if
 * non-null, `affiliateId` is a non-empty string and `clickId` is undefined
 * or a non-empty string.
 */
async function resolveReferralAttribution(
  req: Request,
): Promise<{ affiliateId: string; clickId?: string } | null> {
  try {
    const affCookie = (req.cookies as Record<string, string> | undefined)?.aff
    if (affCookie) {
      const [affiliateId, clickId] = affCookie.split(':')
      if (affiliateId) return { affiliateId, clickId: clickId || undefined }
    }
    const refCodeRaw = (req.body as { refCode?: unknown } | undefined)?.refCode
    const refCode = typeof refCodeRaw === 'string' ? refCodeRaw.trim().toUpperCase() : ''
    if (!refCode) return null
    const aff = await db.getAffiliateByCode(refCode)
    if (aff && aff.status === 'active') return { affiliateId: aff.id }
    return null
  } catch (err) {
    logger.error({ err }, 'resolveReferralAttribution: lookup failed; treating as no attribution')
    return null
  }
}

router.post('/sync', async (req, res) => {
  const userId = requireAuth(req, res)
  if (!userId) return

  // SECURITY: never trust client-supplied email. Always read the verified
  // primary email directly from Clerk — otherwise a user could overwrite their
  // stored email to an admin address and escalate privileges via requireAdmin.
  let email: string
  let firstName: string | undefined
  let lastName: string | undefined
  let imageUrl: string | undefined
  try {
    const verified = await getVerifiedClerkProfile(userId)
    email = verified.email
    firstName = verified.firstName
    lastName = verified.lastName
    imageUrl = verified.imageUrl
  } catch (err: any) {
    logger.error({ err, userId }, 'Failed to fetch verified Clerk profile')
    return res.status(500).json({ error: 'Failed to verify identity' })
  }

  try {
    const existingUser = await db.prisma.userProfile.findUnique({ where: { id: userId } })
    const profile = await db.upsertUser({ id: userId, email, firstName, lastName, imageUrl })
    logger.info({ userId }, 'User profile synced')

    // Keep the audience synced without re-subscribing a contact who opted out.
    const normalizedEmail = email.trim().toLowerCase()
    const newsletterContact = await db.prisma.newsletterSubscriber.findFirst({
      where: { OR: [{ userId }, { email: normalizedEmail }] },
    })
    if (newsletterContact) {
      await db.prisma.newsletterSubscriber.update({
        where: { id: newsletterContact.id },
        data: { email: normalizedEmail, userId, firstName },
      })
    } else {
      await db.prisma.newsletterSubscriber.create({
        data: { email: normalizedEmail, firstName, userId, source: 'signup' },
      })
    }

    if (!existingUser) {
      // New accounts deliberately start at zero; do not create a zero-value
      // ledger entry that looks like a promotional grant.
      if (SIGNUP_BONUS_CREDITS > 0) {
        await db.addCredits(userId, SIGNUP_BONUS_CREDITS, 'promo', 'New user signup bonus', {
          idempotencyKey: `signup_bonus:${userId}`,
        })
        logger.info({ userId }, `Applied signup bonus credits (${SIGNUP_BONUS_CREDITS})`)
      }
      try {
        const welcome = await sendWelcomeEmail({
          to: email,
          firstName,
          userId,
        })
        if (welcome.error) {
          logger.warn({ userId, error: welcome.error }, 'Welcome email was not sent')
        }
      } catch (err) {
        logger.warn({ err, userId }, 'Welcome email was not sent')
      }

      // Referral attribution: if this user arrived through an affiliate link, the
      // web app sends the `refCode` in the sync body (the `?ref=<CODE>` query
      // param from the /r/<CODE> redirect, captured into localStorage on first
      // load). We also still honour the legacy `aff` httpOnly cookie for
      // backwards compatibility, but in production the web (trypitch.co) and
      // API (api.trypitch.co) are cross-origin so the cookie never actually
      // reaches this handler — `refCode` is the path that actually fires.
      // Record the lead and apply configured referral rewards. New-user reward
      // is zero under the no-free-credits policy. Failures never block signup.
      const attribution = await resolveReferralAttribution(req)
      assert(
        attribution === null ||
          (attribution.affiliateId.length > 0 &&
            (attribution.clickId === undefined || attribution.clickId.length > 0)),
        'resolveReferralAttribution returned a malformed result',
      )

      if (attribution) {
        await db
          .recordReferralSignup({
            affiliateId: attribution.affiliateId,
            clickId: attribution.clickId,
            newUserId: userId,
            newUserReward: REFERRAL_REWARDS.newUserBonus,
            referrerReward: REFERRAL_REWARDS.referrerSignup,
          })
          .catch(err => logger.error({ err, userId }, 'Failed to record referral signup'))
      }

      sendDiscordMessage(
        `👋 **New User Sign Up**\nEmail: ${email}\nName: ${firstName || ''} ${lastName || ''}`,
      ).catch(err => logger.error({ err }, 'Failed to send Discord notification for user sign up'))
    } else {
      sendDiscordMessage(`🔑 **User Sign In**\nEmail: ${email}`).catch(err =>
        logger.error({ err }, 'Failed to send Discord notification for user sign in'),
      )
    }

    // Add wallet balance to the profile object being returned
    const creditAggregates = await db.prisma.creditTransaction.aggregate({
      where: { userId },
      _sum: { delta: true },
    })
    const balance = creditAggregates._sum.delta ?? 0

    res.json({ ...profile, balance })
  } catch (error: any) {
    logger.error({ err: error, userId }, 'Failed to sync user profile')
    res.status(500).json({ error: error.message })
  }
})
