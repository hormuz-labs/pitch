import { describe, expect, it, vi } from 'vitest'
import { createCreditBalanceState } from '../src/solid/studio/credit-balance'

describe('studio credit balance synchronization', () => {
  it('rejects an HTTP response started before a live projection', () => {
    const apply = vi.fn()
    const state = createCreditBalanceState(apply)
    const request = state.beginRequest()

    expect(state.applyLive({ balance: 740, pending: true })).toBe(true)
    expect(request.signal.aborted).toBe(true)
    expect(state.applyRequest(800, request.revision)).toBe(false)
    expect(apply.mock.calls).toEqual([[740]])
  })

  it('pauses polling through projection and accepts the settled balance', () => {
    const apply = vi.fn()
    const state = createCreditBalanceState(apply)
    state.applyLive({ balance: 740, pending: true })
    expect(state.shouldPoll()).toBe(false)

    state.applyLive({ balance: 740, pending: false })
    expect(state.shouldPoll()).toBe(true)
    expect(apply.mock.calls).toEqual([[740], [740]])
  })

  it('still accepts legitimate increases from authoritative live events', () => {
    const apply = vi.fn()
    const state = createCreditBalanceState(apply)
    state.applyLive({ balance: 700, pending: true })
    state.applyLive({ balance: 760, pending: false })
    expect(apply.mock.calls).toEqual([[700], [760]])
  })
})
