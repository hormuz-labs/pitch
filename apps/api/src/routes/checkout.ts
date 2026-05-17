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
      // Dodo appends subscription_id and payment_id to the return_url automatically.
      // There is no {CHECKOUT_SESSION_ID} template substitution — use the Dodo-appended params instead.
      return_url: `${appUrl}/dashboard?checkout=success`,
    });

    // Dodo sessions use session.checkout_url
    res.json({ url: session.checkout_url });
  } catch (error: unknown) {
    logger.error({ err: error instanceof Error ? error.message : String(error) }, '[Dodo Checkout] Error');
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

/**
 * GET /checkout/status?subscription_id=sub_xxx
 *
 * Polls whether a subscription's credits have been granted.
 * If not yet granted (webhook not received), fetches the subscription directly
 * from Dodo Payments API and grants credits immediately (idempotent).
 *
 * Also supports legacy ?session_id=... param as a fallback.
 */
router.get('/status', async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const subscriptionId = req.query.subscription_id as string | undefined;
  const sessionId = req.query.session_id as string | undefined;

  if (!subscriptionId && !sessionId) {
    return res.status(400).json({ error: 'Missing subscription_id or session_id' });
  }

  const dodoKey = process.env.DODO_PAYMENTS_API_KEY;
  if (!dodoKey) return res.status(503).json({ error: 'Dodo Payments not configured' });

  try {
    const { prisma, addCredits } = await import('@saas/db');

    // --- 1. Check if credits already exist in DB (webhook already processed) ---
    if (subscriptionId) {
      const existingTx = await prisma.creditTransaction.findFirst({
        where: { reason: `dodo_subscription:${subscriptionId}` }
      });
      if (existingTx) {
        return res.json({ status: 'succeeded' });
      }
    }

    if (sessionId) {
      const existingTx = await prisma.creditTransaction.findFirst({
        where: { reason: `dodo_subscription:${sessionId}` }
      });
      if (existingTx) {
        return res.json({ status: 'succeeded' });
      }
    }

    // --- 2. Webhook not received yet. If we have a subscription_id, fetch from Dodo directly ---
    if (subscriptionId) {
      const client = new DodoPayments({
        bearerToken: dodoKey,
        environment: process.env.NODE_ENV === 'production' && process.env.DODO_ENVIRONMENT !== 'test_mode' ? 'live_mode' : 'test_mode',
      });

      const subscription = await client.subscriptions.retrieve(subscriptionId);

      if (subscription.status === 'active' || subscription.status === 'on_hold') {
        // Subscription is active on Dodo's side — grant credits now (webhook fallback)
        const metadata = subscription.metadata as Record<string, string>;
        const subUserId = metadata?.clerk_user_id;
        const credits   = parseInt(metadata?.credits || '0', 10);

        if (!subUserId) {
          return res.status(400).json({ error: 'Subscription metadata missing clerk_user_id' });
        }

        // Security: ensure the authenticated user owns this subscription
        if (subUserId !== userId) {
          return res.status(403).json({ error: 'Subscription does not belong to this user' });
        }

        if (credits > 0) {
          await addCredits(subUserId, credits, `dodo_subscription:${subscriptionId}`);
          logger.info({ userId: subUserId, credits, subscriptionId }, '[Checkout] Credits granted via polling fallback');
        }

        return res.json({ status: 'succeeded', credits_granted: credits });
      }

      // Subscription exists but is not yet active (pending/failed)
      return res.json({ status: subscription.status });
    }

    // --- 3. No subscription_id available, still pending ---
    return res.json({ status: 'pending' });

  } catch (error: unknown) {
    logger.error({ err: error instanceof Error ? error.message : String(error) }, '[Dodo Checkout Status] Error');
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
});
