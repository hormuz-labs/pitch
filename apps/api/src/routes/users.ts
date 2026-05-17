import { Router } from 'express';
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
    res.json(user);
  } catch (error: any) {
    logger.error({ err: error, userId }, 'Failed to fetch user profile');
    res.status(500).json({ error: error.message });
  }
});

router.post('/sync', async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const { email, firstName, lastName, imageUrl } = req.body as {
    email: string;
    firstName?: string;
    lastName?: string;
    imageUrl?: string;
  };

  if (!email) return res.status(400).json({ error: 'email is required' });

  try {
    const existingUser = await db.prisma.userProfile.findUnique({ where: { id: userId } });
    const profile = await db.upsertUser({ id: userId, email, firstName, lastName, imageUrl });
    logger.info({ userId }, 'User profile synced');

    if (!existingUser) {
      if (req.cookies?.beta_promo === '1') {
        await db.addCredits(userId, 5, 'promo', 'Beta early-access signup bonus');
        logger.info({ userId }, 'Applied beta promo credits (5)');
        res.cookie('beta_promo', '', { maxAge: 0 });
      }
      sendTelegramMessage(`👋 <b>New User Sign Up</b>\nEmail: ${email}\nName: ${firstName || ''} ${lastName || ''}`).catch((err) => logger.error({ err }, 'Failed to send Telegram notification for user sign up'));
    } else {
      sendTelegramMessage(`🔑 <b>User Sign In</b>\nEmail: ${email}`).catch((err) => logger.error({ err }, 'Failed to send Telegram notification for user sign in'));
    }
    res.json(profile);
  } catch (error: any) {
    logger.error({ err: error, userId }, 'Failed to sync user profile');
    res.status(500).json({ error: error.message });
  }
});
