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

export interface Plan {
  /** Checkout key. `enterprise` has no product: it routes to sales. */
  key: 'flex' | 'pro' | 'max' | 'enterprise'
  name: string
  /** How the purchase recurs, which decides the checkout call. */
  kind: 'topup' | 'subscription' | 'contact'
  priceUsd: number | null
  credits: number | null
  description: string
  features: string[]
  popular?: boolean
}

export const PLANS: readonly Plan[] = [
  {
    key: 'flex',
    name: 'Flex',
    kind: 'topup',
    priceUsd: 20,
    credits: 800,
    description: 'Best for occasional videos without a recurring plan.',
    features: ['800 credits', 'No subscription required', 'Up to 1080p exports'],
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

/** Price of a single credit, in dollars — e.g. `$0.025`. */
export function pricePerCredit(plan: Plan): string | null {
  if (!plan.priceUsd || !plan.credits) return null
  return `$${(plan.priceUsd / plan.credits).toFixed(3)}`
}

/** Roughly how many demo videos a plan's credits buy. */
export function demoVideos(plan: Plan): number | null {
  return plan.credits ? Math.floor(plan.credits / CREDITS_PER_DEMO_VIDEO) : null
}

export const formatCredits = (credits: number) => credits.toLocaleString('en-US')
