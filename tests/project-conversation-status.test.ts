import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  update: vi.fn().mockResolvedValue({}),
  hasResult: vi.fn().mockResolvedValue(false),
}))
vi.mock('@saas/db', () => ({ prisma: { project: { update: mocks.update, findFirst: vi.fn() } } }))
vi.mock('../apps/api/src/flows/index.js', () => ({
  getAgent: () => ({ hasResult: mocks.hasResult }),
}))

import { followFirstTurn, type ProjectRow } from '../apps/api/src/projects/service.js'
import { emitProjectEvent } from '../apps/api/src/studio/events.js'

beforeEach(() => vi.clearAllMocks())
describe('first conversational turn status', () => {
  it('does not flag a normal text/question-only turn as failed', async () => {
    followFirstTurn(
      { id: 'conversation', userId: 'u', flow: 'studio', name: 'hi' } as ProjectRow,
      1,
    )
    emitProjectEvent('conversation', { type: 'idle', turn: 1, cost: 0 })
    await new Promise(resolve => setImmediate(resolve))
    expect(mocks.hasResult).toHaveBeenCalled()
    expect(mocks.update).not.toHaveBeenCalled()
  })
  it.each([{ failed: true }, { aborted: true }])(
    'still records a real failure: %o',
    async reason => {
      followFirstTurn(
        { id: 'failed', userId: 'u', flow: 'studio', name: 'hi', creditsCharged: 0 } as ProjectRow,
        1,
      )
      emitProjectEvent('failed', { type: 'idle', turn: 1, cost: 0, ...reason })
      await new Promise(resolve => setImmediate(resolve))
      expect(mocks.update).toHaveBeenCalledWith({
        where: { id: 'failed' },
        data: { lastError: expect.any(String) },
      })
    },
  )
})
