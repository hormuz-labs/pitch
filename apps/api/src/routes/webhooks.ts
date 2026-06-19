import * as db from '@saas/db'
import { createLogger } from '@saas/shared'
import DodoPayments from 'dodopayments'
import express, { Router } from 'express'
import { Webhook } from 'standardwebhooks'
import { CREDIT_PACKS, DODO_ENV, REFERRAL_REWARDS, TOPUP_PACKS } from '../config.js'

const logger = createLogger('api')

export const router = Router()

router.post('/dodo', express.raw({ type: 'application/json' }), async (req, res) => {
  const webhookSecret = process.env.DODO_PAYMENTS_WEBHOOK_SECRET
  if (!webhookSecret) {
    logger.error('[Dodo Webhook] DODO_PAYMENTS_WEBHOOK_SECRET not configured')
    return res.status(503).send('Webhook secret not configured')
  }

  // Dodo Payments signs webhooks with the Standard Webhooks spec:
  //   sign( `${webhook-id}.${webhook-timestamp}.${rawBody}` ) -> HMAC-SHA256 -> base64
  // The library handles the `whsec_` prefix, base64 key decode, the `v1,<sig>`
  // header format, constant-time compare, and timestamp replay tolerance.
  const rawBody = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : String(req.body)
  const webhookHeaders = {
    'webhook-id': (req.headers['webhook-id'] as string) || '',
    'webhook-timestamp': (req.headers['webhook-timestamp'] as string) || '',
    'webhook-signature': (req.headers['webhook-signature'] as string) || '',
  }

  let event: Record<string, unknown>
  try {
    const wh = new Webhook(webhookSecret)
    event = wh.verify(rawBody, webhookHeaders) as Record<string, unknown>
  } catch (err: unknown) {
    logger.warn(
      { err: err instanceof Error ? err.message : String(err) },
      '[Dodo Webhook] Signature verification failed',
    )
    return res.status(400).send('Webhook Error: Invalid signature')
  }

  const data = event.data as Record<string, any>
  const metadata = (data.metadata || {}) as Record<string, string>
  const userId = metadata.clerk_user_id

  logger.info({ type: event.type, userId }, '[Dodo Webhook] Received event')

  try {
    // ── Subscription activated (first payment) ────────────────────────────────
    if (event.type === 'subscription.active') {
      if (!userId) {
        logger.warn({ data }, '[Dodo Webhook] subscription.active missing clerk_user_id')
        return res.json({ received: true })
      }

      const subscriptionId: string = data.subscription_id
      const planKey = metadata.pack || 'starter'
      const pack = CREDIT_PACKS[planKey as keyof typeof CREDIT_PACKS]
      const credits = pack?.credits ?? parseInt(metadata.credits || '0', 10)

      // Determine billing period. Dodo provides these on the subscription object.
      // Fall back to now / +30d if not present.
      const periodStart = data.current_period_start
        ? new Date(data.current_period_start as string)
        : new Date()
      const periodEnd = data.current_period_end
        ? new Date(data.current_period_end as string)
        : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)

      // Guard: if user already has a different active subscription, cancel the old one
      // to prevent duplicate-billing scenarios from race-condition checkout sessions.
      await cancelOtherActiveSubs(userId, subscriptionId)

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
      })

      logger.info({ userId, planKey, credits, subscriptionId }, '[Dodo] Subscription activated')
      await handleAffiliateConversion(data, metadata, userId, event.type as string)
    }

    // ── Subscription renewed ─────────────────────────────────────────────────
    else if (event.type === 'subscription.renewed') {
      if (!userId) {
        logger.warn({ data }, '[Dodo Webhook] subscription.renewed missing clerk_user_id')
        return res.json({ received: true })
      }

      const subscriptionId: string = data.subscription_id
      const planKey = metadata.pack || 'starter'
      const pack = CREDIT_PACKS[planKey as keyof typeof CREDIT_PACKS]
      const credits = pack?.credits ?? parseInt(metadata.credits || '0', 10)

      const periodStart = data.current_period_start
        ? new Date(data.current_period_start as string)
        : new Date()
      const periodEnd = data.current_period_end
        ? new Date(data.current_period_end as string)
        : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)

      // Guard: if user somehow got a duplicate active sub, cancel the old one
      await cancelOtherActiveSubs(userId, subscriptionId)

      await db.upsertSubscription({
        userId,
        dodoSubscriptionId: subscriptionId,
        planKey,
        status: 'active',
        creditsPerCycle: credits,
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
        idempotencyKey: `sub_grant:${subscriptionId}:${periodStart.toISOString()}`,
      })

      logger.info({ userId, planKey, credits, subscriptionId }, '[Dodo] Subscription renewed')
    }

    // ── Subscription cancelled ────────────────────────────────────────────────
    else if (event.type === 'subscription.cancelled') {
      const subscriptionId: string = data.subscription_id
      if (subscriptionId) {
        await db.cancelSubscription(subscriptionId)
        logger.info({ subscriptionId }, '[Dodo] Subscription cancelled')
      }
    }

    // ── One-time top-up payment succeeded ─────────────────────────────────────
    else if (event.type === 'payment.succeeded' && metadata.type === 'topup') {
      if (!userId) {
        logger.warn({ data }, '[Dodo Webhook] payment.succeeded (topup) missing clerk_user_id')
        return res.json({ received: true })
      }

      const paymentId: string = data.payment_id
      const packKey = metadata.pack as keyof typeof TOPUP_PACKS
      const pack = TOPUP_PACKS[packKey]
      const credits = pack?.credits ?? parseInt(metadata.credits || '0', 10)
      const amountUsd = (data.total_amount || 0) / 100

      await db.recordTopUp({
        userId,
        dodoPaymentId: paymentId,
        packKey: packKey || 'topup_10',
        credits,
        amountUsd,
      })

      logger.info({ userId, packKey, credits, paymentId, amountUsd }, '[Dodo] Top-up purchased')
      await handleAffiliateConversion(data, metadata, userId, event.type as string)
    }
  } catch (err: unknown) {
    logger.error(
      { err: err instanceof Error ? err.message : String(err), type: event.type },
      '[Dodo Webhook] Handler error',
    )
    // Return 200 anyway to prevent Dodo from retrying an already-applied event
    return res.json({ received: true, error: 'Internal handler error' })
  }

  res.json({ received: true })
})

// ── Duplicate subscription guard ──────────────────────────────────────────────
// Belt-and-suspenders: even if the POST /checkout guard hits a race condition,
// the webhook handler ensures a user never has two active subscriptions at once.

async function cancelOtherActiveSubs(userId: string, keepSubscriptionId: string) {
  const others = await db.prisma.subscription.findMany({
    where: { userId, status: 'active', dodoSubscriptionId: { not: keepSubscriptionId } },
  })
  if (others.length === 0) return

  const dodoKey = process.env.DODO_PAYMENTS_API_KEY
  const client = dodoKey ? new DodoPayments({ bearerToken: dodoKey, environment: DODO_ENV }) : null

  for (const sub of others) {
    logger.warn(
      { userId, oldSubId: sub.dodoSubscriptionId, newSubId: keepSubscriptionId },
      '[Dodo] Cancelling duplicate active subscription',
    )

    if (client) {
      try {
        await client.subscriptions.update(sub.dodoSubscriptionId, {
          status: 'cancelled',
        })
      } catch (err) {
        logger.error(
          {
            err: err instanceof Error ? err.message : String(err),
            dodoSubscriptionId: sub.dodoSubscriptionId,
          },
          '[Dodo] Failed to cancel duplicate sub at Dodo — DB update skipped to avoid de-sync',
        )
        // Don't mark cancelled locally if Dodo is still billing — otherwise the user
        // loses access while still being charged. Requires manual reconciliation.
        continue
      }
    }

    await db.prisma.subscription.update({
      where: { id: sub.id },
      data: { status: 'cancelled', cancelledAt: new Date() },
    })
  }
}

// ── Affiliate conversion helper ───────────────────────────────────────────────

async function handleAffiliateConversion(
  data: Record<string, any>,
  metadata: Record<string, string>,
  userId: string,
  _eventType: string,
) {
  const affCookie = metadata.affiliate_cookie
  if (!affCookie) return

  const [affiliateId, clickId] = affCookie.split(':')
  if (!affiliateId) return

  try {
    const saleAmountUsd = (data.recurring_pre_tax_amount || data.total_amount || 0) / 100
    const eventId = data.subscription_id || data.payment_id

    // No cash commission — reward the referrer in credits on the referred
    // user's first purchase. Guards (active affiliate, self-referral, dedupe)
    // live inside recordReferralConversion.
    const result = await db.recordReferralConversion({
      affiliateId,
      clickId: clickId || undefined,
      referredUserId: userId,
      referrerReward: REFERRAL_REWARDS.referrerPurchase,
      saleAmountUsd,
      dodoSessionId: eventId,
    })

    if (result.rewarded) {
      console.log(
        `[Affiliate] +${REFERRAL_REWARDS.referrerPurchase} credits to affiliate ${affiliateId} for referred purchase`,
      )
    }
  } catch (err) {
    console.error('[Affiliate] Conversion error:', err)
  }
}
