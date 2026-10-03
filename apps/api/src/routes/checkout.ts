import assert from 'node:assert/strict'
import { createLogger } from '@saas/shared'
import DodoPayments from 'dodopayments'
import { type Request, Router } from 'express'
import {
  CREDIT_PACKS,
  CREDIT_RETAIL_USD,
  DODO_ENV,
  LEGACY_CREDIT_PACKS,
  LEGACY_TOPUP_PACKS,
  type PackKey,
  TOPUP_PACKS,
  type TopupKey,
} from '../config.js'
import { requireAuth } from '../middleware/auth.js'

const logger = createLogger('api')

export const router = Router()

// ── Receipt formatting helpers ────────────────────────────────────────────────
// Dodo amounts are in the smallest currency unit (e.g. cents), so divide by 100.
function formatAmount(minorUnits: number, currency: string): string {
  const value = (minorUnits ?? 0) / 100
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency || 'USD',
    }).format(value)
  } catch {
    return `$${value.toFixed(2)}`
  }
}

// Dodo's `payment_method` is the category ("card", "upi", "bank_transfer"),
// while card_network/card_last_four describe a card specifically.
function formatMethod(
  paymentMethod?: string | null,
  cardNetwork?: string | null,
  cardLast4?: string | null,
): string {
  const pm = (paymentMethod || '').toLowerCase()
  if (pm.includes('card') || cardLast4) {
    const net = cardNetwork
      ? cardNetwork.charAt(0).toUpperCase() + cardNetwork.slice(1).toLowerCase()
      : 'Card'
    return cardLast4 ? `${net} •••• ${cardLast4}` : net
  }
  if (pm.includes('upi')) return 'UPI'
  if (!paymentMethod) return 'Card'
  return paymentMethod.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function formatReceiptDate(iso: string): string {
  const d = iso ? new Date(iso) : new Date()
  const months = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ]
  const day = d.getDate()
  const suffix = (n: number) =>
    n % 10 === 1 && n !== 11
      ? 'st'
      : n % 10 === 2 && n !== 12
        ? 'nd'
        : n % 10 === 3 && n !== 13
          ? 'rd'
          : 'th'
  return `${months[d.getMonth()]} ${day}${suffix(day)}, ${d.getFullYear()}`
}

// ── Receipt builders ──────────────────────────────────────────────────────────
// Shared by /status (grant + receipt) and /receipt (re-download). Narrow structural
// types so the Dodo SDK objects pass without an explicit `any`.
interface ReceiptPayload {
  id: string
  amount: string
  credits: number
  method: string
  balance: number
  date: string
  email: string | null
  name: string | null
  label: string
}

type DodoCustomer = { email?: string | null; name?: string | null } | null

type DodoPaymentObj = {
  payment_id?: string
  total_amount: number
  currency: string
  payment_method?: string | null
  card_network?: string | null
  card_last_four?: string | null
  created_at: string
  metadata?: Record<string, string> | null
  customer?: DodoCustomer
}

type DodoSubscriptionObj = {
  subscription_id?: string
  recurring_pre_tax_amount: number
  currency: string
  created_at: string
  metadata?: Record<string, string> | null
  customer?: DodoCustomer
}

function buildPaymentReceipt(payment: DodoPaymentObj, balance: number): ReceiptPayload {
  const metadata = (payment.metadata || {}) as Record<string, string>
  const credits = parseInt(metadata.credits || '0', 10)
  const packKey = metadata.pack as keyof typeof TOPUP_PACKS
  return {
    id: payment.payment_id ?? '',
    amount: formatAmount(payment.total_amount, payment.currency),
    credits,
    method: formatMethod(payment.payment_method, payment.card_network, payment.card_last_four),
    balance,
    date: formatReceiptDate(payment.created_at),
    email: payment.customer?.email ?? null,
    name: payment.customer?.name ?? null,
    label:
      TOPUP_PACKS[packKey]?.label ??
      LEGACY_TOPUP_PACKS[packKey as keyof typeof LEGACY_TOPUP_PACKS]?.label ??
      `${credits} Credits`,
  }
}

function buildSubscriptionReceipt(
  subscription: DodoSubscriptionObj,
  balance: number,
): ReceiptPayload {
  const metadata = (subscription.metadata || {}) as Record<string, string>
  const credits = parseInt(metadata.credits || '0', 10)
  const planKey = metadata.pack || 'pro'
  return {
    id: subscription.subscription_id ?? '',
    amount: formatAmount(subscription.recurring_pre_tax_amount, subscription.currency),
    credits,
    method: 'Subscription',
    balance,
    date: formatReceiptDate(subscription.created_at),
    email: subscription.customer?.email ?? null,
    name: subscription.customer?.name ?? null,
    label:
      CREDIT_PACKS[planKey as keyof typeof CREDIT_PACKS]?.label ??
      LEGACY_CREDIT_PACKS[planKey as keyof typeof LEGACY_CREDIT_PACKS]?.label ??
      `${credits} Credits / mo`,
  }
}

/**
 * Builds the `affiliate_cookie` value for the Dodo session metadata. Best-
 * effort: never throws to the caller — a DB blip is logged and yields `''`,
 * so the payment flow always proceeds (the webhook then no-ops and no
 * conversion is recorded). Postcondition (asserted at the call site): the
 * returned string is either empty or matches `<affiliateId>` or
 * `<affiliateId>:<clickId>`.
 *
 * Preference order:
 *   1. Legacy `aff` httpOnly cookie — dead in production (cross-origin) but
 *      kept for local-dev compatibility.
 *   2. `refCode` from the body (the `?ref=<CODE>` captured by the web app).
 *      Resolved back to the affiliate, with the most recent click for that
 *      affiliate recovered as a best-effort clickId (last-touch heuristic).
 */
async function resolveCheckoutAttribution(req: Request, userId: string): Promise<string> {
  try {
    const affCookie = (req.cookies as Record<string, string> | undefined)?.aff
    if (affCookie) return affCookie

    const refCodeRaw = (req.body as { refCode?: unknown } | undefined)?.refCode
    const refCode = typeof refCodeRaw === 'string' ? refCodeRaw.trim().toUpperCase() : ''
    if (!refCode) return ''

    const { prisma: db, getAffiliateByCode } = await import('@saas/db')
    const aff = await getAffiliateByCode(refCode)
    if (aff?.status !== 'active' || aff.userId === userId) return ''

    const latestClick = await db.affiliateClick.findFirst({
      where: { affiliateId: aff.id },
      orderBy: { clickedAt: 'desc' },
      select: { id: true },
    })
    return latestClick?.id ? `${aff.id}:${latestClick.id}` : aff.id
  } catch (err) {
    logger.error(
      { err },
      'resolveCheckoutAttribution: lookup failed; continuing without attribution',
    )
    return ''
  }
}

/**
 * GET /checkout/billing-portal
 *
 * Opens Dodo's hosted billing portal. We don't persist a customer id — every
 * checkout implicitly creates one — so it's looked up by email at request
 * time. 404 when nobody has ever purchased anything: a portal link for a
 * customer that doesn't exist yet is a broken link, not a helpful one.
 */
router.get('/billing-portal', async (req, res) => {
  const userId = requireAuth(req, res)
  if (!userId) return

  const dodoKey = process.env.DODO_PAYMENTS_API_KEY
  if (!dodoKey) return res.status(503).json({ error: 'Dodo Payments not configured' })

  try {
    const { prisma } = await import('@saas/db')
    const profile = await prisma.userProfile.findUnique({ where: { id: userId } })
    if (!profile?.email) return res.status(404).json({ error: 'No billing history yet' })

    const client = new DodoPayments({ bearerToken: dodoKey, environment: DODO_ENV })
    const customers = await client.customers.list({ email: profile.email })
    const customer = customers.items[0]
    if (!customer) return res.status(404).json({ error: 'No billing history yet' })

    const session = await client.customers.customerPortal.create(customer.customer_id)
    res.json({ url: session.link })
  } catch (error: unknown) {
    logger.error(
      { err: error instanceof Error ? error.message : String(error), userId },
      '[Dodo Billing Portal] Error',
    )
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) })
  }
})

router.post('/', async (req, res) => {
  const userId = requireAuth(req, res)
  if (!userId) return

  const { pack, topup } = req.body as { pack?: PackKey; topup?: TopupKey }

  let chosen
  let isTopup = false

  if (pack) {
    chosen = CREDIT_PACKS[pack]
  } else if (topup) {
    chosen = TOPUP_PACKS[topup]
    isTopup = true
  }

  if (!chosen) return res.status(400).json({ error: 'Invalid pack' })

  const dodoKey = process.env.DODO_PAYMENTS_API_KEY
  if (!dodoKey) return res.status(503).json({ error: 'Dodo Payments not configured' })
  if (!chosen.productId) {
    return res.status(503).json({ error: 'This plan is not available for purchase yet' })
  }

  try {
    // Every subscription checkout creates a new Dodo subscription, while
    // top-ups are add-ons reserved for users who already have a paid plan.
    if (pack || isTopup) {
      const { getActiveSubscription } = await import('@saas/db')
      const existing = await getActiveSubscription(userId)
      if (isTopup && !existing) {
        return res.status(403).json({ error: 'A paid plan is required to buy one-time credits.' })
      }
      if (existing && !isTopup) {
        return res.status(409).json({
          error:
            'You already have an active subscription. Cancel or manage it in Settings before changing plans.',
        })
      }
    }

    const client = new DodoPayments({
      bearerToken: dodoKey,
      environment: DODO_ENV,
    })

    // Build the affiliate attribution payload for the Dodo session metadata.
    // Resolved by `resolveCheckoutAttribution` so the main flow stays linear;
    // attribution failures there never block the payment.
    const affCookie = await resolveCheckoutAttribution(req, userId)
    assert(
      affCookie === '' || /^[A-Za-z0-9_-]+(?::[A-Za-z0-9_-]+)?$/.test(affCookie),
      'resolveCheckoutAttribution returned a malformed cookie value',
    )
    const appUrl = new URL(process.env.APP_URL || 'https://trypitch.co')
    // app.trypitch.co was used during deployment planning but has no public DNS.
    if (appUrl.hostname === 'app.trypitch.co') appUrl.hostname = 'trypitch.co'

    const session = await client.checkoutSessions.create({
      product_cart: [{ product_id: chosen.productId, quantity: 1 }],
      metadata: {
        clerk_user_id: userId,
        credits: chosen.credits.toString(),
        pack: pack || topup || 'pro',
        type: isTopup ? 'topup' : 'subscription',
        affiliate_cookie: affCookie,
      },
      // Dodo appends subscription_id and payment_id to the return_url automatically.
      return_url: `${appUrl.origin}/checkout/return?checkout=success`,
    })

    res.json({ url: session.checkout_url })
  } catch (error: unknown) {
    logger.error(
      { err: error instanceof Error ? error.message : String(error) },
      '[Dodo Checkout] Error',
    )
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) })
  }
})

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
  const userId = requireAuth(req, res)
  if (!userId) return

  let subscriptionId = req.query.subscription_id as string | undefined
  const paymentId = req.query.payment_id as string | undefined
  const sessionId = req.query.session_id as string | undefined

  if (!subscriptionId && !paymentId && !sessionId) {
    return res.status(400).json({ error: 'Missing subscription_id, payment_id, or session_id' })
  }

  const dodoKey = process.env.DODO_PAYMENTS_API_KEY
  if (!dodoKey) return res.status(503).json({ error: 'Dodo Payments not configured' })

  try {
    const { prisma, upsertSubscription, recordTopUp, getCreditBalance } = await import('@saas/db')

    const dodoClient = () =>
      new DodoPayments({
        bearerToken: dodoKey,
        environment: DODO_ENV,
      })

    // --- One-time top-up (payment_id) ---
    // recordTopUp is idempotent, so we always fetch from Dodo to build the
    // receipt and (re)attempt the grant; a late webhook is a harmless no-op.
    if (paymentId && !subscriptionId) {
      const payment = await dodoClient().payments.retrieve(paymentId)

      if (payment.status !== 'succeeded') {
        return res.json({ status: payment.status ?? 'pending' })
      }

      const metadata = (payment.metadata || {}) as Record<string, string>
      const payUserId = metadata.clerk_user_id
      const packKey = metadata.pack as keyof typeof TOPUP_PACKS
      const credits = parseInt(metadata.credits || '0', 10)

      if (!payUserId) {
        return res.status(400).json({ error: 'Payment metadata missing clerk_user_id' })
      }
      if (payUserId !== userId) {
        return res.status(403).json({ error: 'Payment does not belong to this user' })
      }

      if (payment.subscription_id) {
        // Some redirects only contain payment_id. Use the subscription grant
        // below so its webhook cannot also credit this purchase as a top-up.
        subscriptionId = payment.subscription_id
      } else {
        if (metadata.type !== 'topup') {
          return res.status(400).json({ error: 'Payment is not a credit top-up' })
        }
        if (credits > 0) {
          const pack = TOPUP_PACKS[packKey]
          await recordTopUp({
            userId: payUserId,
            dodoPaymentId: paymentId,
            packKey: packKey || 'flex',
            credits,
            amountUsd: pack?.priceUsd ?? credits * CREDIT_RETAIL_USD,
          })
        }

        const balance = await getCreditBalance(payUserId)
        const receipt = buildPaymentReceipt(payment, balance)
        return res.json({ status: 'succeeded', credits_granted: credits, receipt })
      }
    }

    // --- Subscription (subscription_id) ---
    if (subscriptionId) {
      const subscription = await dodoClient().subscriptions.retrieve(subscriptionId)

      const metadata = (subscription.metadata || {}) as Record<string, string>
      const subUserId = metadata.clerk_user_id
      const planKey = metadata.pack || 'pro'
      const credits = parseInt(metadata.credits || '0', 10)

      if (subUserId && subUserId !== userId) {
        return res.status(403).json({ error: 'Subscription does not belong to this user' })
      }

      if (subscription.status === 'active') {
        if (!subUserId) {
          return res.status(400).json({ error: 'Subscription metadata missing clerk_user_id' })
        }

        // The subscription grant is idempotent with the webhook handler via
        // `sub_grant:${subscriptionId}:initial`. Only grant when not already recorded.
        const existing = await prisma.subscription.findUnique({
          where: { dodoSubscriptionId: subscriptionId },
        })
        if (!existing && credits > 0) {
          const rawStart =
            (subscription as any).previous_billing_date ||
            (subscription as any).current_period_start ||
            subscription.created_at
          const rawEnd =
            (subscription as any).next_billing_date || (subscription as any).current_period_end
          const periodStart = rawStart ? new Date(rawStart) : new Date()
          const periodEnd = rawEnd
            ? new Date(rawEnd)
            : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
          await upsertSubscription({
            userId: subUserId,
            dodoSubscriptionId: subscriptionId,
            planKey,
            status: 'active',
            creditsPerCycle: credits,
            currentPeriodStart: periodStart,
            currentPeriodEnd: periodEnd,
            idempotencyKey: `sub_grant:${subscriptionId}:initial`,
          })
          logger.info(
            { userId: subUserId, credits, subscriptionId },
            '[Checkout] Subscription credits granted via polling fallback',
          )
        }

        const balance = await getCreditBalance(subUserId)
        const receipt = buildSubscriptionReceipt(subscription, balance)
        return res.json({ status: 'succeeded', credits_granted: credits, receipt })
      }

      return res.json({ status: subscription.status })
    }

    // --- Only had a session_id — confirm grant landed, no receipt details ---
    if (sessionId) {
      const tx = await prisma.creditTransaction.findFirst({
        where: { userId, OR: [{ idempotencyKey: { contains: `:${sessionId}` } }] },
      })
      if (tx) return res.json({ status: 'succeeded' })
    }

    return res.json({ status: 'pending' })
  } catch (error: unknown) {
    logger.error(
      { err: error instanceof Error ? error.message : String(error) },
      '[Dodo Checkout Status] Error',
    )
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) })
  }
})

/**
 * GET /checkout/receipt?payment_id=pay_xxx
 * GET /checkout/receipt?subscription_id=sub_xxx
 *
 * Read-only: rebuilds the receipt for a past purchase so it can be re-downloaded
 * from billing history. Unlike /status it never grants credits.
 */
router.get('/receipt', async (req, res) => {
  const userId = requireAuth(req, res)
  if (!userId) return

  const subscriptionId = req.query.subscription_id as string | undefined
  const paymentId = req.query.payment_id as string | undefined

  if (!subscriptionId && !paymentId) {
    return res.status(400).json({ error: 'Missing payment_id or subscription_id' })
  }

  const dodoKey = process.env.DODO_PAYMENTS_API_KEY
  if (!dodoKey) return res.status(503).json({ error: 'Dodo Payments not configured' })

  try {
    const { getCreditBalance } = await import('@saas/db')
    const client = new DodoPayments({ bearerToken: dodoKey, environment: DODO_ENV })
    const balance = await getCreditBalance(userId)

    if (paymentId) {
      const payment = await client.payments.retrieve(paymentId)
      const metadata = (payment.metadata || {}) as Record<string, string>
      if (metadata.clerk_user_id && metadata.clerk_user_id !== userId) {
        return res.status(403).json({ error: 'Payment does not belong to this user' })
      }
      const receipt = buildPaymentReceipt(payment, balance)
      return res.json({ receipt })
    }

    const subscription = await client.subscriptions.retrieve(subscriptionId!)
    const metadata = (subscription.metadata || {}) as Record<string, string>
    if (metadata.clerk_user_id && metadata.clerk_user_id !== userId) {
      return res.status(403).json({ error: 'Subscription does not belong to this user' })
    }
    const receipt = buildSubscriptionReceipt(subscription, balance)
    return res.json({ receipt })
  } catch (error: unknown) {
    logger.error(
      { err: error instanceof Error ? error.message : String(error) },
      '[Dodo Receipt] Error',
    )
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) })
  }
})
