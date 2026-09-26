import { afterEach, describe, expect, it } from 'vitest'
import {
  abortHostActions,
  callHostAction,
  peekComputeSeconds,
  peekProviderUsd,
  recordProviderUsd,
  registerHostAction,
  setHostActionGuard,
  takeComputeSeconds,
  takeProviderUsd,
} from '../apps/api/src/studio/host-actions.js'
import { workspaceFor } from '../apps/api/src/studio/paths.js'

const ws = workspaceFor('studio', 'user_test', 'host-action-test')

afterEach(() => {
  setHostActionGuard(null)
  takeComputeSeconds(ws.internal)
})

describe('host action cancellation', () => {
  it('aborts active work and includes its in-flight wall time', async () => {
    registerHostAction('test_wait', async (_ws, _params, ctx) => {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, 5_000)
        ctx.signal?.addEventListener(
          'abort',
          () => {
            clearTimeout(timer)
            reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))
          },
          { once: true },
        )
      })
      return 'finished'
    })

    const running = callHostAction(ws.dir, 'test_wait', {})
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(peekComputeSeconds(ws.internal)).toBeGreaterThan(0)
    abortHostActions(ws.internal)
    await expect(running).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('runs the affordability guard before starting an action', async () => {
    let ran = false
    setHostActionGuard(async () => {
      throw new Error('Insufficient credits')
    })
    registerHostAction('test_guarded', async () => {
      ran = true
      return 'finished'
    })

    await expect(callHostAction(ws.dir, 'test_guarded', {})).rejects.toThrow('Insufficient credits')
    expect(ran).toBe(false)
  })

  it('can abort while the affordability guard is waiting', async () => {
    setHostActionGuard(() => new Promise<void>(() => {}))
    registerHostAction('test_stalled_guard', async () => 'finished')

    const controller = new AbortController()
    const running = callHostAction(ws.dir, 'test_stalled_guard', {}, { signal: controller.signal })
    await new Promise(resolve => setTimeout(resolve, 20))
    controller.abort()

    await expect(running).rejects.toMatchObject({ name: 'AbortError' })
    expect(peekComputeSeconds(ws.internal)).toBeGreaterThan(0)
  })
})

describe('provider spend meter', () => {
  it('accumulates what actions paid a provider and drains it once', () => {
    takeProviderUsd(ws.internal)
    recordProviderUsd(ws.internal, 0.8)
    recordProviderUsd(ws.internal, 1.2)
    expect(peekProviderUsd(ws.internal)).toBeCloseTo(2)
    expect(takeProviderUsd(ws.internal)).toBeCloseTo(2)
    expect(takeProviderUsd(ws.internal)).toBe(0)
  })

  it('ignores zero, negative and non-finite amounts', () => {
    recordProviderUsd(ws.internal, 0)
    recordProviderUsd(ws.internal, -3)
    recordProviderUsd(ws.internal, Number.NaN)
    expect(takeProviderUsd(ws.internal)).toBe(0)
  })

  it('keeps workspaces apart', () => {
    const other = workspaceFor('studio', 'user_test', 'host-action-other')
    recordProviderUsd(other.internal, 5)
    expect(peekProviderUsd(ws.internal)).toBe(0)
    expect(takeProviderUsd(other.internal)).toBe(5)
  })
})
