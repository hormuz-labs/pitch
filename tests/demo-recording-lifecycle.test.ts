import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { startRecording } from '../apps/api/src/render/recording.ts'

const mocks = vi.hoisted(() => ({
  exec: vi.fn(),
  browser: vi.fn(),
  close: vi.fn(),
  profile: vi.fn(),
  initScript: vi.fn(),
  evaluate: vi.fn(),
}))
vi.mock('@saas/db', () => ({
  getOrCreateBrowserProfile: mocks.profile,
  recordLoggedInOrigins: vi.fn(),
}))
vi.mock('@saas/storage', () => ({
  downloadStorageState: vi.fn(async () => false),
  uploadStorageState: vi.fn(async () => 'key'),
}))
vi.mock('../apps/api/src/render/media.ts', () => ({
  execAsync: mocks.exec,
  getMediaDurationSec: vi.fn(async () => 60),
}))
vi.mock('../apps/api/src/render/utils/cloak-browser.ts', () => ({
  startCloakBrowser: mocks.browser,
  withTimeout: (_name: string, promise: Promise<unknown>) => promise,
}))

let base: string
beforeEach(() => {
  vi.clearAllMocks()
  base = fs.mkdtempSync(path.join(os.tmpdir(), 'demo-lifecycle-'))
  fs.mkdirSync(path.join(base, 'recording'))
  mocks.profile.mockResolvedValue({ profileDir: path.join(base, 'profile') })
  mocks.close.mockResolvedValue(undefined)
  mocks.browser.mockResolvedValue({
    streamId: 'demo-test',
    cdpUrl: 'http://127.0.0.1:12345',
    close: mocks.close,
    context: {
      storageState: async () => ({ cookies: [], origins: [] }),
      addInitScript: mocks.initScript,
      pages: () => [{ frames: () => [{ evaluate: mocks.evaluate }] }],
    },
  })
  mocks.exec.mockImplementation(async (command: string) => {
    if (command.includes('video-stop'))
      fs.writeFileSync(path.join(base, 'recording/demo.webm'), 'new take')
    return { stdout: '', stderr: '' }
  })
})
afterEach(() => fs.rmSync(base, { recursive: true, force: true }))

describe('preparation and one continuous take', () => {
  it('opens without touching the old take, then records in the same browser and finalizes once', async () => {
    fs.writeFileSync(path.join(base, 'recording/demo.webm'), 'old take')
    fs.writeFileSync(path.join(base, 'recording/demo-state.json'), '{"audioClips":[]}')
    fs.writeFileSync(path.join(base, 'recording/demo-config.json'), '{"startTime":1}')
    const handle = await startRecording({
      userId: 'test',
      workspaceDir: base,
      streamId: 'demo-test',
      deferCapture: true,
    })
    expect(handle.recording).toBe(false)
    expect(mocks.initScript).toHaveBeenCalledTimes(1)
    expect(mocks.evaluate).toHaveBeenCalledTimes(1)
    expect(mocks.exec.mock.calls.some(([command]) => command.includes('video-start'))).toBe(false)
    expect(fs.readFileSync(path.join(base, 'recording/demo.webm'), 'utf8')).toBe('old take')
    await handle.startCapture()
    await handle.startCapture()
    expect(mocks.browser).toHaveBeenCalledTimes(1)
    expect(
      mocks.exec.mock.calls.filter(([command]) => command.includes('video-start')),
    ).toHaveLength(1)
    expect(handle.recording).toBe(true)
    expect(handle.startTime).toBeGreaterThan(0)
    expect(mocks.initScript.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.exec.mock.invocationCallOrder[
        mocks.exec.mock.calls.findIndex(([command]) => command.includes('video-start'))
      ]!,
    )
    const archived = fs.readdirSync(path.join(base, 'recording/takes'))[0]
    expect(fs.readFileSync(path.join(base, 'recording/takes', archived, 'demo.webm'), 'utf8')).toBe(
      'old take',
    )
    expect(
      fs.readFileSync(path.join(base, 'recording/takes', archived, 'demo-state.json'), 'utf8'),
    ).toBe('{"audioClips":[]}')
    await handle.stop()
    await handle.stop()
    expect(handle.recording).toBe(false)
    expect(
      mocks.exec.mock.calls.filter(([command]) => command.includes('video-stop')),
    ).toHaveLength(1)
    expect(mocks.close).toHaveBeenCalledTimes(1)
  })

  it('closing preparation never starts or stops a capture or changes its config', async () => {
    const config = path.join(base, 'recording/demo-config.json')
    fs.writeFileSync(config, 'previous config')
    const handle = await startRecording({
      userId: 'test',
      workspaceDir: base,
      streamId: 'demo-test',
      deferCapture: true,
    })
    await handle.stop()
    expect(mocks.exec.mock.calls.some(([command]) => /video-start|video-stop/.test(command))).toBe(
      false,
    )
    expect(fs.readFileSync(config, 'utf8')).toBe('previous config')
    expect(mocks.close).toHaveBeenCalledTimes(1)
  })

  it('does not silently record a cursorless take when pointer installation fails', async () => {
    mocks.initScript.mockRejectedValueOnce(new Error('cursor installation failed'))
    await expect(
      startRecording({ userId: 'test', workspaceDir: base, streamId: 'demo-test' }),
    ).rejects.toThrow('cursor installation failed')
    expect(mocks.exec.mock.calls.some(([command]) => command.includes('video-start'))).toBe(false)
    expect(mocks.close).toHaveBeenCalledTimes(1)
  })
})
