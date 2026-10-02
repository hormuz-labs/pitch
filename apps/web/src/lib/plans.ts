/**
 * The credit catalogue, as the product surfaces present it.
 *
 * Credits are fine grained: the studio meters model spend and render time and
 * draws it down a fraction of a cent at a time, so a demo video is about 120
 * credits rather than three. Prices here mirror CREDIT_PACKS / TOPUP_PACKS in
 * apps/api/src/config.ts — the API is authoritative for what is charged, these
 * are the numbers we show.
 */

/**
 * The balance a new job needs to start. Must equal MIN_BALANCE in
 * apps/api/src/projects/usage.ts (pinned by tests/credit-start-minimum.test.ts).
 * A job already under way is not held to it: it runs until the balance is 0.
 */
export const START_MIN_CREDITS = 40

/**
 * The one-time Discord welcome grant. Must equal DISCORD_WELCOME_CREDITS in
 * packages/db (pinned by tests/credit-start-minimum.test.ts); screens that
 * have the API's live value show that instead.
 */
export const DISCORD_WELCOME_CREDITS = 1500

/** How many more credits a new job needs; 0 when it can start (or when unknown). */
export function creditsNeededToStart(balance: number | null): number {
  if (balance === null) return 0
  return Math.max(0, START_MIN_CREDITS - Math.max(0, balance))
}

/** Credits a typical demo video consumes, used for the "about N videos" copy. */
export const CREDITS_PER_DEMO_VIDEO = 120

/** One row of the pricing page's model table, served by GET /pricing/models. */
export interface ModelRate {
  spec: string
  name: string
  detail: string
  credits: number
  unit: 'typical generation'
  access: 'all' | 'request'
}

export const nonCreditFeatures = (plan: Plan): string[] =>
  plan.features.filter(feature => !/^[\d,]+ credits per (month|year)$/.test(feature))

export const planIncludesLabel = (plan: Plan): string => {
  if (plan.kind === 'free') return 'Included with Free'
  if (plan.key === 'pro') return 'Everything in Free, plus'
  if (plan.key === 'max') return 'Everything in Pro, plus'
  return 'Everything in Max, plus'
}

export type Cadence = 'monthly' | 'annual'

export interface Plan {
  /** Checkout key. `enterprise` has no product: it routes to sales. */
  key: 'free' | 'flex' | 'pro' | 'max' | 'enterprise'
  name: string
  /** How the purchase recurs, which decides the checkout call. */
  kind: 'free' | 'topup' | 'subscription' | 'contact'
  priceUsd: number | null
  credits: number | null
  description: string
  features: string[]
  popular?: boolean
  /** Present only on plans that also sell annually. */
  annual?: { key: string; priceUsd: number; credits: number }
}

/** A plan's price/credits/checkout-key for one billing cadence. */
export interface CadenceView {
  key: string
  priceUsd: number
  credits: number
  cadence: Cadence
}

/** Resolves a subscription plan to its monthly or annual numbers and key. */
export function forCadence(plan: Plan, cadence: Cadence): CadenceView | null {
  if (cadence === 'annual') {
    if (!plan.annual) return null
    return {
      key: plan.annual.key,
      priceUsd: plan.annual.priceUsd,
      credits: plan.annual.credits,
      cadence,
    }
  }
  if (plan.priceUsd === null || plan.credits === null) return null
  return { key: plan.key, priceUsd: plan.priceUsd, credits: plan.credits, cadence }
}

/** How much cheaper the annual price is than paying monthly for a year, as a whole percent. */
export function annualSavingsPercent(plan: Plan): number | null {
  if (!plan.annual || !plan.priceUsd) return null
  return Math.round((1 - plan.annual.priceUsd / (plan.priceUsd * 12)) * 100)
}

export const PLANS: readonly Plan[] = [
  {
    key: 'free',
    name: 'Free',
    kind: 'free',
    priceUsd: 0,
    credits: 0,
    description: 'Explore the studio and start projects before choosing a paid plan.',
    features: ['Create and edit projects', 'Preview the studio workflow', 'Upgrade when ready'],
  },
  {
    key: 'flex',
    name: 'Flex',
    kind: 'topup',
    priceUsd: 20,
    credits: 800,
    description: 'Add-on credits for Pro and Max, for when a project needs more runway.',
    features: [
      '800 credits',
      'Requires an active Pro or Max plan',
      'One-time purchase',
      'Credits stay yours until used',
    ],
  },
  {
    key: 'pro',
    name: 'Pro',
    kind: 'subscription',
    priceUsd: 45,
    credits: 2500,
    description: 'Regular launches and demos, with a fresh credit allowance every month.',
    features: [
      '2,500 credits per month',
      'Watermark-free exports',
      'Up to 4K exports',
      'Flex add-on credits when you need more',
    ],
    popular: true,
    annual: { key: 'pro_annual', priceUsd: 432, credits: 30_000 },
  },
  {
    key: 'max',
    name: 'Max',
    kind: 'subscription',
    priceUsd: 80,
    credits: 5000,
    description: 'Higher monthly volume for teams and solo creators publishing often.',
    features: [
      '5,000 credits per month',
      'Watermark-free exports',
      'Up to 4K exports',
      'Lowest price per credit',
    ],
    annual: { key: 'max_annual', priceUsd: 768, credits: 60_000 },
  },
  {
    key: 'enterprise',
    name: 'Enterprise',
    kind: 'contact',
    priceUsd: null,
    credits: null,
    description: 'For teams with custom workflow needs.',
    features: [
      'Custom credit volume',
      'Volume pricing',
      'Custom workflow setup',
      'Dedicated account manager',
    ],
  },
]

export const planByKey = (key: string) => PLANS.find(plan => plan.key === key)

/** Price of a single credit, in dollars — e.g. `$0.025`. Works for any cadence. */
export function pricePerCredit(plan: {
  priceUsd: number | null
  credits: number | null
}): string | null {
  if (!plan.priceUsd || !plan.credits) return null
  return `$${(plan.priceUsd / plan.credits).toFixed(3)}`
}

/** Roughly how many demo videos a plan's credits buy. Works for any cadence. */
export function demoVideos(plan: { credits: number | null }): number | null {
  return plan.credits ? Math.floor(plan.credits / CREDITS_PER_DEMO_VIDEO) : null
}

export const formatCredits = (credits: number) => credits.toLocaleString('en-US')
