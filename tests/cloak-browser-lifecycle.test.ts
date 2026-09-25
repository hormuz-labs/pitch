import { EventEmitter } from 'node:events'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { startCloakBrowser } from '../apps/api/src/render/utils/cloak-browser.ts'

const mocks = vi.hoisted(() => ({ launch: vi.fn(), display: vi.fn() }))
vi.mock('cloakbrowser', () => ({ launchPersistentContext: mocks.launch }))
vi.mock('../apps/api/src/services/browser-vnc.ts', () => ({
  freePort: async () => 12345,
  startVncDisplay: mocks.display,
}))
beforeEach(() => vi.clearAllMocks())

describe('worker-owned browser lifetime', () => {
  it('leaves shutdown signals to the worker drain and closes the browser and display explicitly', async () => {
    const context = new EventEmitter() as any
    context.pages = () => [{}]
    context.close = vi.fn(async () => {
      context.emit('close')
    })
    const display = { display: ':99', port: 5901, close: vi.fn(async () => {}), onFailure: vi.fn() }
    mocks.launch.mockResolvedValue(context)
    mocks.display.mockResolvedValue(display)
    const browser = await startCloakBrowser({
      streamId: 'test-drain',
      profileDir: '/unused-test-profile',
    })
    // These options are forwarded to Playwright, whose defaults kill Chromium
    // immediately on SIGTERM even while our server is waiting for a live turn.
    expect(mocks.launch.mock.calls[0]![0].launchOptions).toMatchObject({
      handleSIGTERM: false,
      handleSIGINT: false,
      handleSIGHUP: false,
    })
    expect(context.close).not.toHaveBeenCalled()
    await browser.close()
    await browser.close()
    expect(context.close).toHaveBeenCalledTimes(1)
    expect(display.close).toHaveBeenCalledTimes(1)
  })
})
