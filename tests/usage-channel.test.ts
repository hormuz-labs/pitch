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

import { chargeTurn } from '../apps/api/src/projects/usage.js'

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

  it('attributes a Discord-made project only to its sponsored Discord balance', async () => {
    mocks.projectFindUnique.mockResolvedValue({ usageUsd: 0, creditsCharged: 0 })

    await chargeTurn(project({ source: 'discord' }), 0.3, 'discord')

    expect(mocks.deductCredit).toHaveBeenCalledWith(
      'user_1',
      expect.any(Number),
      expect.any(String),
      expect.objectContaining({ channel: 'discord' }),
    )
  })

  it('uses main product credits for later web edits to a Discord-origin project', async () => {
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
