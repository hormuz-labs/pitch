# Credit pricing

This document explains how Pitch meters a turn, converts it to credits, estimates
how many generations a user has left, and grants credits through each plan.

## Actual billing

Pitch does not charge a fixed amount for every prompt. It measures the work done:

```text
billable cost USD = (
  model API cost USD * model multiplier
  + host compute seconds * $0.002
  + provider cost USD * ($0.0025 / $0.0128)
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
| `DEFAULT_TYPICAL_TURN` | 50k in / 12.5k out tokens, 30 s | One typical turn, priced per model for estimates |

The platform margin is a multiplier, not a 25-credit fixed fee. A turn with a
raw cost of $0.20 on a 2x model is billed as:

```text
$0.20 * 2 * 1.25 = $0.50 billable cost
$0.50 / $0.0025 = 200 credits
```

Usage accumulates on the project before rounding. This avoids rounding every
small prompt up to one credit.

Each component is billed when it happens, never from what the user selected:

- **The chat model only changes the token price.** The sandbox, renders and
  recordings cost the same on every model. Picking Sol or Astra does not add a
  video charge.
- **Provider cost is what a host action actually paid a third party.** Today
  that is `video_generate` (Gemini Omni), recorded per clip from the clip's
  probed length and resolution (`OMNI_USD_PER_SECOND`; 8 seconds is billed if
  the clip cannot be probed). A turn that animates in code, or uses library
  music, has no provider cost.
- **Provider cost is passed through near cost.** It is scaled by
  `$0.0025 / $0.0128` so a dollar of provider spend becomes the credits that
  earn one dollar on the cheapest plan (Max annual), plus the platform margin —
  not the 5x the credit rate applies to model and compute.

A 60-second 720p generated clip, for example:

```text
provider cost = 60s * $0.10 = $6.00
billable     = $6.00 * (0.0025 / 0.0128) * 1.25 = $1.465
credits      = floor($1.465 / $0.0025) = 585 credits (≈ $7.49 on Max annual)
```

## Reservations

An actionable turn places a hold before the model runs, sized by the model's
harness estimate, the video kind and the requested duration
(`generationReservationCredits`). The hold only checks the user can afford a
meaningful slice of the work. When the turn settles, the reservation is settled
for exactly the credits the turn measured, which can be less than the hold (or
zero). A turn that only asks a question releases its hold.

The hold is capped at the available balance: any account with at least
`MIN_BALANCE` (40) credits can start, including a 1,500-credit Discord welcome
account asking for a film whose estimate is higher. The live check stops a turn
once its measured cost passes the balance; if the last step overshoots, the
settlement takes the balance to exactly zero and the remainder is written off
(it is not carried into the next turn).

A job under way is not held to the 40-credit minimum. Later messages on a
project need a balance above zero (not 40), so work can finish on whatever is
left, but an empty account cannot run a step that would only be written off.

Every ledger write (`reserveCredits`, `settleCreditReservation`, `deductUpTo`,
`deductCredit`) runs under the account row lock and counts other jobs' pending
holds as spent, so concurrent turns can never take a balance below zero.
`tests/integration/credit-ledger.integration.test.ts` proves this against
PostgreSQL; the end-to-end job cases are in `tests/billing.e2e.test.ts`. The
full case list and reasoning are in `docs/pitch-credit-pricing.pdf`.

## Model pricing

The model multiplier is configured with `STUDIO_MODEL_CREDIT_MULTIPLIERS`.
Azure APIM provides GPT-5.5, GPT-5.6 Luna/Terra/Sol, GPT-6 Sol/Astra and
GPT-6.1 Sol, all with image input. (GPT-6 Luna is deployed but text-only, so it
is not offered: the studio agent reads screenshots and review frames.) The
studio defaults reasoning to `medium`; reasoning tokens are already included in
reported model usage, so there is no second reasoning-level surcharge.

Every runnable model is shown regardless of plan. Selecting one does not deduct
credits. The composer warns when the balance is below the model's estimate, and project creation performs the authoritative balance check before
generation starts.

The Free plan means no active subscription; it does not make model usage free.
Free users can generate only with credits already in their balance from rewards,
promotions, or earlier purchases.

| Model | Token price ($/M in / out) | Rate | Typical turn |
|---|---:|---:|---:|
| Gemini 3.8 Flash | 0.75 / 3.75 | 1x | 73 credits |
| Gemini 3.1 Pro | 2 / 12 | 2x | 280 credits |
| GPT-5.4 mini | 0.75 / 4.5 | 1x | 77 credits |
| GPT-5.4 | 2.5 / 15 | 2x | 343 credits |
| GPT-5.5 | 5 / 30 | 1.5x | 499 credits |
| Luna | 0.2 / 1.2 | 0.75x | 40 credits |
| Terra | 2 / 12 | 1x | 155 credits |
| Sol / GPT-6 Sol / GPT-6.1 Sol | 4 / 20 | 1x | 255 credits |
| Astra | 10 / 50 | 2x | 1,155 credits |

The estimate prices one typical turn the way billing prices it: the turn's
tokens at the model's real token price (the runtime's cost table, the same one
that turns each message's usage into its cost) and credit rate, plus machine
time that costs the same on every model, times the margin:

```text
token USD    = (50,000 input × input price + 12,500 output × output price) / 1,000,000
machine USD  = 30 s × $0.002
credits      = ceil((token USD × model rate + machine USD) × 1.25 / $0.0025)

Terra:  ($0.25 × 1 + $0.06) × 1.25 = $0.3875 → 155 credits
Astra:  ($1.125 × 2 + $0.06) × 1.25 = $2.8875 → 1,155 credits
```

The typical turn is configurable with `STUDIO_TYPICAL_TURN`
(`{"inputTokens":50000,"outputTokens":12500,"computeSeconds":30}`) so it can be
calibrated from real projects. A model the runtime has no price for is quoted
at $2 / $12 so it is never shown as free. The built-in skill rate and generated
footage are not in the estimate: they depend on what the turn does, not on the
model. Holds (see Reservations) are sized from this estimate.

The UI's `N left` value is:

```text
generations left = floor(current credit balance / estimated credits)
```

This is an estimate. Actual billing can be lower or higher because token usage,
tool calls, rendering time, and recording time vary between requests.

Current Azure pricing configuration:

```env
STUDIO_MODEL_CREDIT_MULTIPLIERS='{"azure-apim/gpt-5.6-sol":1,"azure-apim/gpt-6-astra":2}'
STUDIO_PLATFORM_MARGIN=1.25
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

## Estimated turns by plan

These counts divide the plan's credits by the typical-turn estimate. A finished
film takes many turns, so it is a ceiling, not a film count. Generated footage
is extra and billed per second actually generated.

| Plan | Credits | Flash (73) | Terra (155) | Sol (255) | Astra (1,155) |
|---|---:|---:|---:|---:|---:|
| Free | 0 recurring | 0 | 0 | 0 | 0 |
| Flex add-on | 800 | 10 | 5 | 3 | 0 |
| Pro monthly | 2,500 | 34 | 16 | 9 | 2 |
| Max monthly | 5,000 | 68 | 32 | 19 | 4 |
| Pro annual | 30,000 | 410 | 193 | 117 | 25 |
| Max annual | 60,000 | 821 | 387 | 235 | 51 |

## Estimated customer price per turn

This is the effective customer price based on the plan's price per credit. It is
not the provider API cost.

| Plan | Flash, 73 | Terra, 155 | Sol, 255 | Astra, 1,155 |
|---|---:|---:|---:|---:|
| Flex | $1.83 | $3.88 | $6.38 | $28.88 |
| Pro monthly | $1.31 | $2.79 | $4.59 | $20.79 |
| Max monthly | $1.17 | $2.48 | $4.08 | $18.48 |
| Pro annual | $1.05 | $2.23 | $3.67 | $16.63 |
| Max annual | $0.93 | $1.98 | $3.26 | $14.78 |

## Internal cost versus customer price

`CREDIT_USD` is an internal billing conversion, not the retail sale price of a
credit. One credit represents $0.0025 of billable metered work, while plans sell
credits for $0.0128-$0.025 each. The difference funds infrastructure, failed or
refunded work, payment fees, support, product development, and operating margin.

The separate 1.25x platform margin intentionally increases measured consumption
before it is converted into credits. Change it through `STUDIO_PLATFORM_MARGIN`
without redenominating stored credit balances.
