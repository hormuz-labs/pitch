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
      if (req.cookies?.beta_promo === '1' || req.headers.cookie?.includes('beta_promo=1')) {
        // Find all past and present user IDs associated with this exact email
        const allProfilesWithEmail = await db.prisma.userProfile.findMany({ 
          where: { email }, 
          select: { id: true } 
        });
        const userIdsWithEmail = allProfilesWithEmail.map(p => p.id);

        // Prevent race conditions and email-reuse farming by ensuring this email 
        // has NEVER received the beta promo across any of its Clerk accounts
        const existingPromo = await db.prisma.creditTransaction.findFirst({
          where: { 
            userId: { in: userIdsWithEmail }, 
            type: 'promo', 
            description: 'Beta early-access signup bonus' 
          }
        });
        
        if (!existingPromo) {
          await db.addCredits(userId, 5, 'promo', 'Beta early-access signup bonus', {
            idempotencyKey: `beta_promo:${email.toLowerCase()}`
          });
          logger.info({ userId }, 'Applied beta promo credits (5)');
        }
        res.cookie('beta_promo', '', { maxAge: 0, path: '/' });
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
