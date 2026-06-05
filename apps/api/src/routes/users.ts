import { Router, type Request } from 'express';
import assert from 'node:assert/strict';
import * as db from '@saas/db';
import { createLogger, sendTelegramMessage } from '@saas/shared';
import { requireAuth } from '../middleware/auth.js';
import { getVerifiedClerkProfile } from '../lib/clerk.js';
import { SIGNUP_BONUS_CREDITS, REFERRAL_REWARDS } from '../config.js';

const logger = createLogger('api');

export const router = Router();

router.get('/me', async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  try {
    const user = await db.prisma.userProfile.findUnique({ where: { id: userId } });
    if (!user) {
      return res.status(404).json({ error: 'User profile not found' });
    }

    const creditAggregates = await db.prisma.creditTransaction.aggregate({
      where: { userId },
      _sum: { delta: true },
    });
    const balance = creditAggregates._sum.delta ?? 0;

    res.json({ ...user, balance });
  } catch (error: any) {
    logger.error({ err: error, userId }, 'Failed to fetch user profile');
    res.status(500).json({ error: error.message });
  }
});

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
    const affCookie = (req.cookies as Record<string, string> | undefined)?.aff;
    if (affCookie) {
      const [affiliateId, clickId] = affCookie.split(':');
      if (affiliateId) return { affiliateId, clickId: clickId || undefined };
    }
    const refCodeRaw = (req.body as { refCode?: unknown } | undefined)?.refCode;
    const refCode = typeof refCodeRaw === 'string' ? refCodeRaw.trim().toUpperCase() : '';
    if (!refCode) return null;
    const aff = await db.getAffiliateByCode(refCode);
    if (aff && aff.status === 'active') return { affiliateId: aff.id };
    return null;
  } catch (err) {
    logger.error({ err }, 'resolveReferralAttribution: lookup failed; treating as no attribution');
    return null;
  }
}

router.post('/sync', async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  // SECURITY: never trust client-supplied email. Always read the verified
  // primary email directly from Clerk — otherwise a user could overwrite their
  // stored email to an admin address and escalate privileges via requireAdmin.
  let email: string;
  let firstName: string | undefined;
  let lastName: string | undefined;
  let imageUrl: string | undefined;
  try {
    const verified = await getVerifiedClerkProfile(userId);
    email = verified.email;
    firstName = verified.firstName;
    lastName = verified.lastName;
    imageUrl = verified.imageUrl;
  } catch (err: any) {
    logger.error({ err, userId }, 'Failed to fetch verified Clerk profile');
    return res.status(500).json({ error: 'Failed to verify identity' });
  }

  try {
    const existingUser = await db.prisma.userProfile.findUnique({ where: { id: userId } });
    const profile = await db.upsertUser({ id: userId, email, firstName, lastName, imageUrl });
    logger.info({ userId }, 'User profile synced');

    if (!existingUser) {
      await db.addCredits(userId, SIGNUP_BONUS_CREDITS, 'promo', 'New user signup bonus', {
        idempotencyKey: `signup_bonus:${userId}`
      });
      logger.info({ userId }, `Applied signup bonus credits (${SIGNUP_BONUS_CREDITS})`);

      // Referral attribution: if this user arrived through an affiliate link, the
      // web app sends the `refCode` in the sync body (the `?ref=<CODE>` query
      // param from the /r/<CODE> redirect, captured into localStorage on first
      // load). We also still honour the legacy `aff` httpOnly cookie for
      // backwards compatibility, but in production the web (trypitch.co) and
      // API (api.trypitch.co) are cross-origin so the cookie never actually
      // reaches this handler — `refCode` is the path that actually fires.
      // Reward the new user and the referrer in credits. Failures must never
      // block signup.
      const attribution = await resolveReferralAttribution(req);
      assert(
        attribution === null
          || (attribution.affiliateId.length > 0
              && (attribution.clickId === undefined || attribution.clickId.length > 0)),
        'resolveReferralAttribution returned a malformed result',
      );

      if (attribution) {
        await db.recordReferralSignup({
          affiliateId: attribution.affiliateId,
          clickId: attribution.clickId,
          newUserId: userId,
          newUserReward: REFERRAL_REWARDS.newUserBonus,
          referrerReward: REFERRAL_REWARDS.referrerSignup,
        }).catch((err) => logger.error({ err, userId }, 'Failed to record referral signup'));
      }

      sendTelegramMessage(`👋 <b>New User Sign Up</b>\nEmail: ${email}\nName: ${firstName || ''} ${lastName || ''}`).catch((err) => logger.error({ err }, 'Failed to send Telegram notification for user sign up'));
    } else {
      sendTelegramMessage(`🔑 <b>User Sign In</b>\nEmail: ${email}`).catch((err) => logger.error({ err }, 'Failed to send Telegram notification for user sign in'));
    }
    
    // Add wallet balance to the profile object being returned
    const creditAggregates = await db.prisma.creditTransaction.aggregate({
      where: { userId },
      _sum: { delta: true },
    });
    const balance = creditAggregates._sum.delta ?? 0;
    
    res.json({ ...profile, balance });
  } catch (error: any) {
    logger.error({ err: error, userId }, 'Failed to sync user profile');
    res.status(500).json({ error: error.message });
  }
});
