import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { runInNewContext } from 'node:vm'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  CursorRecording,
  RECORDING_CURSOR_SCRIPT,
} from '../apps/api/src/render/utils/recording-cursor.ts'

const roots: string[] = []
afterEach(() => {
  vi.restoreAllMocks()
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('recorded cursor telemetry', () => {
  it('uses the first-frame clock, preserves press/release and page changes, and marks incomplete captures', () => {
    let now = 900
    vi.spyOn(Date, 'now').mockImplementation(() => now)
    const root = mkdtempSync(path.join(tmpdir(), 'cursor-'))
    roots.push(root)
    const file = path.join(root, 'cursor.json')
    const recorder = new CursorRecording()
    const first = {} as any
    const second = {} as any
    recorder.select(first)
    recorder.receive(first, { kind: 'move', time: now, x: 120, y: 80, buttons: 0, shape: 'arrow' })
    now = 1000
    recorder.start(file, now)
    expect(JSON.parse(readFileSync(file, 'utf8')).complete).toBe(false)
    now = 1200
    recorder.receive(first, { kind: 'down', time: 1190, x: 200, y: 100, buttons: 1, shape: 'hand' })
    recorder.receive(first, { kind: 'up', time: 1195, x: 200, y: 100, buttons: 0, shape: 'hand' })
    now = 1400
    recorder.select(second)
    // Background-page input must not move the visible cursor.
    recorder.receive(first, { kind: 'move', time: now, x: 999, y: 999, shape: 'arrow', buttons: 0 })
    const restored = recorder.receive(second, { kind: 'document', time: now })
    expect(restored).toMatchObject({ x: 200, y: 100 })
    recorder.receive(second, {
      kind: 'scroll',
      time: now,
      x: 200,
      y: 100,
      buttons: 0,
      shape: 'text',
    })
    recorder.stop(2000)
    const trace = JSON.parse(readFileSync(file, 'utf8'))
    expect(trace).toMatchObject({
      version: 2,
      complete: true,
      startTime: 1000,
      duration: 1,
      width: 1920,
      height: 1080,
    })
    expect(trace.events[0]).toMatchObject({ time: 0, x: 120, y: 80 })
    expect(trace.events.find((e: any) => e.kind === 'down')).toMatchObject({
      time: 0.19,
      buttons: 1,
    })
    expect(trace.events.find((e: any) => e.kind === 'up')).toMatchObject({
      time: 0.195,
      buttons: 0,
    })
    expect(trace.events.at(-1)).toMatchObject({ kind: 'scroll', page: 1, shape: 'text' })
    expect(trace.events.every((e: any) => e.x !== 999)).toBe(true)
  })

  it('does not report a completed recording after a telemetry clock failure', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1000)
    const root = mkdtempSync(path.join(tmpdir(), 'cursor-'))
    roots.push(root)
    const file = path.join(root, 'cursor.json')
    const recorder = new CursorRecording()
    const page = {} as any
    recorder.select(page)
    recorder.start(file, 1000)
    recorder.receive(page, { kind: 'move', time: 50000 })
    expect(() => recorder.stop(2000)).toThrow('clock')
    expect(JSON.parse(readFileSync(file, 'utf8')).complete).toBe(false)
  })

  it('observes real input without DOM writes and maps nested-frame coordinates', async () => {
    const listeners = new Map<string, (event: any) => void>()
    const report = vi.fn(async () => ({ x: 0, y: 0, buttons: 0, shape: 'hidden' }))
    const child = {}
    class Element {}
    const document = {
      visibilityState: 'visible',
      addEventListener: (type: string, callback: any) => listeners.set(type, callback),
      elementFromPoint: () => new Element(),
      querySelectorAll: () => [
        {
          contentWindow: child,
          clientLeft: 4,
          clientTop: 4,
          offsetWidth: 400,
          offsetHeight: 200,
          getBoundingClientRect: () => ({ left: 100, top: 200, width: 600, height: 300 }),
        },
      ],
      createElement: () => {
        throw new Error('Cursor telemetry must not modify the page')
      },
    }
    const window: any = {
      __pitchCursorTelemetryV2: report,
      addEventListener: (type: string, callback: any) => listeners.set(type, callback),
    }
    window.top = window
    await runInNewContext(RECORDING_CURSOR_SCRIPT, {
      window,
      document,
      Element,
      Date,
      innerWidth: 1920,
      innerHeight: 1080,
      getComputedStyle: () => ({ cursor: 'pointer' }),
    })
    expect(window.__pitchPointerPosition).toBeUndefined()
    listeners.get('pointerdown')!({
      pointerType: 'mouse',
      clientX: 100,
      clientY: 90,
      buttons: 1,
      target: new Element(),
    })
    expect(report).toHaveBeenLastCalledWith(
      expect.objectContaining({ kind: 'down', x: 100, y: 90, shape: 'hand', buttons: 1 }),
    )
    listeners.get('message')!({
      source: child,
      data: {
        channel: 'pitch-cursor-telemetry-v2',
        kind: 'move',
        time: Date.now(),
        x: 20,
        y: 30,
        shape: 'arrow',
        buttons: 0,
      },
    })
    expect(report).toHaveBeenLastCalledWith(expect.objectContaining({ x: 136, y: 251 }))
    const count = report.mock.calls.length
    listeners.get('pointerout')!({ relatedTarget: null, clientX: 136, clientY: 251 })
    expect(report).toHaveBeenCalledTimes(count) // Navigation isn't a viewport exit.
    listeners.get('keydown')!({ key: 'secret' })
    expect(report).toHaveBeenLastCalledWith({ kind: 'key', time: expect.any(Number) })
  })
})
