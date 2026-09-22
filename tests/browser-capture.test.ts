import { EventEmitter } from 'node:events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { startBrowserCapture } from '../apps/api/src/render/utils/browser-capture.ts'

const encoder = vi.hoisted(() => ({ write: vi.fn(), stop: vi.fn(), abort: vi.fn() }))
vi.mock('../apps/api/src/render/utils/capture-encoder.ts', () => ({
  CaptureEncoder: class {
    write = encoder.write
    stop = encoder.stop
    abort = encoder.abort
  },
}))

beforeEach(() => {
  vi.resetAllMocks()
  encoder.write.mockResolvedValue(undefined)
  encoder.stop.mockResolvedValue(undefined)
})
afterEach(() => vi.restoreAllMocks())

function browser() {
  const context = new EventEmitter() as any
  let visible: (source: any, visible: boolean) => void
  context.exposeBinding = async (_name: string, fn: typeof visible) => {
    visible = fn
  }
  context.addInitScript = vi.fn(async () => {})
  const pages: any[] = []
  context.pages = () => pages
  const page = (name: string, foreground: boolean) => {
    let options: any
    const p: any = {
      isClosed: () => false,
      setViewportSize: vi.fn(async () => {}),
      evaluate: async () => visible({ page: p }, foreground),
      screencast: {
        start: vi.fn(async (opts: any) => {
          options = opts
          await opts.onFrame({ data: Buffer.from(name) })
        }),
        stop: vi.fn(async () => {}),
      },
      frame: () => options.onFrame({ data: Buffer.from(name) }),
      foreground: () => visible({ page: p }, true),
    }
    pages.push(p)
    return p
  }
  return { context, page }
}

describe('visible-tab capture lifecycle', () => {
  it('requests full-size frames, follows tab switches and finalizes exactly once', async () => {
    let now = 1000
    vi.spyOn(Date, 'now').mockImplementation(() => now)
    const b = browser()
    const first = b.page('first', true)
    const second = b.page('second', false)
    const recorder = { start: vi.fn(), select: vi.fn(), stop: vi.fn() }
    const capture = await startBrowserCapture(b.context, 'capture.webm', undefined, {
      recorder: recorder as any,
      file: 'cursor.json',
    })
    expect(capture.startTime).toBe(1000)
    expect(recorder.start).toHaveBeenCalledExactlyOnceWith('cursor.json', 1000)
    expect(first.screencast.start).toHaveBeenCalledWith(
      expect.objectContaining({
        size: { width: 1920, height: 1080 },
        quality: 100,
      }),
    )
    expect(encoder.write).toHaveBeenCalledTimes(1)
    now = 2000
    second.foreground()
    await first.frame()
    await second.frame()
    expect(encoder.write).toHaveBeenLastCalledWith(Buffer.from('second'), 1000)
    expect(encoder.write).toHaveBeenCalledTimes(2)
    now = 4000
    await capture.stop()
    await capture.stop()
    expect(encoder.stop).toHaveBeenCalledExactlyOnceWith(3000)
    expect(recorder.stop).toHaveBeenCalledExactlyOnceWith(4000)
    expect(recorder.select).toHaveBeenLastCalledWith(second)
    expect(first.screencast.stop).toHaveBeenCalledTimes(1)
    expect(second.screencast.stop).toHaveBeenCalledTimes(1)
    expect(b.context.listenerCount('page')).toBe(0)
    expect(b.context.listenerCount('close')).toBe(0)
  })

  it('surfaces encoding failures and releases capture resources during startup', async () => {
    const b = browser()
    const page = b.page('first', true)
    encoder.write.mockRejectedValueOnce(new Error('encoder failed'))
    await expect(startBrowserCapture(b.context, 'capture.webm')).rejects.toThrow('encoder failed')
    expect(encoder.abort).toHaveBeenCalled()
    expect(page.screencast.stop).toHaveBeenCalled()
  })

  it('aborts the encoder when the browser closes unexpectedly', async () => {
    const b = browser()
    b.context.on('close', () => {})
    b.page('first', true)
    const capture = await startBrowserCapture(b.context, 'capture.webm')
    b.context.emit('close')
    await expect(capture.stop()).rejects.toThrow('interrupted')
    expect(encoder.abort).toHaveBeenCalled()
    expect(encoder.stop).not.toHaveBeenCalled()
  })
})
