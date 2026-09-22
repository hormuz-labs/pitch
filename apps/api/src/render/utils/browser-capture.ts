import { randomUUID } from 'node:crypto'
import type { BrowserContext, Page } from 'playwright'
import { CaptureEncoder } from './capture-encoder.js'
import { withTimeout } from './cloak-browser.js'
import type { CursorRecording } from './recording-cursor.js'

export interface BrowserCapture {
  startTime: number
  stop: () => Promise<void>
}

/** Record the visible tab, including switches/popups, into one full-HD master. */
export async function startBrowserCapture(
  context: BrowserContext,
  output: string,
  signal?: AbortSignal,
  cursor?: { recorder: CursorRecording; file: string },
): Promise<BrowserCapture> {
  const encoder = new CaptureEncoder(output)
  const binding = `__pitchCaptureVisibility_${randomUUID().replaceAll('-', '')}`
  const pages = new Set<Page>()
  const attaching = new Set<Promise<void>>()
  let active: Page | null = null
  let startTime = 0
  let failure: unknown
  let stopping = false
  let ready!: () => void
  const firstFrame = new Promise<void>(resolve => {
    ready = resolve
  })
  const abort = () => {
    failure = new Error('Browser capture was interrupted')
    stopping = true
    encoder.abort()
    ready()
  }
  signal?.addEventListener('abort', abort, { once: true })
  context.on('close', abort)
  const visibility = `(() => {
    if (window !== window.top) return;
    const report = () => window[${JSON.stringify(binding)}](document.visibilityState === 'visible').catch(() => {});
    document.addEventListener('visibilitychange', report);
    return report();
  })();`
  const attach = async (page: Page) => {
    if (pages.has(page)) return
    pages.add(page)
    // Keep the recording client's viewport contract across full navigations and
    // popups. A resize issued by the separate input client can be reset on reload.
    await page.setViewportSize({ width: 1920, height: 1080 })
    await page.evaluate(visibility)
    await page.screencast.start({
      size: { width: 1920, height: 1080 },
      quality: 100,
      onFrame: async ({ data }) => {
        if (stopping || active !== page || failure) return
        try {
          const now = Date.now()
          if (!startTime) {
            startTime = now
            cursor?.recorder.start(cursor.file, startTime)
          }
          await encoder.write(data, now - startTime)
          ready()
        } catch (error) {
          failure = error
          ready()
        }
      },
    })
  }
  const onPage = (page: Page) => {
    const pending = attach(page).catch(error => {
      if (!page.isClosed()) {
        failure = error
        ready()
      }
    })
    attaching.add(pending)
    void pending.finally(() => attaching.delete(pending))
  }
  const detach = async () => {
    signal?.removeEventListener('abort', abort)
    context.off('close', abort)
    context.off('page', onPage)
    await Promise.all(attaching)
    await Promise.all([...pages].map(page => page.screencast.stop().catch(() => {})))
  }
  try {
    if (signal?.aborted) throw new Error('Browser capture was cancelled before starting')
    await context.exposeBinding(binding, ({ page }, visible) => {
      if (stopping) return
      if (visible) active = page
      else if (active === page) active = null
      cursor?.recorder.select(active)
    })
    await context.addInitScript({ content: visibility })
    context.on('page', onPage)
    await Promise.all(context.pages().map(attach))
    await withTimeout('first full-resolution capture frame', firstFrame, 15_000)
    if (failure) throw failure
  } catch (error) {
    stopping = true
    encoder.abort()
    await withTimeout('cleaning up failed capture', detach(), 15_000).catch(() => {})
    throw error
  }
  let stopped: Promise<void> | null = null
  return {
    startTime,
    stop: () => {
      if (!stopped)
        stopped = (async () => {
          const duration = Date.now() - startTime
          stopping = true
          try {
            await withTimeout('stopping browser capture', detach(), 15_000)
            if (failure) throw failure
            await withTimeout('finishing capture encoder', encoder.stop(duration), 60_000)
            cursor?.recorder.stop(startTime + duration)
          } catch (error) {
            encoder.abort()
            throw error
          }
        })()
      return stopped
    },
  }
}
