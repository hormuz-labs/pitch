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
  capture: vi.fn(),
  stopCapture: vi.fn(),
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
vi.mock('../apps/api/src/render/utils/browser-capture.ts', () => ({
  startBrowserCapture: mocks.capture,
}))
vi.mock('../apps/api/src/render/utils/page-bridge.ts', () => ({
  installPageBridge: vi.fn(async () => async () => {}),
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
      exposeBinding: vi.fn(),
      on: vi.fn(),
      once: vi.fn(),
      pages: () => [{ frames: () => [{ evaluate: mocks.evaluate }] }],
    },
  })
  mocks.exec.mockResolvedValue({ stdout: '', stderr: '' })
  mocks.stopCapture.mockImplementation(async () => {
    fs.writeFileSync(path.join(base, 'recording/demo.mkv'), 'new take')
  })
  mocks.capture.mockImplementation(async () => {
    return { startTime: Date.now(), stop: mocks.stopCapture }
  })
})
afterEach(() => fs.rmSync(base, { recursive: true, force: true }))

describe('preparation and one continuous take', () => {
  it('opens without touching the old take, then records in the same browser and finalizes once', async () => {
    fs.writeFileSync(path.join(base, 'recording/demo.webm'), 'old take')
    fs.writeFileSync(path.join(base, 'recording/demo-state.json'), '{"audioClips":[]}')
    fs.writeFileSync(path.join(base, 'recording/demo-config.json'), '{"startTime":1}')
    fs.writeFileSync(path.join(base, 'recording/cursor.json'), '{"version":2}')
    const handle = await startRecording({
      userId: 'test',
      workspaceDir: base,
      streamId: 'demo-test',
      deferCapture: true,
    })
    expect(handle.recording).toBe(false)
    expect(mocks.initScript).toHaveBeenCalledTimes(1)
    expect(mocks.evaluate).toHaveBeenCalledTimes(1)
    expect(mocks.capture).not.toHaveBeenCalled()
    expect(fs.readFileSync(path.join(base, 'recording/demo.webm'), 'utf8')).toBe('old take')
    await handle.startCapture()
    await handle.startCapture()
    expect(mocks.browser).toHaveBeenCalledTimes(1)
    expect(mocks.capture).toHaveBeenCalledTimes(1)
    expect(handle.recording).toBe(true)
    expect(handle.startTime).toBeGreaterThan(0)
    expect(mocks.initScript.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.capture.mock.invocationCallOrder[0]!,
    )
    const archived = fs.readdirSync(path.join(base, 'recording/takes'))[0]
    expect(
      fs.readFileSync(path.join(base, 'recording/takes', archived, 'cursor.json'), 'utf8'),
    ).toBe('{"version":2}')
    expect(fs.readFileSync(path.join(base, 'recording/takes', archived, 'demo.webm'), 'utf8')).toBe(
      'old take',
    )
    expect(
      fs.readFileSync(path.join(base, 'recording/takes', archived, 'demo-state.json'), 'utf8'),
    ).toBe('{"audioClips":[]}')
    await handle.stop()
    await handle.stop()
    expect(handle.recording).toBe(false)
    expect(mocks.stopCapture).toHaveBeenCalledTimes(1)
    expect(mocks.close).toHaveBeenCalledTimes(1)
    expect(
      JSON.parse(fs.readFileSync(path.join(base, 'recording/capture-status.json'), 'utf8')).state,
    ).toBe('complete')
    expect(
      JSON.parse(fs.readFileSync(path.join(base, 'recording/demo-config.json'), 'utf8')).videoFile,
    ).toBe('recording/demo.mkv')
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
    expect(mocks.capture).not.toHaveBeenCalled()
    expect(mocks.stopCapture).not.toHaveBeenCalled()
    expect(mocks.exec.mock.calls.some(([command]) => /video-start|video-stop/.test(command))).toBe(
      false,
    )
    expect(fs.readFileSync(config, 'utf8')).toBe('previous config')
    expect(mocks.close).toHaveBeenCalledTimes(1)
  })

  it('does not silently record without input telemetry when installation fails', async () => {
    mocks.initScript.mockRejectedValueOnce(new Error('cursor installation failed'))
    await expect(
      startRecording({ userId: 'test', workspaceDir: base, streamId: 'demo-test' }),
    ).rejects.toThrow('cursor installation failed')
    expect(mocks.capture).not.toHaveBeenCalled()
    expect(mocks.close).toHaveBeenCalledTimes(1)
  })

  it('persists a failed stop so it cannot be mistaken for an idle successful recording', async () => {
    mocks.stopCapture.mockRejectedValueOnce(new Error('capture storage failed'))
    const handle = await startRecording({
      userId: 'test',
      workspaceDir: base,
      streamId: 'demo-test',
    })
    await expect(handle.stop()).rejects.toThrow('capture storage failed')
    expect(
      JSON.parse(fs.readFileSync(path.join(base, 'recording/capture-status.json'), 'utf8')),
    ).toMatchObject({ state: 'failed', error: 'capture storage failed' })
  })
})
