/**
 * chargeTurn attributes spend to the channel the project came from, so the
 * settings usage chart can split "made in the app" from "made over the API".
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  deductUpTo: vi.fn(),
  getCreditReservation: vi.fn().mockResolvedValue(null),
  settleCreditReservation: vi.fn(async (_key: string, credits: number) => credits),
  getAvailableCreditBalance: vi.fn().mockResolvedValue(1_000_000),
  projectFindUnique: vi.fn(),
  projectUpdate: vi.fn().mockResolvedValue({}),
  takeComputeSeconds: vi.fn(() => 0),
  takeProviderUsd: vi.fn(() => 0),
}))

vi.mock('@saas/db', () => ({
  deductUpTo: mocks.deductUpTo,
  getCreditReservation: mocks.getCreditReservation,
  settleCreditReservation: mocks.settleCreditReservation,
  getAvailableCreditBalance: mocks.getAvailableCreditBalance,
  prisma: { project: { findUnique: mocks.projectFindUnique, update: mocks.projectUpdate } },
}))
vi.mock('@saas/shared', () => ({ createLogger: () => ({ warn: vi.fn(), info: vi.fn() }) }))
vi.mock('../apps/api/src/studio/host-actions.js', () => ({
  takeComputeSeconds: mocks.takeComputeSeconds,
  takeProviderUsd: mocks.takeProviderUsd,
}))
vi.mock('../apps/api/src/projects/rows.js', () => ({
  workspaceOf: vi.fn(() => ({ internal: 'ws_proj_1' })),
}))
vi.mock('../apps/api/src/studio/model-picker.js', () => ({
  modelCreditMultiplier: vi.fn((spec: string) => (spec === 'provider/astra' ? 2 : 1)),
  platformMargin: vi.fn(() => 1.25),
}))

import {
  CREDIT_LIMIT_MESSAGE,
  CREDIT_USD,
  canStartTurn,
  chargeTurn,
  effectiveModelMultiplier,
  generationReservationCredits,
  MIN_REVENUE_USD_PER_CREDIT,
  noLossCredits,
  PROVIDER_USAGE_PER_USD,
  projectedCreditsOwed,
  usageUsd,
} from '../apps/api/src/projects/usage.js'

/** A project row with just what chargeTurn reads. */
function project(overrides: Record<string, unknown> = {}) {
  return { id: 'proj_1', userId: 'user_1', title: 'Demo', source: 'app', ...overrides } as any
}

beforeEach(() => {
  vi.clearAllMocks()
  // Charges what the account can spend, like the real locked ledger call.
  mocks.deductUpTo.mockImplementation(async (_user: string, amount: number) =>
    Math.min(amount, Math.max(0, await mocks.getAvailableCreditBalance())),
  )
  mocks.projectUpdate.mockResolvedValue({})
  mocks.getCreditReservation.mockResolvedValue(null)
  mocks.getAvailableCreditBalance.mockResolvedValue(1_000_000)
  mocks.takeComputeSeconds.mockReturnValue(0)
  mocks.takeProviderUsd.mockReturnValue(0)
})

describe('chargeTurn channel attribution', () => {
  it('attributes a project made in the app to the product channel', async () => {
    mocks.projectFindUnique.mockResolvedValue({ usageUsd: 0, creditsCharged: 0 })

    await chargeTurn(project({ source: 'app' }), 0.3)

    expect(mocks.deductUpTo).toHaveBeenCalledWith(
      'user_1',
      expect.any(Number),
      expect.any(String),
      expect.objectContaining({ channel: 'product' }),
    )
  })

  it('attributes a project made over the public API to the api channel', async () => {
    mocks.projectFindUnique.mockResolvedValue({ usageUsd: 0, creditsCharged: 0 })

    await chargeTurn(project({ source: 'api' }), 0.3)

    expect(mocks.deductUpTo).toHaveBeenCalledWith(
      'user_1',
      expect.any(Number),
      expect.any(String),
      expect.objectContaining({ channel: 'api' }),
    )
  })

  it('preserves the historical sponsorship channel when explicitly supplied', async () => {
    mocks.projectFindUnique.mockResolvedValue({ usageUsd: 0, creditsCharged: 0 })

    await chargeTurn(project({ source: 'discord' }), 0.3, 'discord')

    expect(mocks.deductUpTo).toHaveBeenCalledWith(
      'user_1',
      expect.any(Number),
      expect.any(String),
      expect.objectContaining({ channel: 'discord' }),
    )
  })

  it('uses regular Pitch credits for Discord-origin projects', async () => {
    mocks.projectFindUnique.mockResolvedValue({ usageUsd: 0, creditsCharged: 0 })

    await chargeTurn(project({ source: 'discord' }), 0.3)

    expect(mocks.deductUpTo).toHaveBeenCalledWith(
      'user_1',
      expect.any(Number),
      expect.any(String),
      expect.objectContaining({ channel: 'product' }),
    )
  })
})

describe('model credit pricing', () => {
  it('applies a model multiplier only to model cost', () => {
    expect(usageUsd({ modelUsd: 0.1, computeSeconds: 10 }, 2)).toBeCloseTo(0.275)
  })

  it('composes the provided-skill multiplier with the selected model multiplier', () => {
    expect(effectiveModelMultiplier(2, false)).toBe(2)
    expect(effectiveModelMultiplier(2, true)).toBe(5)
  })

  it('charges 250% of skill model usage without multiplying compute or provider cost', () => {
    expect(
      usageUsd(
        { modelUsd: 0.1, computeSeconds: 10, providerUsd: 0.5 },
        effectiveModelMultiplier(1, true),
        1,
      ),
    ).toBeCloseTo(0.25 + 0.02 + 0.5 * PROVIDER_USAGE_PER_USD)
  })

  it('passes provider cost through at the cheapest plan revenue, not the credit rate', () => {
    // $1 of provider spend earns $1 back on Max annual, plus the margin.
    const credits = Math.floor(
      usageUsd({ modelUsd: 0, computeSeconds: 0, providerUsd: 1 }, 1, 1) / CREDIT_USD,
    )
    expect(credits).toBe(78)
    expect(credits * MIN_REVENUE_USD_PER_CREDIT).toBeCloseTo(1, 1)
  })

  it('projects the unpaid credits accrued during an active turn', () => {
    expect(projectedCreditsOwed(0.1, 40, { modelUsd: 0.02, computeSeconds: 5 }, 1, 1)).toBe(12)
  })

  it('keeps the Monid turn affordable at 250% instead of 250 times model cost', () => {
    const owed = projectedCreditsOwed(
      13.981906875,
      5592,
      { modelUsd: 0.1587972, computeSeconds: 0 },
      effectiveModelMultiplier(1, true),
      1.25,
    )
    expect(owed).toBe(199)
    expect(owed).toBeLessThan(4426)
  })

  it('tells the user they ran out without exposing rates or multipliers', () => {
    expect(CREDIT_LIMIT_MESSAGE).toContain('ran out of credits')
    expect(CREDIT_LIMIT_MESSAGE).not.toMatch(/\d|×|skill|accrued|usage|rate/i)
  })

  it('prices a teaser below a walkthrough and a cinematic film above it', () => {
    expect(generationReservationCredits(125, 'teaser', 30)).toBe(82)
    expect(generationReservationCredits(125, 'product-walkthrough', 30)).toBe(125)
    expect(generationReservationCredits(125, 'cinematic', 30)).toBe(157)
    expect(generationReservationCredits(125, 'product-walkthrough', 45)).toBe(188)
  })

  it('charges the model selected for this turn', async () => {
    mocks.projectFindUnique.mockResolvedValue({ usageUsd: 0, creditsCharged: 0 })

    await chargeTurn(project(), 0.1, 'product', 'provider/astra')

    expect(mocks.projectUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ usageUsd: 0.25 }) }),
    )
    expect(mocks.deductUpTo).toHaveBeenCalledWith(
      'user_1',
      100,
      expect.any(String),
      expect.any(Object),
    )
  })

  it('charges a provided-skill turn at the composed model-only multiplier', async () => {
    mocks.projectFindUnique.mockResolvedValue({ usageUsd: 0, creditsCharged: 0 })

    await chargeTurn(project(), 0.001, 'product', 'provider/astra', undefined, true)

    expect(mocks.projectUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ usageUsd: 0.00625 }) }),
    )
    expect(mocks.deductUpTo).toHaveBeenCalledWith(
      'user_1',
      2,
      expect.any(String),
      expect.any(Object),
    )
  })

  it('bills provider spend recorded by a host action, on any model', async () => {
    mocks.projectFindUnique.mockResolvedValue({ usageUsd: 0, creditsCharged: 0 })
    mocks.takeProviderUsd.mockReturnValue(6)

    await chargeTurn(project(), 0, 'product', 'provider/cheap')

    // $6 * (0.0025 / 0.0128) * 1.25 = $1.4648 → 585 credits.
    expect(mocks.takeProviderUsd).toHaveBeenCalledWith('ws_proj_1')
    expect(mocks.deductUpTo).toHaveBeenCalledWith(
      'user_1',
      585,
      expect.any(String),
      expect.any(Object),
    )
  })

  it('does not scale provider spend by the chat model multiplier', async () => {
    mocks.projectFindUnique.mockResolvedValue({ usageUsd: 0, creditsCharged: 0 })
    mocks.takeProviderUsd.mockReturnValue(6)
    await chargeTurn(project(), 0, 'product', 'provider/astra')
    expect(mocks.deductUpTo).toHaveBeenLastCalledWith(
      'user_1',
      585,
      expect.any(String),
      expect.any(Object),
    )
  })

  it('does not record usage when the charge itself fails', async () => {
    mocks.projectFindUnique.mockResolvedValue({ usageUsd: 0, creditsCharged: 0 })
    mocks.deductUpTo.mockRejectedValueOnce(new Error('connection lost'))

    expect(await chargeTurn(project(), 0.3)).toBe(0)
    expect(mocks.projectUpdate).not.toHaveBeenCalled()
  })

  it('settles a reservation once instead of deducting the same generation twice', async () => {
    mocks.projectFindUnique.mockResolvedValue({ usageUsd: 0, creditsCharged: 0 })
    mocks.getCreditReservation.mockResolvedValue({ status: 'pending', credits: 188 })

    expect(await chargeTurn(project(), 0.03, 'product', 'provider/astra', 'project:1')).toBe(30)
    expect(mocks.settleCreditReservation).toHaveBeenCalledWith('project:1', 30, {
      capAtAvailable: true,
    })
    expect(mocks.deductUpTo).not.toHaveBeenCalled()
  })

  it('settles a pending hold at zero when the turn measured nothing', async () => {
    mocks.projectFindUnique.mockResolvedValue({ usageUsd: 0, creditsCharged: 0 })
    mocks.getCreditReservation.mockResolvedValue({ status: 'pending', credits: 2500 })

    expect(await chargeTurn(project(), 0, 'product', 'provider/astra', 'project:1')).toBe(0)
    expect(mocks.settleCreditReservation).toHaveBeenCalledWith('project:1', 0, {
      capAtAvailable: true,
    })
    expect(mocks.deductUpTo).not.toHaveBeenCalled()
  })
})

describe('a job runs until the balance reaches zero', () => {
  it('lets a job under way continue below the start minimum, but not start from zero', () => {
    expect(canStartTurn(12, false)).toBe(true)
    expect(canStartTurn(0, true)).toBe(true)
    expect(canStartTurn(0, false)).toBe(false)
    expect(canStartTurn(-3, false)).toBe(false)
  })

  it('takes a reservation overshoot to zero and writes off the rest', async () => {
    mocks.projectFindUnique.mockResolvedValue({ usageUsd: 0, creditsCharged: 0 })
    mocks.getCreditReservation.mockResolvedValue({ status: 'pending', credits: 230 })
    // 0.3 * 1.25 = $0.375 → 150 credits; the account only had 120 left.
    mocks.settleCreditReservation.mockResolvedValueOnce(120)

    expect(await chargeTurn(project(), 0.3, 'product', 'provider/cheap', 'project:1')).toBe(120)
    expect(mocks.projectUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ creditsCharged: 150 }) }),
    )
  })

  it('deducts a follow-up turn down to zero instead of failing', async () => {
    mocks.projectFindUnique.mockResolvedValue({ usageUsd: 0, creditsCharged: 0 })
    mocks.getAvailableCreditBalance.mockResolvedValue(20)

    // 150 credits measured; the locked ledger call caps it at the 20 left.
    expect(await chargeTurn(project(), 0.3, 'product', 'provider/cheap')).toBe(20)
    expect(mocks.deductUpTo).toHaveBeenCalledWith(
      'user_1',
      150,
      expect.any(String),
      expect.any(Object),
    )
  })

  it('charges nothing at a zero balance and does not carry the debt forward', async () => {
    mocks.projectFindUnique.mockResolvedValue({ usageUsd: 0, creditsCharged: 0 })
    mocks.getAvailableCreditBalance.mockResolvedValue(0)

    expect(await chargeTurn(project(), 0.3, 'product', 'provider/cheap')).toBe(0)
    expect(mocks.projectUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ creditsCharged: 150 }) }),
    )
  })
})

/**
 * Reported in the team chat: a Sol project with a 60-second duration was
 * charged a hard-coded $7/30s = $14 "video provider" cost once its reservation
 * activated, although the session animated in code, used library music and
 * never called video_generate. The sandbox costs the same on every model.
 */
describe('billing follows the work, not the model or the selected duration', () => {
  it('charges a code-animated Sol turn only its tokens and compute', async () => {
    mocks.projectFindUnique.mockResolvedValue({ usageUsd: 0, creditsCharged: 0 })
    mocks.getCreditReservation.mockResolvedValue({ status: 'pending', credits: 250 })
    mocks.takeComputeSeconds.mockReturnValue(120)

    const owed = await chargeTurn(
      project({ options: { durationSeconds: 60 } }),
      0.4,
      'product',
      'provider/sol',
      'project:1',
    )

    // ($0.40 * 1 + 120s * $0.002) * 1.25 = $0.80 → 320 credits. No $14.
    expect(owed).toBe(320)
    expect(mocks.settleCreditReservation).toHaveBeenCalledWith('project:1', 320, {
      capAtAvailable: true,
    })
    // $14 billed at the no-loss rate would have been at least this much.
    expect(owed).toBeLessThan(noLossCredits(14))
  })

  it('charges the same sandbox time identically on every model', async () => {
    const charged: number[] = []
    for (const spec of ['provider/cheap', 'provider/sol', 'provider/astra']) {
      vi.clearAllMocks()
      mocks.projectFindUnique.mockResolvedValue({ usageUsd: 0, creditsCharged: 0 })
      mocks.takeComputeSeconds.mockReturnValue(300)
      mocks.takeProviderUsd.mockReturnValue(0)
      charged.push(await chargeTurn(project(), 0, 'product', spec))
    }
    // 300s * $0.002 * 1.25 = $0.75 → 300 credits, whichever model ran.
    expect(charged).toEqual([300, 300, 300])
  })

  it("never bills an earlier turn's provider cost again on the next turn", async () => {
    // The old code settled provider cost at the pass-through rate but stored
    // it raw in usageUsd, so the next turn's catch-up re-billed it at the
    // credit rate: a phantom $17.50 became ~7,000 credits one turn later.
    mocks.takeProviderUsd.mockReturnValueOnce(14)
    mocks.projectFindUnique.mockResolvedValueOnce({ usageUsd: 0, creditsCharged: 0 })
    const first = await chargeTurn(project(), 0, 'product', 'provider/sol')
    const stored = mocks.projectUpdate.mock.calls[0][0].data

    mocks.projectFindUnique.mockResolvedValueOnce(stored)
    const second = await chargeTurn(project(), 0.01, 'product', 'provider/sol')

    expect(first).toBe(1367)
    expect(second).toBe(5)
  })

  it('ignores the selected duration when nothing was generated', async () => {
    const at = async (durationSeconds: number) => {
      vi.clearAllMocks()
      mocks.projectFindUnique.mockResolvedValue({ usageUsd: 0, creditsCharged: 0 })
      mocks.takeProviderUsd.mockReturnValue(0)
      return chargeTurn(project({ options: { durationSeconds } }), 0.1, 'product', 'provider/sol')
    }
    expect(await at(15)).toBe(await at(120))
  })
})
