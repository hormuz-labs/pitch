/**
 * chargeTurn attributes spend to the channel the project came from, so the
 * settings usage chart can split "made in the app" from "made over the API".
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  deductCredit: vi.fn().mockResolvedValue(0),
  getCreditReservation: vi.fn().mockResolvedValue(null),
  settleCreditReservation: vi.fn().mockResolvedValue(0),
  projectFindUnique: vi.fn(),
  projectUpdate: vi.fn().mockResolvedValue({}),
}))

vi.mock('@saas/db', () => ({
  deductCredit: mocks.deductCredit,
  getCreditReservation: mocks.getCreditReservation,
  settleCreditReservation: mocks.settleCreditReservation,
  prisma: { project: { findUnique: mocks.projectFindUnique, update: mocks.projectUpdate } },
}))
vi.mock('@saas/shared', () => ({ createLogger: () => ({ warn: vi.fn(), info: vi.fn() }) }))
vi.mock('../apps/api/src/studio/host-actions.js', () => ({ takeComputeSeconds: vi.fn(() => 0) }))
vi.mock('../apps/api/src/projects/service.js', () => ({
  workspaceOf: vi.fn(() => ({ internal: {} })),
}))
vi.mock('../apps/api/src/studio/model-picker.js', () => ({
  modelCreditMultiplier: vi.fn((spec: string) => (spec === 'provider/astra' ? 2 : 1)),
  platformMargin: vi.fn(() => 1.25),
}))

import {
  chargeTurn,
  creditLimitMessage,
  effectiveModelMultiplier,
  generationReservationCredits,
  generationReservationFromEstimate,
  noLossCredits,
  projectedCreditsOwed,
  usageUsd,
} from '../apps/api/src/projects/usage.js'

/** A project row with just what chargeTurn reads. */
function project(overrides: Record<string, unknown> = {}) {
  return { id: 'proj_1', userId: 'user_1', title: 'Demo', source: 'app', ...overrides } as any
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.deductCredit.mockResolvedValue(0)
  mocks.projectUpdate.mockResolvedValue({})
  mocks.getCreditReservation.mockResolvedValue(null)
})

describe('chargeTurn channel attribution', () => {
  it('attributes a project made in the app to the product channel', async () => {
    mocks.projectFindUnique.mockResolvedValue({ usageUsd: 0, creditsCharged: 0 })

    await chargeTurn(project({ source: 'app' }), 0.3)

    expect(mocks.deductCredit).toHaveBeenCalledWith(
      'user_1',
      expect.any(Number),
      expect.any(String),
      expect.objectContaining({ channel: 'product' }),
    )
  })

  it('attributes a project made over the public API to the api channel', async () => {
    mocks.projectFindUnique.mockResolvedValue({ usageUsd: 0, creditsCharged: 0 })

    await chargeTurn(project({ source: 'api' }), 0.3)

    expect(mocks.deductCredit).toHaveBeenCalledWith(
      'user_1',
      expect.any(Number),
      expect.any(String),
      expect.objectContaining({ channel: 'api' }),
    )
  })

  it('preserves the historical sponsorship channel when explicitly supplied', async () => {
    mocks.projectFindUnique.mockResolvedValue({ usageUsd: 0, creditsCharged: 0 })

    await chargeTurn(project({ source: 'discord' }), 0.3, 'discord')

    expect(mocks.deductCredit).toHaveBeenCalledWith(
      'user_1',
      expect.any(Number),
      expect.any(String),
      expect.objectContaining({ channel: 'discord' }),
    )
  })

  it('uses regular Pitch credits for Discord-origin projects', async () => {
    mocks.projectFindUnique.mockResolvedValue({ usageUsd: 0, creditsCharged: 0 })

    await chargeTurn(project({ source: 'discord' }), 0.3)

    expect(mocks.deductCredit).toHaveBeenCalledWith(
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
    ).toBeCloseTo(0.25 + 0.02 + 0.5)
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

  it('explains a positive-balance stop with the corrected built-in skill rate', () => {
    const message = creditLimitMessage(199, 100, true)
    expect(message).toContain('199 credits')
    expect(message).toContain('100 credits are available')
    expect(message).toContain('2.5× built-in skill')
    expect(message).not.toContain('ran out')
    expect(creditLimitMessage(50, 40, false)).not.toContain('skill')
  })

  it('prices a teaser below a walkthrough and a cinematic film above it', () => {
    expect(generationReservationCredits(125, 'teaser', 30)).toBe(82)
    expect(generationReservationCredits(125, 'product-walkthrough', 30)).toBe(125)
    expect(generationReservationCredits(125, 'cinematic', 30)).toBe(157)
    expect(generationReservationCredits(125, 'product-walkthrough', 45)).toBe(188)
  })

  it('never discounts below a duration-priced provider reservation', () => {
    expect(
      generationReservationFromEstimate({ total: 1250, harness: 125, video: 1250 }, 'teaser', 15),
    ).toBe(1250)
  })

  it('charges the model selected for this turn', async () => {
    mocks.projectFindUnique.mockResolvedValue({ usageUsd: 0, creditsCharged: 0 })

    await chargeTurn(project(), 0.1, 'product', 'provider/astra')

    expect(mocks.projectUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ usageUsd: 0.25 }) }),
    )
    expect(mocks.deductCredit).toHaveBeenCalledWith(
      'user_1',
      100,
      expect.any(String),
      expect.any(Object),
    )
  })

  it('charges a provided-skill turn at the composed model-only multiplier', async () => {
    mocks.projectFindUnique.mockResolvedValue({ usageUsd: 0, creditsCharged: 0 })

    await chargeTurn(project(), 0.001, 'product', 'provider/astra', 0, 0, undefined, true)

    expect(mocks.projectUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ usageUsd: 0.00625 }) }),
    )
    expect(mocks.deductCredit).toHaveBeenCalledWith(
      'user_1',
      2,
      expect.any(String),
      expect.any(Object),
    )
  })

  it('uses the fixed product rate unless measured cost would create a loss', async () => {
    expect(noLossCredits(12.5)).toBe(977)
    mocks.projectFindUnique.mockResolvedValue({ usageUsd: 0, creditsCharged: 0 })

    await chargeTurn(project(), 0, 'product', 'provider/astra', 10, 2500)

    expect(mocks.deductCredit).toHaveBeenCalledWith(
      'user_1',
      2500,
      expect.any(String),
      expect.any(Object),
    )
  })

  it('raises a product charge to the no-loss floor when measured cost spikes', async () => {
    mocks.projectFindUnique.mockResolvedValue({ usageUsd: 0, creditsCharged: 0 })

    await chargeTurn(project(), 0, 'product', 'provider/astra', 30, 2500)

    expect(mocks.deductCredit).toHaveBeenCalledWith(
      'user_1',
      2930,
      expect.any(String),
      expect.any(Object),
    )
  })

  it('does not mark credits charged when the balance cannot cover them', async () => {
    mocks.projectFindUnique.mockResolvedValue({ usageUsd: 0, creditsCharged: 0 })
    mocks.deductCredit.mockRejectedValueOnce(new Error('Insufficient credits'))

    expect(await chargeTurn(project(), 0.3)).toBe(0)
    expect(mocks.projectUpdate).not.toHaveBeenCalled()
  })

  it('settles a reservation once instead of deducting the same generation twice', async () => {
    mocks.projectFindUnique.mockResolvedValue({ usageUsd: 0, creditsCharged: 0 })
    mocks.getCreditReservation.mockResolvedValue({ status: 'pending', credits: 188 })

    expect(
      await chargeTurn(project(), 0.03, 'product', 'provider/astra', 0, 188, 'project:1'),
    ).toBe(30)
    expect(mocks.settleCreditReservation).toHaveBeenCalledWith('project:1', 30)
    expect(mocks.deductCredit).not.toHaveBeenCalled()
  })
})
