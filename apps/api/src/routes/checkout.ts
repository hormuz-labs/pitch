import { Router } from 'express';
import { createLogger } from '@saas/shared';
import { requireAuth } from '../middleware/auth.js';
import { CREDIT_PACKS, TOPUP_PACKS, type PackKey, type TopupKey } from '../config.js';
import DodoPayments from 'dodopayments';

const logger = createLogger('api');

export const router = Router();

router.post('/', async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const { pack, topup } = req.body as { pack?: PackKey, topup?: TopupKey };
  
  let chosen;
  let isTopup = false;
  
  if (pack) {
    chosen = CREDIT_PACKS[pack];
  } else if (topup) {
    chosen = TOPUP_PACKS[topup];
    isTopup = true;
  }
  
  if (!chosen) return res.status(400).json({ error: 'Invalid pack' });

  const dodoKey = process.env.DODO_PAYMENTS_API_KEY;
  if (!dodoKey) return res.status(503).json({ error: 'Dodo Payments not configured' });

  try {
    const client = new DodoPayments({
      bearerToken: dodoKey,
      environment: process.env.NODE_ENV === 'production' && process.env.DODO_ENVIRONMENT !== 'test_mode' ? 'live_mode' : 'test_mode',
    });

    const affCookie = (req as any).cookies?.aff || '';
    const appUrl = process.env.APP_URL || 'https://trypitch.co';

    const session = await client.checkoutSessions.create({
      product_cart: [
        { product_id: chosen.productId, quantity: 1 }
      ],
      metadata: {
        clerk_user_id: userId,
        credits: chosen.credits.toString(),
        pack: pack || topup || 'starter',
        type: isTopup ? 'topup' : 'subscription',
        affiliate_cookie: affCookie,
      },
      return_url: `${appUrl}/dashboard?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    });

    // Dodo sessions use session.checkout_url
    res.json({ url: session.checkout_url });
  } catch (error: unknown) {
    logger.error({ err: error instanceof Error ? error.message : String(error) }, '[Dodo Checkout] Error');
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

router.get('/status', async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const sessionId = req.query.session_id as string;
  if (!sessionId) return res.status(400).json({ error: 'Missing session_id' });

  try {
    // Dodo Payments API doesn't expose a way to retrieve checkout session status directly.
    // Instead, we poll our own database to see if the webhook has already processed the session.
    const { prisma } = await import('@saas/db');
    const existingTx = await prisma.creditTransaction.findFirst({
      where: { reason: `dodo_subscription:${sessionId}` } 
    });
    
    if (existingTx) {
      return res.json({ status: 'succeeded' });
    }

    return res.json({ status: 'pending' });
  } catch (error: unknown) {
    logger.error({ err: error instanceof Error ? error.message : String(error) }, '[Dodo Checkout Status] Error');
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
});
