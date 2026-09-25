/**
 * The credit catalogue, as the product surfaces present it.
 *
 * Credits are fine grained: the studio meters model spend and render time and
 * draws it down a fraction of a cent at a time, so a demo video is about 120
 * credits rather than three. Prices here mirror CREDIT_PACKS / TOPUP_PACKS in
 * apps/api/src/config.ts — the API is authoritative for what is charged, these
 * are the numbers we show.
 */

/** Credits a typical demo video consumes, used for the "about N videos" copy. */
export const CREDITS_PER_DEMO_VIDEO = 120

export const MODEL_CREDIT_RATES = [
  {
    name: 'Gemini 3.8 Flash',
    detail: 'Fast multimodal production',
    credits: 125,
    unit: 'typical generation',
  },
  {
    name: 'Gemini 3.1 Pro',
    detail: 'Complex multimodal projects',
    credits: 250,
    unit: 'typical generation',
  },
  {
    name: 'Gemma 4 26B',
    detail: 'Efficient open-weight model',
    credits: 94,
    unit: 'typical generation',
  },
  {
    name: 'Gemma 4 31B',
    detail: 'Creative open-weight model',
    credits: 125,
    unit: 'typical generation',
  },
  {
    name: 'GPT-5.4 mini',
    detail: 'Fast everyday production',
    credits: 125,
    unit: 'typical generation',
  },
  {
    name: 'GPT-5.4',
    detail: 'Complex planning and execution',
    credits: 250,
    unit: 'typical generation',
  },
  {
    name: 'Luna',
    detail: 'Fast drafts and lightweight edits',
    credits: 94,
    unit: 'typical generation',
  },
  {
    name: 'Terra',
    detail: 'Everyday production work',
    credits: 125,
    unit: 'typical generation',
  },
  {
    name: 'GPT-5.5',
    detail: 'Deep planning and complex production',
    credits: 188,
    unit: 'typical generation',
  },
  {
    name: 'Sol',
    detail: 'Advanced video generation',
    credits: 1250,
    unit: 'up to 30 seconds',
  },
  {
    name: 'Astra',
    detail: 'Highest-capability video generation',
    credits: 2500,
    unit: 'up to 30 seconds',
  },
] as const

export const generationsFor = (credits: number | null, rate: number): number | null =>
  credits === null ? null : Math.floor(credits / rate)

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
    description: 'Regular creation, with the tools that make repeat work faster.',
    features: [
      '2,500 credits per month',
      'Custom agent instructions',
      'Watermark-free exports',
      'Up to 4K exports',
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
      'Custom agent instructions',
      'Watermark-free exports',
      'Up to 4K exports',
      'Priority queue access',
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
      'Custom agent fine-tuning',
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
