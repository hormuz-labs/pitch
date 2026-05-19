import { Router } from 'express';
import { clerkClient } from '@clerk/express';
import * as db from '@saas/db';
import { createLogger, sendTelegramMessage } from '@saas/shared';
import { requireAuth } from '../middleware/auth.js';

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
    const clerkUser = await clerkClient.users.getUser(userId);
    const primary = clerkUser.emailAddresses.find(
      (e) => e.id === clerkUser.primaryEmailAddressId
    );
    if (!primary?.emailAddress) {
      logger.error({ userId }, 'Clerk user has no primary email');
      return res.status(400).json({ error: 'No verified primary email on Clerk account' });
    }
    email = primary.emailAddress;
    firstName = clerkUser.firstName ?? undefined;
    lastName = clerkUser.lastName ?? undefined;
    imageUrl = clerkUser.imageUrl ?? undefined;
  } catch (err: any) {
    logger.error({ err, userId }, 'Failed to fetch Clerk user for sync');
    return res.status(500).json({ error: 'Failed to verify identity' });
  }

  try {
    const existingUser = await db.prisma.userProfile.findUnique({ where: { id: userId } });
    const profile = await db.upsertUser({ id: userId, email, firstName, lastName, imageUrl });
    logger.info({ userId }, 'User profile synced');

    if (!existingUser) {
      await db.addCredits(userId, 5, 'promo', 'New user signup bonus', {
        idempotencyKey: `signup_bonus:${userId}`
      });
      logger.info({ userId }, 'Applied signup bonus credits (5)');
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
