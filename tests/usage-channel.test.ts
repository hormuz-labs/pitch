/**
 * chargeTurn attributes spend to the channel the project came from, so the
 * settings usage chart can split "made in the app" from "made over the API".
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  deductCredit: vi.fn().mockResolvedValue(0),
  projectFindUnique: vi.fn(),
  projectUpdate: vi.fn().mockResolvedValue({}),
}))

vi.mock('@saas/db', () => ({
  deductCredit: mocks.deductCredit,
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
  it('applies a model multiplier to model and compute cost', () => {
    expect(usageUsd({ modelUsd: 0.1, computeSeconds: 10 }, 2)).toBeCloseTo(0.275)
  })

  it('projects the unpaid credits accrued during an active turn', () => {
    expect(projectedCreditsOwed(0.1, 40, { modelUsd: 0.02, computeSeconds: 5 }, 1, 1)).toBe(12)
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
})
