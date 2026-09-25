import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import demoCommands from '../.pi/cli/demo.ts'
import { waitForNarration } from '../.pi/lib/demo-timing.ts'
import { hostAction } from '../.pi/lib/studio-host.ts'
import { collectCommands } from '../.pi/lib/testing.ts'

vi.mock('../.pi/lib/studio-host.ts', () => ({ hostAction: vi.fn() }))
vi.mock('../.pi/lib/audio-config.ts', () => ({
  projectAudioConfig: () => ({ tts: { provider: 'gemini' } }),
}))

const tools = collectCommands(demoCommands)
const ok = JSON.stringify({ text: 'done', url: 'https://example.com/' })
/** The browser ops the commands asked the host to run. */
const browserOps = () =>
  vi
    .mocked(hostAction)
    .mock.calls.filter(([, name, params]) => name === 'demo_browser' && params.kind === 'run')
    .map(([, , params]) => params.op as any)
let base: string
const state = () =>
  JSON.parse(fs.readFileSync(path.join(base, 'recording/demo-state.json'), 'utf8'))

beforeEach(() => {
  vi.clearAllMocks()
  base = fs.mkdtempSync(path.join(os.tmpdir(), 'demo-narration-'))
  fs.mkdirSync(path.join(base, 'recording'))
  fs.writeFileSync(
    path.join(base, 'recording/demo-config.json'),
    JSON.stringify({ startTime: 1000 }),
  )
  vi.stubEnv('GEMINI_TTS_API_KEY_2', 'test')
  vi.mocked(hostAction).mockResolvedValue(ok)
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  fs.rmSync(base, { recursive: true, force: true })
})

function tts(seconds: number, generated?: () => void) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      generated?.()
      return {
        ok: true,
        json: async () => ({
          inlineData: {
            mimeType: 'audio/pcm;rate=24000',
            data: Buffer.alloc(seconds * 24000 * 2).toString('base64'),
          },
        }),
      }
    }),
  )
}

describe('continuous narration and browser actions', () => {
  it('retries a temporary provider error once with identical text and schedules just one line', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce({ status: 429, headers: { get: () => '0' } })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          inlineData: {
            mimeType: 'audio/pcm;rate=24000',
            data: Buffer.alloc(24000).toString('base64'),
          },
        }),
      })
    vi.stubGlobal('fetch', fetch)
    await tools.narrate.run({ text: 'Open the report.', action: { command: 'press Enter' } }, base)
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(fetch.mock.calls[0]![1].body).toBe(fetch.mock.calls[1]![1].body)
    expect(state().audioClips).toHaveLength(1)
    expect(state().audioClips[0].text).toBe('Open the report.')
    expect(browserOps().filter(op => op.op === 'press' && op.key === 'Enter')).toHaveLength(1)
  })

  it('explicitly requests audio and finds it after a non-audio response part', async () => {
    const parts = [
      { text: 'Speech output' },
      {
        inlineData: {
          mimeType: 'audio/pcm;rate=24000',
          data: Buffer.alloc(24000).toString('base64'),
        },
      },
    ]
    const fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ candidates: [{ content: { parts } }] }),
    }))
    vi.stubGlobal('fetch', fetch)
    await tools.narrate.run({ text: 'Keep the supplied narration.' }, base)
    expect(
      JSON.parse((fetch.mock.calls[0] as any)[1].body).generationConfig.responseModalities,
    ).toEqual(['AUDIO'])
    expect(state().audioClips[0].text).toBe('Keep the supplied narration.')
  })

  it('reports provider finish reasons without scheduling absent audio or its action', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          candidates: [{ finishReason: 'OTHER', content: { parts: [{ text: 'no audio' }] } }],
        }),
      })),
    )
    await expect(
      tools.narrate.run({ text: 'Open it.', action: { command: 'press Enter' } }, base),
    ).rejects.toThrow(/reason: OTHER; parts: text/)
    expect(state().audioClips).toHaveLength(0)
    expect(browserOps()).toHaveLength(0)
  })

  it('records a click once the pointer has travelled and pressed', async () => {
    let now = 2000
    vi.spyOn(Date, 'now').mockImplementation(() => now)
    const box = { x: 10, y: 10, w: 40, h: 20, cx: 30, cy: 20, ax: 30, ay: 20, hand: true }
    vi.mocked(hostAction).mockImplementation(async () => {
      now += 800 // the glide and the click happen inside the host step
      return JSON.stringify({ text: 'click e12 done.', box, url: 'https://example.com/' })
    })
    expect(await tools.browser.run({ command: 'click e12' }, base)).toContain('click e12 done')
    expect(browserOps()).toEqual([{ op: 'click', ref: 'e12' }])
    expect(state().clickEvents).toEqual([{ videoTimeSec: 1.8, x: 30, y: 20, hand: true }])
    // Click sounds come from the cursor telemetry in demo source, not from here.
    expect(state().audioClips).toHaveLength(0)
  })

  it('timestamps after synthesis and runs an action while the speech interval is active', async () => {
    let now = 2000
    vi.spyOn(Date, 'now').mockImplementation(() => now)
    tts(10, () => {
      now = 7000
    })
    const actions: number[] = []
    vi.mocked(hostAction).mockImplementation(async () => {
      const saved = state()
      expect(saved.audioClips[0].absoluteTimestamp).toBe(7000)
      expect(saved.narrationEndTime).toBeGreaterThan(Date.now())
      actions.push(Date.now())
      return ok
    })
    const result = await tools.narrate.run(
      {
        text: 'Open the report to see its breakdown.',
        action: { command: 'press Enter' },
      },
      base,
    )
    expect(result).toContain('narration_started')
    expect(actions.length).toBeGreaterThan(0)
    expect(state().narrationEndTime).toBe(17000)
    expect(state().zoomEvents).toBeUndefined()
    // A separate interaction can also acquire the lock before speech finishes.
    await tools.browser.run({ command: 'snapshot' }, base)
  })

  it('does not overlap consecutive spoken lines', async () => {
    tts(0.03)
    await tools.narrate.run({ text: 'First line.' }, base)
    const firstEnd = state().narrationEndTime
    await tools.narrate.run({ text: 'Second line.' }, base)
    const saved = state()
    expect(saved.audioClips[1].absoluteTimestamp).toBeGreaterThanOrEqual(firstEnd - 1)
    expect(saved.audioClips[1].filePath).not.toBe(saved.audioClips[0].filePath)
  })

  it('propagates failed typing instead of claiming it typed successfully', async () => {
    vi.mocked(hostAction).mockRejectedValue(new Error('Ref e99 not found'))
    await expect(tools['fill-field'].run({ target: 'e99', text: 'Report' }, base)).rejects.toThrow(
      'Ref e99 not found',
    )
  })

  it('reports a failed narrated action without discarding the scheduled speech or ending capture', async () => {
    tts(1)
    vi.mocked(hostAction).mockRejectedValue(new Error('Target closed'))
    await expect(
      tools.narrate.run({ text: 'Open it.', action: { command: 'press Enter' } }, base),
    ).rejects.toThrow('Target closed')
    expect(state().audioClips).toHaveLength(1)
    expect(state().endTime).toBeUndefined()
  })

  it('does not execute the action when TTS failed', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 503, text: async () => 'unavailable' })),
    )
    await expect(
      tools.narrate.run({ text: 'Open it.', action: { command: 'press Enter' } }, base),
    ).rejects.toThrow('TTS failed')
    expect(state().audioClips).toHaveLength(0)
    expect(browserOps()).toHaveLength(0)
  })

  it('preparation snapshots preserve the previous take and cannot schedule speech', async () => {
    const previous = JSON.stringify({
      startTime: 10,
      endTime: 20,
      audioClips: [{ text: 'Previous' }],
    })
    fs.writeFileSync(path.join(base, 'recording/demo-state.json'), previous)
    fs.writeFileSync(path.join(base, 'recording/browser.json'), JSON.stringify({ startTime: 100 }))
    await tools.browser.run({ command: 'snapshot' }, base)
    expect(fs.readFileSync(path.join(base, 'recording/demo-state.json'), 'utf8')).toBe(previous)
    await expect(tools.narrate.run({ text: 'Test' }, base)).rejects.toThrow('record-start')
  })

  it('prevents browser lifecycle commands from bypassing the take lifecycle', async () => {
    for (const command of ['close', 'video-stop', 'playwright-cli open https://example.com']) {
      await expect(tools.browser.run({ command }, base)).rejects.toThrow('closed by record-stop')
    }
    expect(browserOps()).toHaveLength(0)
  })

  it('is not a shell', async () => {
    for (const command of ['help', 'env', 'cat /proc/self/environ', 'run-code "async p => 1"'])
      await expect(tools.browser.run({ command }, base)).rejects.toThrow('not a browser command')
    await expect(tools['fill-field'].run({ target: 'e1; id', text: 'x' }, base)).rejects.toThrow(
      'ref from the current snapshot',
    )
    expect(browserOps()).toHaveLength(0)
  })

  it('waits for the closing line and allows cancellation', async () => {
    const end = Date.now() + 30
    await waitForNarration(end)
    expect(Date.now()).toBeGreaterThanOrEqual(end - 1)
    const controller = new AbortController()
    const pending = waitForNarration(Date.now() + 10000, controller.signal)
    controller.abort()
    await expect(pending).rejects.toThrow()
  })
})
