import { Router } from 'express';
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
      // `aff` cookie (affiliateId:clickId) was set at click time. Reward the new
      // user and the referrer in credits. Failures must never block signup.
      const affCookie = (req.cookies as Record<string, string> | undefined)?.aff;
      if (affCookie) {
        const [affiliateId, clickId] = affCookie.split(':');
        if (affiliateId) {
          await db.recordReferralSignup({
            affiliateId,
            clickId: clickId || undefined,
            newUserId: userId,
            newUserReward: REFERRAL_REWARDS.newUserBonus,
            referrerReward: REFERRAL_REWARDS.referrerSignup,
          }).catch((err) => logger.error({ err, userId }, 'Failed to record referral signup'));
        }
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
