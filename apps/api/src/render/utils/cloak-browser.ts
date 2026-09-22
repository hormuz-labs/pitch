import { createHash } from 'node:crypto'
import { createServer } from 'node:net'
import { createLogger } from '@saas/shared'
import { launchPersistentContext } from 'cloakbrowser'
import type { BrowserContext, Page } from 'playwright'
import { startVncDisplay } from '../../services/browser-vnc.js'

const logger = createLogger('studio:cloak-browser')
const START_TIMEOUT_MS = Number(process.env.CLOAK_BROWSER_START_TIMEOUT_MS || 60_000)
const OP_TIMEOUT_MS = Number(process.env.CLOAK_BROWSER_OPERATION_TIMEOUT_MS || 30_000)
const MAX_BROWSERS = Number(
  process.env.CLOAK_BROWSER_CONCURRENCY || (process.env.CLOAKBROWSER_LICENSE_KEY ? 4 : 1),
)
let activeBrowsers = 0
const browserWaiters: Array<() => void> = []

async function acquireBrowserSlot(): Promise<() => void> {
  if (!Number.isInteger(MAX_BROWSERS) || MAX_BROWSERS < 1)
    throw new Error('CLOAK_BROWSER_CONCURRENCY must be a positive integer')
  if (activeBrowsers >= MAX_BROWSERS)
    await new Promise<void>(resolve => browserWaiters.push(resolve))
  activeBrowsers++
  let released = false
  return () => {
    if (released) return
    released = true
    activeBrowsers--
    browserWaiters.shift()?.()
  }
}

export interface CloakBrowserHandle {
  streamId: string
  cdpUrl: string
  context: BrowserContext
  page: Page
  vncPort: number
  close: () => Promise<void>
  onExit: (handler: (error?: Error) => void) => void
}

export function fingerprintSeed(identity: string): number {
  return (
    10_000 +
    (Number.parseInt(createHash('sha256').update(identity).digest('hex').slice(0, 8), 16) % 90_000)
  )
}

export async function withTimeout<T>(
  label: string,
  promise: Promise<T>,
  ms = OP_TIMEOUT_MS,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

async function freePort(): Promise<number> {
  const server = createServer()
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  const port = typeof address === 'object' && address ? address.port : 0
  await new Promise<void>(resolve => server.close(() => resolve()))
  if (!port) throw new Error('Could not allocate a CDP port')
  return port
}

export async function startCloakBrowser(options: {
  streamId: string
  profileDir: string
  storageStatePath?: string
  fingerprintIdentity?: string
  signal?: AbortSignal
}): Promise<CloakBrowserHandle> {
  const release = await acquireBrowserSlot()
  let port: number
  let display: Awaited<ReturnType<typeof startVncDisplay>>
  try {
    port = await freePort()
    display = await startVncDisplay(options.streamId, options.signal)
  } catch (error) {
    release()
    throw error
  }
  const abortDisplay = () => void display.close()
  options.signal?.addEventListener('abort', abortDisplay, { once: true })
  let context: BrowserContext
  try {
    context = await launchPersistentContext({
      userDataDir: options.profileDir,
      headless: false,
      viewport: { width: 1920, height: 1080 },
      args: [
        '--window-position=0,0',
        `--remote-debugging-port=${port}`,
        '--remote-debugging-address=127.0.0.1',
        `--fingerprint=${fingerprintSeed(options.fingerprintIdentity ?? options.streamId)}`,
        '--fingerprint-storage-quota=5000',
      ],
      launchOptions: {
        timeout: START_TIMEOUT_MS,
        env: { ...process.env, DISPLAY: display.display },
      },
    })
    if (options.storageStatePath)
      await withTimeout(
        'restoring browser state',
        context.setStorageState(options.storageStatePath),
      )
  } catch (error) {
    options.signal?.removeEventListener('abort', abortDisplay)
    await display.close()
    release()
    throw error
  }
  let page: Page
  try {
    page = context.pages()[0] ?? (await withTimeout('opening browser page', context.newPage()))
  } catch (error) {
    options.signal?.removeEventListener('abort', abortDisplay)
    await context.close().catch(() => {})
    await display.close()
    release()
    throw error
  }
  let expectedClose = false
  let finalized = false
  let notified = false
  const exitHandlers = new Set<(error?: Error) => void>()
  const notifyExit = (error?: Error) => {
    if (notified) return
    notified = true
    for (const handler of exitHandlers) handler(error)
  }
  const finalize = async () => {
    if (finalized) return
    finalized = true
    options.signal?.removeEventListener('abort', abortDisplay)
    await display?.close()
    release()
  }
  display.onFailure(error => {
    notifyExit(error)
    void context.close().catch(() => {})
  })
  context.once('close', () => {
    void finalize()
    if (!expectedClose) notifyExit(new Error('CloakBrowser closed unexpectedly'))
  })
  return {
    streamId: options.streamId,
    cdpUrl: `http://127.0.0.1:${port}`,
    context,
    page,
    vncPort: display.port,
    onExit: handler => exitHandlers.add(handler),
    close: async () => {
      if (expectedClose || finalized) return
      expectedClose = true
      await withTimeout('CloakBrowser shutdown', context.close(), 15_000).catch(err =>
        logger.warn({ err, streamId: options.streamId }, 'CloakBrowser did not close cleanly'),
      )
      await finalize()
    },
  }
}
