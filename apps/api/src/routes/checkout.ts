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
      return_url: `${appUrl}/dashboard?checkout=success`,
    });

    res.json({ url: session.checkout_url });
  } catch (error: unknown) {
    logger.error({ err: error instanceof Error ? error.message : String(error) }, '[Dodo Checkout] Error');
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

/**
 * GET /checkout/status?subscription_id=sub_xxx
 * GET /checkout/status?payment_id=pay_xxx       (one-time topup)
 *
 * Polls whether credits have been granted after a checkout redirect.
 * If not yet granted (webhook not received), fetches the payment/subscription
 * directly from Dodo Payments API and grants credits immediately (idempotent).
 * The idempotency key matches what the webhook handler writes, so a late-arriving
 * webhook will be a no-op.
 */
router.get('/status', async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const subscriptionId = req.query.subscription_id as string | undefined;
  const paymentId      = req.query.payment_id      as string | undefined;
  const sessionId      = req.query.session_id      as string | undefined;

  if (!subscriptionId && !paymentId && !sessionId) {
    return res.status(400).json({ error: 'Missing subscription_id, payment_id, or session_id' });
  }

  const dodoKey = process.env.DODO_PAYMENTS_API_KEY;
  if (!dodoKey) return res.status(503).json({ error: 'Dodo Payments not configured' });

  try {
    const { prisma, upsertSubscription, recordTopUp } = await import('@saas/db');

    const dodoClient = () => new DodoPayments({
      bearerToken: dodoKey,
      environment: process.env.NODE_ENV === 'production' && process.env.DODO_ENVIRONMENT !== 'test_mode' ? 'live_mode' : 'test_mode',
    });

    // --- 1. Check DB first (webhook may have already processed it) ---
    if (subscriptionId) {
      const sub = await prisma.subscription.findUnique({
        where: { dodoSubscriptionId: subscriptionId },
      });
      if (sub) return res.json({ status: 'succeeded' });
    }

    if (paymentId) {
      const topUp = await prisma.topUpPurchase.findUnique({
        where: { dodoPaymentId: paymentId },
      });
      if (topUp) return res.json({ status: 'succeeded' });
    }

    if (sessionId) {
      // Check by idempotency key pattern
      const tx = await prisma.creditTransaction.findFirst({
        where: {
          OR: [
            { idempotencyKey: { contains: `:${sessionId}` } },
          ],
        },
      });
      if (tx) return res.json({ status: 'succeeded' });
    }

    // --- 2. Webhook not received — fetch directly from Dodo and grant credits ---

    if (paymentId) {
      const payment = await dodoClient().payments.retrieve(paymentId);

      if (payment.status === 'succeeded') {
        const metadata = (payment.metadata || {}) as Record<string, string>;
        const payUserId = metadata.clerk_user_id;
        const packKey   = metadata.pack as keyof typeof TOPUP_PACKS;
        const credits   = parseInt(metadata.credits || '0', 10);

        if (!payUserId) {
          return res.status(400).json({ error: 'Payment metadata missing clerk_user_id' });
        }
        if (payUserId !== userId) {
          return res.status(403).json({ error: 'Payment does not belong to this user' });
        }

        if (credits > 0) {
          const pack = TOPUP_PACKS[packKey];
          await recordTopUp({
            userId: payUserId,
            dodoPaymentId: paymentId,
            packKey: packKey || 'topup_10',
            credits,
            amountUsd: pack?.priceUsd ?? credits * 1.2,
          });
          logger.info({ userId: payUserId, credits, paymentId }, '[Checkout] Top-up credits granted via polling fallback');
        }

        return res.json({ status: 'succeeded', credits_granted: credits });
      }

      return res.json({ status: payment.status ?? 'pending' });
    }

    if (subscriptionId) {
      const subscription = await dodoClient().subscriptions.retrieve(subscriptionId);

      if (subscription.status === 'active' || subscription.status === 'on_hold') {
        const metadata  = (subscription.metadata || {}) as Record<string, string>;
        const subUserId = metadata.clerk_user_id;
        const planKey   = metadata.pack || 'starter';
        const credits   = parseInt(metadata.credits || '0', 10);

        if (!subUserId) {
          return res.status(400).json({ error: 'Subscription metadata missing clerk_user_id' });
        }
        if (subUserId !== userId) {
          return res.status(403).json({ error: 'Subscription does not belong to this user' });
        }

        if (credits > 0) {
          const periodStart = new Date();
          const periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
          await upsertSubscription({
            userId: subUserId,
            dodoSubscriptionId: subscriptionId,
            planKey,
            status: 'active',
            creditsPerCycle: credits,
            currentPeriodStart: periodStart,
            currentPeriodEnd: periodEnd,
            idempotencyKey: `sub_grant:${subscriptionId}:${periodStart.toISOString()}`,
          });
          logger.info({ userId: subUserId, credits, subscriptionId }, '[Checkout] Subscription credits granted via polling fallback');
        }

        return res.json({ status: 'succeeded', credits_granted: credits });
      }

      return res.json({ status: subscription.status });
    }

    // --- 3. Only had a session_id and it wasn't in DB — still pending ---
    return res.json({ status: 'pending' });

  } catch (error: unknown) {
    logger.error({ err: error instanceof Error ? error.message : String(error) }, '[Dodo Checkout Status] Error');
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
});
