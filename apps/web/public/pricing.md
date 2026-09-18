# Pitch — Pricing

> Machine-readable pricing for trypitch.co. Last updated: 2026-09-18.

**Currency:** USD
**Billing:** Monthly auto-renewing subscriptions, plus a one-time credit pack that needs no subscription.
**Credit economics:** Credits are metered, not per-video. The studio bills model usage plus machine time spent recording and rendering at one credit per $0.0025. A turn that loads a provided Pitch skill applies a 250x multiplier to that turn's model usage only; host compute and provider charges are not multiplied. Credits you buy outright are yours to keep; whatever is left of a monthly allowance is forfeited when the subscription ends, including after a failed renewal payment.
**Payment provider:** Dodo Payments.

## Plans

| Plan       | Price        | Credits        | $/credit | Videos (~) | Watermark | Notes                                       |
|------------|--------------|----------------|----------|------------|-----------|---------------------------------------------|
| Flex       | $20 one-time | 800            | $0.025   | Metered    | Removed   | No subscription required, up to 1080p       |
| Pro        | $45 / month  | 2,500 / month  | $0.018   | Metered    | Removed   | Custom agent instructions, up to 4K         |
| Max        | $80 / month  | 5,000 / month  | $0.016   | Metered    | Removed   | Priority queue, for teams publishing often  |
| Enterprise | Custom       | Custom         | Custom   | Custom     | Removed   | Volume pricing, dedicated account manager   |

## Indicative costs

| Work                       | Credits (~) |
|----------------------------|-------------|
| Provided-skill model usage | 250x model cost |
| Host compute               | $0.002 per second |
| Provider charges           | Pass through without the skill multiplier |
| Authenticated browser session | 80       |

Work is billed from measured usage rather than fixed per-outcome prices.

## What's included on every plan

- MP4 exports, up to 1080p on Flex and up to 4K on Pro and Max
- AI agent that navigates your live product in a real browser
- Auto-generated script, voiceover, and cinematic cursor motion
- Per-scene re-render, caption editing, voice swap

## Enterprise add-ons

- Custom AI credit volume
- Custom agent fine-tuning for your product
- Dedicated account manager
- Contact: support@trypitch.co
