# Pitch — Pricing

> Machine-readable pricing for trypitch.co. Last updated: 2026-09-25.

**Currency:** USD
**Billing:** Monthly or annual auto-renewing subscriptions (Pro, Max), plus Flex, a one-time credit add-on that requires an active Pro or Max plan. Free accounts can explore the studio and start projects.
**Credit economics:** Credits are metered, not per-video. The studio bills model usage plus machine time spent recording and rendering at one credit per $0.0025. A turn that loads a provided Pitch skill applies a 2.5x multiplier (250% of cost) to that turn's model usage only; host compute and provider charges are not multiplied. Every credit granted stays in your balance until you spend it, including monthly plan credits after a subscription is cancelled or ends. Plan features end with the plan.
**Payment provider:** Dodo Payments.

## Plans

| Plan       | Price        | Credits        | $/credit | Videos (~) | Watermark | Notes                                       |
|------------|--------------|----------------|----------|------------|-----------|---------------------------------------------|
| Flex       | $20 one-time | 800            | $0.025   | Metered    | —         | Add-on credits; requires an active Pro or Max plan |
| Pro        | $45 / month  | 2,500 / month  | $0.018   | Metered    | Removed   | Up to 4K, Flex add-on credits               |
| Max        | $80 / month  | 5,000 / month  | $0.016   | Metered    | Removed   | Up to 4K, lowest price per credit           |
| Enterprise | Custom       | Custom         | Custom   | Custom     | Removed   | Volume pricing, dedicated account manager   |

Annual billing: Pro $432 / year (30,000 credits), Max $768 / year (60,000 credits), 20% less than monthly.

## Indicative costs

| Work                       | Credits (~) |
|----------------------------|-------------|
| Provided-skill model usage | 250% of model cost (2.5x) |
| Host compute               | $0.002 per second |
| Provider charges           | Pass through without the skill multiplier |
| Authenticated browser session | 80       |

Work is billed from measured usage rather than fixed per-outcome prices.

## Watermark

Exports from accounts without a Pro or Max plan carry a small "Powered by trypitch.co" watermark. An active Pro or Max plan removes it; after cancelling, exports stay watermark-free until the end of the period already paid for.

## What's included on every plan

- MP4 exports up to 4K
- AI agent that navigates your live product in a real browser
- Auto-generated script, voiceover, and cinematic cursor motion
- Per-scene re-render, caption editing, voice swap

## Enterprise add-ons

- Custom AI credit volume
- Custom workflow setup for your product
- Dedicated account manager
- Contact: support@trypitch.co
