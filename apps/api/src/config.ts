// Single source of truth for which Dodo environment we target. Explicit
// DODO_ENVIRONMENT wins (lets dev opt into either mode); when unset we default
// to live in production and test elsewhere. The checkout route imports this so
// the API client and the product IDs below can never point at different envs.
export const DODO_ENV: 'live_mode' | 'test_mode' =
  process.env.DODO_ENVIRONMENT === 'live_mode'
    ? 'live_mode'
    : process.env.DODO_ENVIRONMENT === 'test_mode'
      ? 'test_mode'
      : process.env.NODE_ENV === 'production'
        ? 'live_mode'
        : 'test_mode'

// Product IDs are environment-specific in Dodo — the same plan has a different
// id in live vs test. Keep both sets and pick by DODO_ENV so the API client and
// the products can never point at different environments.
const PRODUCT_IDS =
  DODO_ENV === 'live_mode'
    ? {
        flex: process.env.DODO_PRODUCT_FLEX_LIVE ?? '',
        pro: process.env.DODO_PRODUCT_PRO_LIVE ?? '',
        max: process.env.DODO_PRODUCT_MAX_LIVE ?? '',
      }
    : {
        flex: process.env.DODO_PRODUCT_FLEX_TEST ?? '',
        pro: process.env.DODO_PRODUCT_PRO_TEST ?? '',
        max: process.env.DODO_PRODUCT_MAX_TEST ?? '',
      }

/**
 * Subscriptions we sell today. Credits are fine grained — a demo video is about
 * 120 of them — so a plan's allowance is quoted in thousands and its headline
 * number is the price per credit (see CREDIT_USD in projects/usage.ts).
 */
export const CREDIT_PACKS = {
  pro: { credits: 2500, priceUsd: 45, label: '2,500 Credits/mo', productId: PRODUCT_IDS.pro },
  max: { credits: 5000, priceUsd: 80, label: '5,000 Credits/mo', productId: PRODUCT_IDS.max },
} as const

/** Entry retail price of a credit, used where a pack price is unavailable. */
export const CREDIT_RETAIL_USD = 0.025

/** One-time purchases. Flex is the entry product: no subscription required. */
export const TOPUP_PACKS = {
  flex: {
    credits: 800,
    priceUsd: 20,
    label: '800 Credits (One-time)',
    productId: PRODUCT_IDS.flex,
  },
} as const

/**
 * Plans we no longer sell. Grandfathered subscriptions keep renewing at the
 * allowance they were sold, expressed at today's credit scale (old × 40).
 *
 * `pro` appears here and in CREDIT_PACKS with different allowances, because the
 * old $40 plan and the new $45 plan share a key. Renewals must therefore prefer
 * the allowance stored on the subscription row over any lookup by key — see
 * creditsForRenewal() in routes/webhooks.ts.
 */
export const LEGACY_CREDIT_PACKS = {
  starter: { credits: 400, label: '400 Credits/mo' },
  pro: { credits: 2000, label: '2,000 Credits/mo' },
  enterprise: { credits: 8000, label: '8,000 Credits/mo' },
} as const

/** One-time packs we no longer sell, at today's credit scale (old × 40). */
export const LEGACY_TOPUP_PACKS = {
  topup_10: { credits: 400, label: '400 Credits (One-time)' },
  topup_50: { credits: 2000, label: '2,000 Credits (One-time)' },
} as const

export type PackKey = keyof typeof CREDIT_PACKS
export type TopupKey = keyof typeof TOPUP_PACKS

// ── Referral program ──────────────────────────────────────────────────────────
// New accounts start with an empty wallet. Keep this explicit so signup,
// onboarding, and referral code paths all share the same policy.
export const SIGNUP_BONUS_CREDITS = 0

// Referral rewards are paid to the referrer in credits. Referred users do not
// receive a signup grant: all new accounts start at zero.
export const REFERRAL_REWARDS = {
  newUserBonus: 0,
  referrerSignup: 40,
  referrerPurchase: 320,
} as const

/** In-process webhook delivery (no queue); see lib/webhooks.ts. */
export { webhookQueue } from './lib/webhooks.js'
