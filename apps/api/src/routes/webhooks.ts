import express, { Router } from 'express';
import * as db from '@saas/db';
import { createLogger } from '@saas/shared';
import crypto from 'crypto';

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

  // Dodo docs say use manual crypto verification
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

  // Handle subscription and payment events
  const data = event.data as Record<string, any>;
  
  // We want to handle subscription active/renewed since we want to give credits!
  // Also handle payment.succeeded for one-time top-ups
  const isTopupPayment = event.type === 'payment.succeeded' && data.metadata?.type === 'topup';
  
  if (event.type === 'subscription.active' || event.type === 'subscription.renewed' || isTopupPayment) {
    // When a subscription is active or renewed, or top-up is bought, grant the user credits.
    const metadata = data.metadata || {};
    const userId    = metadata.clerk_user_id;
    const credits   = parseInt(metadata.credits || '0', 10);
    const affCookie = metadata.affiliate_cookie;

    const eventId = isTopupPayment ? data.payment_id : data.subscription_id;

    if (userId && credits > 0) {
      await db.addCredits(userId, credits, `dodo_${metadata.type || 'subscription'}:${eventId}`);
      console.log(`[Dodo] Added ${credits} credits to user ${userId} on ${event.type}`);
    }

    if (userId && affCookie && (event.type === 'subscription.active' || isTopupPayment)) {
      // Only do affiliate conversion on first active subscription to avoid duplicate conversions per month?
      // Or we do it on every renewal? Typically affiliate is just on initial sale. Let's do it on initial sale.
      const [affiliateId, clickId] = affCookie.split(':');
      if (affiliateId) {
        const affiliate = await db.prisma.affiliate.findUnique({ where: { id: affiliateId } });
        if (affiliate && affiliate.status === 'active' && affiliate.userId !== userId) {
          const alreadyConverted = await db.hasExistingConversion(affiliateId, userId);
          if (!alreadyConverted) {
            const saleAmountUsd = (data.recurring_pre_tax_amount || data.total_amount || 0) / 100; 
            const commissionAmt = saleAmountUsd * (affiliate.commissionPct / 100);
            await db.createAffiliateConversion({
              affiliateId,
              clickId: clickId || undefined,
              referredUserId: userId,
              saleAmountUsd,
              commissionAmt,
              dodoSessionId: eventId, // we reuse this field for dodopayments subscription id or payment id
            });
            console.log(`[Affiliate] $${commissionAmt.toFixed(2)} commission queued for affiliate ${affiliateId}`);
          }
        }
      }
    }
  }

  res.json({ received: true });
});
