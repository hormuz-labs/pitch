import { Router } from 'express';
import * as db from '@saas/db';
import { createLogger } from '@saas/shared';

const logger = createLogger('api');

export const router = Router();

/**
 * POST /newsletter/subscribe
 *
 * Saves a new email address to the newsletter subscribers table.
 * Public endpoint (does not require authentication).
 */
router.post('/subscribe', async (req, res) => {
  const { email } = req.body;

  if (!email || typeof email !== 'string') {
    return res.status(400).json({ error: 'Email is required' });
  }

  // Simple email format check
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ error: 'Invalid email address format' });
  }

  try {
    const lowerEmail = email.trim().toLowerCase();

    // Check if already subscribed
    const existing = await db.prisma.newsletterSubscriber.findUnique({
      where: { email: lowerEmail },
    });

    if (existing) {
      return res.json({ success: true, message: 'You are already subscribed!' });
    }

    await db.prisma.newsletterSubscriber.create({
      data: {
        email: lowerEmail,
      },
    });

    res.json({ success: true, message: 'Successfully subscribed to the newsletter!' });
  } catch (error: any) {
    logger.error({ err: error, email }, 'Failed to subscribe to newsletter');
    res.status(500).json({ error: 'Internal server error' });
  }
});
