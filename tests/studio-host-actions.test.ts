import { afterEach, describe, expect, it } from 'vitest'
import {
  abortHostActions,
  callHostAction,
  peekComputeSeconds,
  registerHostAction,
  setHostActionGuard,
  takeComputeSeconds,
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
})
