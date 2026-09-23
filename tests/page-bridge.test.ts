import { EventEmitter } from 'node:events'
import { createContext, runInContext } from 'node:vm'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { installPageBridge } from '../apps/api/src/render/utils/page-bridge.ts'

/** Emulate the CDP boundary, including new document realms. Unlike a mocked
 * exposeBinding, this exercises the injected transport and its actual replies. */
function browser() {
  let current = 1
  const worlds = new Map<number, any>()
  const sessions: any[] = []
  const createWorld = () => {
    const window: any = { dispatchEvent: vi.fn() }
    window.top = window
    const world = createContext({
      window,
      Map,
      Promise,
      Error,
      JSON,
      setTimeout,
      clearTimeout,
      Event: class {
        constructor(public type: string) {}
      },
    })
    worlds.set(current, world)
    for (const session of sessions)
      for (const name of session.bindings) installNative(session, name)
    return world
  }
  const installNative = (session: any, name: string) => {
    const id = current
    worlds.get(id).window[name] = (payload: string) =>
      session.emit('Runtime.bindingCalled', { name, payload, executionContextId: id })
  }
  const page = new EventEmitter() as any
  page.context = () => ({
    newCDPSession: async () => {
      const session = new EventEmitter() as any
      session.bindings = new Set<string>()
      session.scripts = new Map<string, string>()
      session.pageEnabled = false
      session.detach = vi.fn(async () => {})
      session.send = vi.fn(async (method: string, args: any = {}) => {
        if (method === 'Page.enable') session.pageEnabled = true
        if (method === 'Runtime.addBinding') {
          session.bindings.add(args.name)
          installNative(session, args.name)
        }
        if (method === 'Runtime.removeBinding') session.bindings.delete(args.name)
        if (method === 'Page.addScriptToEvaluateOnNewDocument') {
          session.scripts.set('script', args.source)
          return { identifier: 'script' }
        }
        if (method === 'Page.removeScriptToEvaluateOnNewDocument')
          session.scripts.delete(args.identifier)
        if (method === 'Runtime.evaluate') {
          const world = worlds.get(args.contextId ?? current)
          if (!world) throw new Error('Execution context was destroyed')
          const result = runInContext(args.expression, world)
          return { result: { value: args.awaitPromise ? await result : result } }
        }
        return {}
      })
      sessions.push(session)
      return session
    },
  })
  createWorld()
  return {
    page,
    sessions,
    evaluate: (source: string) => runInContext(source, worlds.get(current)),
    navigate: async () => {
      current++
      const world = createWorld()
      for (const session of sessions)
        if (session.pageEnabled)
          for (const source of session.scripts.values()) await runInContext(source, world)
    },
  }
}

afterEach(() => vi.restoreAllMocks())
describe('private capture CDP bridge', () => {
  it('keeps independent transports working when another Playwright client replaces its controller and after navigation', async () => {
    const b = browser()
    const visibility = vi.fn((value: any) => `visible:${value}`)
    const pointer = vi.fn((value: any) => ({ x: value.x }))
    const closeVisibility = await installPageBridge(
      b.page,
      'captureVisible',
      'window.captureVisible(true);',
      visibility,
    )
    const closePointer = await installPageBridge(
      b.page,
      'capturePointer',
      'window.capturePointer({x: 12});',
      pointer,
    )
    b.evaluate(
      'window.__playwright__binding__controller__ = {callBinding(){throw new Error("other client")}}',
    )
    expect(await b.evaluate('window.captureVisible(false)')).toBe('visible:false')
    expect(await b.evaluate('window.capturePointer({x: 45})')).toEqual({ x: 45 })
    await b.navigate()
    expect(await b.evaluate('window.capturePointer({x: 90})')).toEqual({ x: 90 })
    expect(b.sessions[1].send).toHaveBeenCalledWith(
      'Runtime.evaluate',
      expect.objectContaining({ contextId: 2 }),
    )
    await closeVisibility()
    await closeVisibility()
    expect(b.sessions[0].detach).toHaveBeenCalledTimes(1)
    expect(await b.evaluate('window.captureVisible(true)')).toBeNull()
    expect(await b.evaluate('window.capturePointer({x: 120})')).toEqual({ x: 120 })
    await closePointer()
  })

  it('propagates host failures through the transport and cleans up failed initialization', async () => {
    const b = browser()
    await expect(
      installPageBridge(b.page, 'broken', 'window.broken(true);', () => {
        throw new Error('host failed')
      }),
    ).rejects.toThrow('host failed')
    expect(b.sessions[0].detach).toHaveBeenCalledTimes(1)
    expect(b.sessions[0].scripts.size).toBe(0)
    expect(b.sessions[0].listenerCount('Runtime.bindingCalled')).toBe(0)
  })
})
