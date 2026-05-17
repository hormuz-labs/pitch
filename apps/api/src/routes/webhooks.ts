import express, { Router } from 'express';
import * as db from '@saas/db';
import { createLogger } from '@saas/shared';
import crypto from 'crypto';
import { CREDIT_PACKS, TOPUP_PACKS } from '../config.js';

const logger = createLogger('api');

export const router = Router();

function verifyWebhook(payload: string, signature: string, secret: string): boolean {
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
  
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

router.post('/dodo', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['webhook-signature'] || req.headers['x-dodo-signature'] || req.headers['authorization'];
  if (Array.isArray(sig)) return res.status(400).send('Invalid signature header');
  const signature = sig ? sig.replace('Bearer ', '') : '';

  const webhookSecret = process.env.DODO_PAYMENTS_WEBHOOK_SECRET;

  if (!webhookSecret || !signature) {
    return res.status(400).send('Missing webhook secret or signature');
  }

  const isValid = verifyWebhook(req.body.toString('utf8'), signature as string, webhookSecret);
  if (!isValid) {
    return res.status(400).send('Webhook Error: Invalid signature');
  }

  let event: Record<string, unknown>;
  try {
    event = JSON.parse(req.body.toString('utf8'));
  } catch (err: unknown) {
    return res.status(400).send('Webhook Error: Invalid JSON');
  }

  const data = event.data as Record<string, any>;
  const metadata = (data.metadata || {}) as Record<string, string>;
  const userId = metadata.clerk_user_id;

  logger.info({ type: event.type, userId }, '[Dodo Webhook] Received event');

  try {
    // ── Subscription activated (first payment) ────────────────────────────────
    if (event.type === 'subscription.active') {
      if (!userId) {
        logger.warn({ data }, '[Dodo Webhook] subscription.active missing clerk_user_id');
        return res.json({ received: true });
      }

      const subscriptionId: string = data.subscription_id;
      const planKey = metadata.pack || 'starter';
      const pack = CREDIT_PACKS[planKey as keyof typeof CREDIT_PACKS];
      const credits = pack?.credits ?? parseInt(metadata.credits || '0', 10);

      // Determine billing period. Dodo provides these on the subscription object.
      // Fall back to now / +30d if not present.
      const periodStart = data.current_period_start
        ? new Date(data.current_period_start as string)
        : new Date();
      const periodEnd = data.current_period_end
        ? new Date(data.current_period_end as string)
        : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

      await db.upsertSubscription({
        userId,
        dodoSubscriptionId: subscriptionId,
        planKey,
        status: 'active',
        creditsPerCycle: credits,
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
        // idempotency key includes period start so renewals re-grant correctly
        idempotencyKey: `sub_grant:${subscriptionId}:${periodStart.toISOString()}`,
      });

      logger.info({ userId, planKey, credits, subscriptionId }, '[Dodo] Subscription activated');
      await handleAffiliateConversion(data, metadata, userId, event.type as string);
    }

    // ── Subscription renewed ─────────────────────────────────────────────────
    else if (event.type === 'subscription.renewed') {
      if (!userId) {
        logger.warn({ data }, '[Dodo Webhook] subscription.renewed missing clerk_user_id');
        return res.json({ received: true });
      }

      const subscriptionId: string = data.subscription_id;
      const planKey = metadata.pack || 'starter';
      const pack = CREDIT_PACKS[planKey as keyof typeof CREDIT_PACKS];
      const credits = pack?.credits ?? parseInt(metadata.credits || '0', 10);

      const periodStart = data.current_period_start
        ? new Date(data.current_period_start as string)
        : new Date();
      const periodEnd = data.current_period_end
        ? new Date(data.current_period_end as string)
        : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

      await db.upsertSubscription({
        userId,
        dodoSubscriptionId: subscriptionId,
        planKey,
        status: 'active',
        creditsPerCycle: credits,
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
        idempotencyKey: `sub_grant:${subscriptionId}:${periodStart.toISOString()}`,
      });

      logger.info({ userId, planKey, credits, subscriptionId }, '[Dodo] Subscription renewed');
    }

    // ── Subscription cancelled ────────────────────────────────────────────────
    else if (event.type === 'subscription.cancelled') {
      const subscriptionId: string = data.subscription_id;
      if (subscriptionId) {
        await db.cancelSubscription(subscriptionId);
        logger.info({ subscriptionId }, '[Dodo] Subscription cancelled');
      }
    }

    // ── One-time top-up payment succeeded ─────────────────────────────────────
    else if (event.type === 'payment.succeeded' && metadata.type === 'topup') {
      if (!userId) {
        logger.warn({ data }, '[Dodo Webhook] payment.succeeded (topup) missing clerk_user_id');
        return res.json({ received: true });
      }

      const paymentId: string = data.payment_id;
      const packKey = metadata.pack as keyof typeof TOPUP_PACKS;
      const pack = TOPUP_PACKS[packKey];
      const credits = pack?.credits ?? parseInt(metadata.credits || '0', 10);
      const amountUsd = (data.total_amount || 0) / 100;

      await db.recordTopUp({
        userId,
        dodoPaymentId: paymentId,
        packKey: packKey || 'topup_10',
        credits,
        amountUsd,
      });

      logger.info({ userId, packKey, credits, paymentId, amountUsd }, '[Dodo] Top-up purchased');
      await handleAffiliateConversion(data, metadata, userId, event.type as string);
    }
  } catch (err: unknown) {
    logger.error({ err: err instanceof Error ? err.message : String(err), type: event.type }, '[Dodo Webhook] Handler error');
    // Return 200 anyway to prevent Dodo from retrying an already-applied event
    return res.json({ received: true, error: 'Internal handler error' });
  }

  res.json({ received: true });
});

// ── Affiliate conversion helper ───────────────────────────────────────────────

async function handleAffiliateConversion(
  data: Record<string, any>,
  metadata: Record<string, string>,
  userId: string,
  eventType: string
) {
  const affCookie = metadata.affiliate_cookie;
  if (!affCookie) return;

  const [affiliateId, clickId] = affCookie.split(':');
  if (!affiliateId) return;

  try {
    const affiliate = await db.prisma.affiliate.findUnique({ where: { id: affiliateId } });
    if (!affiliate || affiliate.status !== 'active' || affiliate.userId === userId) return;

    const alreadyConverted = await db.hasExistingConversion(affiliateId, userId);
    if (alreadyConverted) return;

    const saleAmountUsd = (data.recurring_pre_tax_amount || data.total_amount || 0) / 100;
    const commissionAmt = saleAmountUsd * (affiliate.commissionPct / 100);
    const eventId = data.subscription_id || data.payment_id;

    await db.createAffiliateConversion({
      affiliateId,
      clickId: clickId || undefined,
      referredUserId: userId,
      saleAmountUsd,
      commissionAmt,
      dodoSessionId: eventId,
    });

    console.log(`[Affiliate] $${commissionAmt.toFixed(2)} commission queued for affiliate ${affiliateId}`);
  } catch (err) {
    console.error('[Affiliate] Conversion error:', err);
  }
}
