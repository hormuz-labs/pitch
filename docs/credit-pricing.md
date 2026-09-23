# Credit pricing

This document explains how Pitch meters a turn, converts it to credits, estimates
how many generations a user has left, and grants credits through each plan.

## Actual billing

Pitch does not charge a fixed amount for every prompt. It measures the work done:

```text
billable cost USD = (
  model API cost USD * model multiplier
  + host compute seconds * $0.002
  + generated-video provider cost USD
) * platform margin

total credits earned by project = floor(total billable cost USD / $0.0025)

credits charged now = total credits earned by project - credits already charged
```

Current constants:

| Setting | Current value | Purpose |
|---|---:|---|
| `CREDIT_USD` | $0.0025 | Billable cost represented by one credit |
| `COMPUTE_USD_PER_SEC` | $0.002 | Host-action compute cost per second |
| `STUDIO_PLATFORM_MARGIN` | 1.25x | 25% platform margin |
| `BASE_GENERATION_CREDITS` | 100 | Pre-margin frontend estimate for a typical generation |

The platform margin is a multiplier, not a 25-credit fixed fee. A turn with a
raw cost of $0.20 on a 2x model is billed as:

```text
$0.20 * 2 * 1.25 = $0.50 billable cost
$0.50 / $0.0025 = 200 credits
```

Usage accumulates on the project before rounding. This avoids rounding every
small prompt up to one credit.

## Model pricing

The model multiplier is configured with `STUDIO_MODEL_CREDIT_MULTIPLIERS`.
Azure APIM provides GPT-5.5, GPT-5.6 Luna/Terra/Sol, and GPT-6
Luna/Sol/Astra. The studio defaults reasoning to `medium`; reasoning tokens are
already included in reported model usage, so there is no second reasoning-level
surcharge.

Every runnable model is shown regardless of plan. Selecting one does not deduct
credits. The composer warns when the balance is below the model-and-duration
estimate, and project creation performs the authoritative balance check before
generation starts.

The Free plan means no active subscription; it does not make model usage free.
Free users can generate only with credits already in their balance from rewards,
promotions, or earlier purchases.

| Model | Harness | Video provider cost | 30s estimate |
|---|---:|---:|---:|
| Gemini 3.8 Flash | 125 credits | None configured | 125 credits |
| Gemini 3.1 Pro | 250 credits | None configured | 250 credits |
| Gemma 4 26B | 94 credits | None configured | 94 credits |
| Gemma 4 31B | 125 credits | None configured | 125 credits |
| GPT-5.4 mini | 125 credits | None configured | 125 credits |
| GPT-5.4 | 250 credits | None configured | 250 credits |
| GPT-5.5 | 188 credits | None configured | 188 credits |
| Luna | 94 credits | None configured | 94 credits |
| Terra | 125 credits | None configured | 125 credits |
| Sol | Included | $7/30s | 1,250 credits |
| Astra | Included | $10/30s | 2,500 credits |

The harness estimate includes the platform margin:

```text
estimated credits = ceil(100 * model multiplier * 1.25)
```

Therefore:

```text
1x model: ceil(100 * 1 * 1.25) = 125 credits
2x model: ceil(100 * 2 * 1.25) = 250 credits
```

The UI's `N left` value is:

```text
generations left = floor(current credit balance / estimated credits)
```

Duration-priced video models add:

```text
billable duration = max(30 seconds, selected duration)
video credits = fixed credits per 30s * billable duration / 30
normal charge = video credits (includes the harness allowance)
no-loss floor = ceil(actual billable cost / $0.0128)
final charge = max(normal charge, no-loss floor)
```

| Model | 6s or 15s | 30s | 60s |
|---|---:|---:|---:|
| Sol | 1,250 | 1,250 | 2,500 |
| Astra | 2,500 | 2,500 | 5,000 |

This is an estimate. Actual billing can be lower or higher because token usage,
tool calls, rendering time, and recording time vary between requests.

Current Azure pricing configuration:

```env
STUDIO_MODEL_CREDIT_MULTIPLIERS='{"azure-apim/gpt-5.6-sol":1,"azure-apim/gpt-6-astra":2}'
STUDIO_PLATFORM_MARGIN=1.25
STUDIO_VIDEO_MODEL_COSTS_USD_30S='{"azure-apim/gpt-5.6-sol":7,"azure-apim/gpt-6-astra":10}'
STUDIO_VIDEO_MODEL_CREDITS_30S='{"azure-apim/gpt-5.6-sol":1250,"azure-apim/gpt-6-astra":2500}'
```

The identifiers match the Azure APIM models in `.pi/models.json`.

Azure APIM authentication uses:

```env
AZURE_APIM_PRIMARY_KEY="..."
AZURE_APIM_SECONDARY_KEY="..."
```

Primary is preferred; secondary is used only when primary is absent. Restart
the API after changing either key.

## Plans

| Plan | Customer price | Credits granted | Customer price per credit |
|---|---:|---:|---:|
| Free | $0 | 0 recurring credits | — |
| Flex, one-time | $20 | 800 | $0.0250 |
| Pro, monthly | $45/month | 2,500/month | $0.0180 |
| Max, monthly | $80/month | 5,000/month | $0.0160 |
| Pro, annual | $432/year | 30,000/year | $0.0144 |
| Max, annual | $768/year | 60,000/year | $0.0128 |
| Enterprise | Custom | Custom | Custom |

Annual subscriptions grant the full annual allowance when the subscription is
activated or renewed. Flex is a one-time add-on available only while Pro or Max
is active; the API enforces this requirement. Unused subscription credits are
forfeited when the subscription ends; purchased top-up credits remain.

## Estimated generations by plan

These counts use a 30-second selection: 125/250 credits for ordinary 1x/2x
models, 1,250 for Sol, and 2,500 for Astra.

| Plan | Credits | 1x model | 2x model | Sol 30s | Astra 30s |
|---|---:|---:|---:|---:|---:|
| Free | 0 recurring | 0 | 0 | 0 | 0 |
| Flex add-on | 800 | 6 | 3 | 0 | 0 |
| Pro monthly | 2,500 | 20 | 10 | 2 | 1 |
| Max monthly | 5,000 | 40 | 20 | 4 | 2 |
| Pro annual | 30,000 | 240 | 120 | 24 | 12 |
| Max annual | 60,000 | 480 | 240 | 48 | 24 |

## Estimated customer price per generation

This is the effective customer price based on the plan's price per credit. It is
not the provider API cost.

| Plan | 1x model, 125 credits | 2x model, 250 credits |
|---|---:|---:|
| Flex | $3.13 | $6.25 |
| Pro monthly | $2.25 | $4.50 |
| Max monthly | $2.00 | $4.00 |
| Pro annual | $1.80 | $3.60 |
| Max annual | $1.60 | $3.20 |

## Internal cost versus customer price

`CREDIT_USD` is an internal billing conversion, not the retail sale price of a
credit. One credit represents $0.0025 of billable metered work, while plans sell
credits for $0.0128-$0.025 each. The difference funds infrastructure, failed or
refunded work, payment fees, support, product development, and operating margin.

The separate 1.25x platform margin intentionally increases measured consumption
before it is converted into credits. Change it through `STUDIO_PLATFORM_MARGIN`
without redenominating stored credit balances.
