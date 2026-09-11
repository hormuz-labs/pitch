import * as db from '@saas/db'
import { sendBillingEmail } from '@saas/email'
import { createLogger } from '@saas/shared'
import DodoPayments from 'dodopayments'
import express, { Router } from 'express'
import { Webhook } from 'standardwebhooks'
import {
  CREDIT_PACKS,
  DODO_ENV,
  LEGACY_CREDIT_PACKS,
  LEGACY_TOPUP_PACKS,
  REFERRAL_REWARDS,
  TOPUP_PACKS,
  webhookQueue,
} from '../config.js'
import { executeWebhookDelivery } from '../lib/webhook-service.js'
import { requireAuth } from '../middleware/auth.js'

const logger = createLogger('api')

export const router = Router()

/** A plan we sell, or a grandfathered one we still honour. */
function planEntitlement(planKey: string): { credits: number; label: string } | undefined {
  return (
    CREDIT_PACKS[planKey as keyof typeof CREDIT_PACKS] ??
    LEGACY_CREDIT_PACKS[planKey as keyof typeof LEGACY_CREDIT_PACKS]
  )
}

/**
 * Credits to grant for a renewal. The allowance stored on the subscription wins:
 * `pro` names both the retired $40 plan and the current $45 one, so a lookup by
 * key alone would quietly upgrade everyone still on the old one.
 */
async function creditsForRenewal(
  dodoSubscriptionId: string,
  planKey: string,
  metadataCredits: number,
): Promise<number> {
  const existing = await db.prisma.subscription
    .findUnique({
      where: { dodoSubscriptionId },
      select: { creditsPerCycle: true },
    })
    .catch(() => null)
  return existing?.creditsPerCycle ?? planEntitlement(planKey)?.credits ?? metadataCredits
}

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
      const planKey = metadata.pack || 'pro'
      const pack = planEntitlement(planKey)
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
      await sendBillingNotification(userId, 'subscription-started', subscriptionId, {
        plan: pack?.label ?? planKey,
        credits,
        amount: formatWebhookAmount(data.recurring_pre_tax_amount, data.currency),
        periodEnd,
      })
      await handleAffiliateConversion(data, metadata, userId, event.type as string)
    }

    // ── Subscription renewed ─────────────────────────────────────────────────
    else if (event.type === 'subscription.renewed') {
      if (!userId) {
        logger.warn({ data }, '[Dodo Webhook] subscription.renewed missing clerk_user_id')
        return res.json({ received: true })
      }

      const subscriptionId: string = data.subscription_id
      const planKey = metadata.pack || 'pro'
      const pack = planEntitlement(planKey)
      const credits = await creditsForRenewal(
        subscriptionId,
        planKey,
        parseInt(metadata.credits || '0', 10),
      )

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
      await sendBillingNotification(userId, 'subscription-renewed', subscriptionId, {
        plan: pack?.label ?? planKey,
        credits,
        amount: formatWebhookAmount(data.recurring_pre_tax_amount, data.currency),
        periodEnd,
      })
    }

    // ── Subscription cancelled ────────────────────────────────────────────────
    else if (event.type === 'subscription.cancelled') {
      const subscriptionId: string = data.subscription_id
      if (subscriptionId) {
        await db.cancelSubscription(subscriptionId)
        logger.info({ subscriptionId }, '[Dodo] Subscription cancelled')
        if (userId) {
          await sendBillingNotification(userId, 'subscription-cancelled', subscriptionId)
        }
      }
    }

    // ── Subscription ended after failed/non-renewed billing ───────────────────
    else if (
      event.type === 'subscription.on_hold' ||
      event.type === 'subscription.failed' ||
      event.type === 'subscription.expired'
    ) {
      const subscriptionId: string = data.subscription_id
      if (subscriptionId) {
        const status = String(event.type).replace('subscription.', '')
        await db.endSubscription(subscriptionId, status)
        logger.info(
          { subscriptionId, status },
          '[Dodo] Subscription ended; unused plan credits forfeited',
        )
        if (userId) {
          await sendBillingNotification(userId, 'subscription-cancelled', subscriptionId)
        }
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
      const pack =
        TOPUP_PACKS[packKey] ?? LEGACY_TOPUP_PACKS[packKey as keyof typeof LEGACY_TOPUP_PACKS]
      const credits = pack?.credits ?? parseInt(metadata.credits || '0', 10)
      const amountUsd = (data.total_amount || 0) / 100

      await db.recordTopUp({
        userId,
        dodoPaymentId: paymentId,
        packKey: packKey || 'flex',
        credits,
        amountUsd,
      })

      logger.info({ userId, packKey, credits, paymentId, amountUsd }, '[Dodo] Top-up purchased')
      await sendBillingNotification(userId, 'topup', paymentId, {
        plan: pack?.label ?? packKey,
        credits,
        amount: formatWebhookAmount(data.total_amount, data.currency),
      })
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

function formatWebhookAmount(minorUnits: unknown, currency: unknown): string | undefined {
  if (typeof minorUnits !== 'number') return undefined
  const currencyCode = typeof currency === 'string' && currency ? currency.toUpperCase() : 'USD'
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: currencyCode }).format(
      minorUnits / 100,
    )
  } catch {
    return `${(minorUnits / 100).toFixed(2)} ${currencyCode}`
  }
}

async function sendBillingNotification(
  userId: string,
  event: 'subscription-started' | 'subscription-renewed' | 'subscription-cancelled' | 'topup',
  referenceId: string,
  details: { plan?: string; credits?: number; amount?: string; periodEnd?: Date } = {},
) {
  try {
    const user = await db.prisma.userProfile.findUnique({ where: { id: userId } })
    if (!user?.email) return
    const result = await sendBillingEmail({
      to: user.email,
      firstName: user.firstName,
      event,
      referenceId,
      plan: details.plan,
      credits: details.credits,
      amount: details.amount,
      periodEnd: details.periodEnd?.toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      }),
    })
    if (result.error) logger.warn({ userId, event, error: result.error }, 'Billing email failed')
  } catch (err) {
    logger.warn({ err, userId, event }, 'Billing email failed')
  }
}

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

// ── Outbound Webhook Endpoints Management ────────────────────────────────────

router.get('/endpoints', express.json(), async (req, res) => {
  const userId = requireAuth(req, res)
  if (!userId) return

  try {
    const endpoints = await db.listWebhookEndpoints({ id: userId })
    res.json(endpoints)
  } catch (err: any) {
    console.error('ERROR IN /endpoints GET:', err)
    logger.error({ err, userId }, 'Failed to list webhook endpoints')
    res.status(500).json({ error: err.message })
  }
})

router.post('/endpoints', express.json(), async (req, res) => {
  const userId = requireAuth(req, res)
  if (!userId) return

  const { url, events, secret, isActive } = req.body || {}
  if (
    !url ||
    typeof url !== 'string' ||
    (!url.startsWith('http://') && !url.startsWith('https://'))
  ) {
    return res.status(400).json({ error: 'Valid HTTP/HTTPS URL is required' })
  }

  try {
    const endpoint = await db.createWebhookEndpoint(
      {
        userId,
        url,
        events: Array.isArray(events) ? events : ['job.completed', 'job.failed'],
        secret: typeof secret === 'string' && secret.trim() ? secret : undefined,
        isActive: typeof isActive === 'boolean' ? isActive : true,
      },
      { id: userId },
    )

    res.status(201).json(endpoint)
  } catch (err: any) {
    logger.error({ err, userId }, 'Failed to create webhook endpoint')
    res.status(500).json({ error: err.message })
  }
})

router.get('/endpoints/:id', express.json(), async (req, res) => {
  const userId = requireAuth(req, res)
  if (!userId) return

  try {
    const endpoint = await db.getWebhookEndpoint(req.params.id, { id: userId })
    if (!endpoint) return res.status(404).json({ error: 'Webhook endpoint not found' })
    res.json(endpoint)
  } catch (err: any) {
    logger.error({ err, userId }, 'Failed to get webhook endpoint')
    res.status(500).json({ error: err.message })
  }
})

router.patch('/endpoints/:id', express.json(), async (req, res) => {
  const userId = requireAuth(req, res)
  if (!userId) return

  const { url, events, secret, isActive } = req.body || {}
  if (
    url !== undefined &&
    (typeof url !== 'string' || (!url.startsWith('http://') && !url.startsWith('https://')))
  ) {
    return res.status(400).json({ error: 'Valid HTTP/HTTPS URL is required' })
  }

  try {
    const updated = await db.updateWebhookEndpoint(
      req.params.id,
      {
        ...(url !== undefined ? { url } : {}),
        ...(events !== undefined ? { events: Array.isArray(events) ? events : [] } : {}),
        ...(secret !== undefined ? { secret } : {}),
        ...(isActive !== undefined ? { isActive: Boolean(isActive) } : {}),
      },
      { id: userId },
    )

    if (!updated) return res.status(404).json({ error: 'Webhook endpoint not found' })
    res.json(updated)
  } catch (err: any) {
    logger.error({ err, userId }, 'Failed to update webhook endpoint')
    res.status(500).json({ error: err.message })
  }
})

router.delete('/endpoints/:id', express.json(), async (req, res) => {
  const userId = requireAuth(req, res)
  if (!userId) return

  try {
    const success = await db.deleteWebhookEndpoint(req.params.id, { id: userId })
    if (!success) return res.status(404).json({ error: 'Webhook endpoint not found' })
    res.json({ success: true })
  } catch (err: any) {
    logger.error({ err, userId }, 'Failed to delete webhook endpoint')
    res.status(500).json({ error: err.message })
  }
})

// ── Webhook Deliveries ────────────────────────────────────────────────────────

router.get('/deliveries', express.json(), async (req, res) => {
  const userId = requireAuth(req, res)
  if (!userId) return

  const jobId = typeof req.query.jobId === 'string' ? req.query.jobId : undefined
  const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 50

  try {
    const deliveries = await db.listWebhookDeliveries({ id: userId }, { jobId, limit })
    res.json(deliveries)
  } catch (err: any) {
    logger.error({ err, userId }, 'Failed to list webhook deliveries')
    res.status(500).json({ error: err.message })
  }
})

router.post('/deliveries/:id/retry', express.json(), async (req, res) => {
  const userId = requireAuth(req, res)
  if (!userId) return

  try {
    const delivery = await db.getWebhookDelivery(req.params.id, { id: userId })
    if (!delivery) return res.status(404).json({ error: 'Webhook delivery not found' })

    // Look up endpoint to get current secret or url if available
    let secret = 'whsec_test'
    let url = (delivery.payload as any)?.data?.parameters?.webhookUrl || ''
    if (delivery.endpointId) {
      const ep = await db.getWebhookEndpoint(delivery.endpointId, { id: userId })
      if (ep) {
        secret = ep.secret
        url = ep.url
      }
    }

    if (!url) {
      return res.status(400).json({ error: 'Cannot retry: Webhook target URL is missing' })
    }

    // Reset status to PENDING and re-enqueue
    const updated = await db.updateWebhookDelivery(delivery.id, {
      status: 'PENDING',
      error: null,
      nextRetryAt: new Date(),
    })

    await webhookQueue.add(
      'send-webhook',
      {
        deliveryId: updated.id,
        endpointId: delivery.endpointId ?? undefined,
        userId,
        url,
        secret,
        payload: delivery.payload,
      },
      {
        jobId: `${updated.id}-retry-${Date.now()}`,
        attempts: 5,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
      },
    )

    res.json({ success: true, message: 'Webhook delivery re-queued', delivery: updated })
  } catch (err: any) {
    logger.error({ err, userId }, 'Failed to retry webhook delivery')
    res.status(500).json({ error: err.message })
  }
})

router.post('/test', express.json(), async (req, res) => {
  const userId = requireAuth(req, res)
  if (!userId) return

  const { endpointId, url: inputUrl, secret: inputSecret } = req.body || {}

  let url = inputUrl
  let secret = inputSecret

  if (endpointId) {
    const ep = await db.getWebhookEndpoint(endpointId, { id: userId })
    if (!ep) return res.status(404).json({ error: 'Webhook endpoint not found' })
    url = ep.url
    secret = ep.secret
  }

  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'Endpoint ID or valid URL is required' })
  }

  secret = secret || 'whsec_test_secret'

  const payload = {
    id: `evt_test_${Date.now()}`,
    event: 'ping',
    createdAt: new Date().toISOString(),
    data: {
      message: 'This is a test webhook from Pitch',
      userId,
      timestamp: Date.now(),
    },
  }

  try {
    const delivery = await db.createWebhookDelivery({
      endpointId: endpointId || undefined,
      userId,
      jobId: 'test_job',
      event: 'ping',
      payload,
      maxAttempts: 1,
    })

    const result = await executeWebhookDelivery(
      {
        deliveryId: delivery.id,
        endpointId: endpointId || undefined,
        userId,
        url,
        secret,
        payload,
      },
      1,
    )

    res.json({ success: true, result })
  } catch (err: any) {
    res.status(502).json({ success: false, error: err.message })
  }
})
