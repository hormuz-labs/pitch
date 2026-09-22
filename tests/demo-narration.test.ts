import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import demoCommands from '../.pi/cli/demo.ts'
import { runAgentCommand } from '../.pi/lib/agent-command.ts'
import { waitForNarration } from '../.pi/lib/demo-timing.ts'
import { collectCommands } from '../.pi/lib/testing.ts'

vi.mock('../.pi/lib/agent-command.ts', () => ({ runAgentCommand: vi.fn() }))
vi.mock('../.pi/lib/audio-config.ts', () => ({
  projectAudioConfig: () => ({ tts: { provider: 'gemini' } }),
}))

const tools = collectCommands(demoCommands)
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
  vi.mocked(runAgentCommand).mockResolvedValue({ stdout: '', stderr: '' } as any)
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
  it('timestamps after synthesis and runs an action while the speech interval is active', async () => {
    let now = 2000
    vi.spyOn(Date, 'now').mockImplementation(() => now)
    tts(10, () => {
      now = 7000
    })
    const actions: number[] = []
    vi.mocked(runAgentCommand).mockImplementation(async () => {
      const saved = state()
      expect(saved.audioClips[0].absoluteTimestamp).toBe(7000)
      expect(saved.narrationEndTime).toBeGreaterThan(Date.now())
      actions.push(Date.now())
      return { stdout: '', stderr: '' } as any
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
    await tools.bash.run({ command: 'snapshot' }, base)
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
    vi.mocked(runAgentCommand).mockResolvedValue({
      stdout: '### Error\nRef e99 not found',
      stderr: '',
    } as any)
    await expect(tools['fill-field'].run({ target: 'e99', text: 'Report' }, base)).rejects.toThrow(
      'Ref e99 not found',
    )
  })

  it('reports a failed narrated action without discarding the scheduled speech or ending capture', async () => {
    tts(1)
    vi.mocked(runAgentCommand).mockResolvedValue({
      stdout: '### Error\nTarget closed',
      stderr: '',
    } as any)
    await expect(
      tools.narrate.run({ text: 'Open it.', action: { command: 'press Enter' } }, base),
    ).rejects.toThrow('Target closed')
    expect(state().audioClips).toHaveLength(1)
    expect(state().endTime).toBeUndefined()
    expect(
      vi.mocked(runAgentCommand).mock.calls.every(([cmd]) => !cmd.includes('video-stop')),
    ).toBe(true)
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
    expect(runAgentCommand).not.toHaveBeenCalled()
  })

  it('preparation snapshots preserve the previous take and cannot schedule speech', async () => {
    const previous = JSON.stringify({
      startTime: 10,
      endTime: 20,
      audioClips: [{ text: 'Previous' }],
    })
    fs.writeFileSync(path.join(base, 'recording/demo-state.json'), previous)
    fs.writeFileSync(path.join(base, 'recording/browser.json'), JSON.stringify({ startTime: 100 }))
    await tools.bash.run({ command: 'snapshot' }, base)
    expect(fs.readFileSync(path.join(base, 'recording/demo-state.json'), 'utf8')).toBe(previous)
    await expect(tools.narrate.run({ text: 'Test' }, base)).rejects.toThrow('record-start')
  })

  it('prevents browser lifecycle commands from bypassing the take lifecycle', async () => {
    for (const command of ['close', 'video-stop', 'playwright-cli open https://example.com']) {
      await expect(tools.bash.run({ command }, base)).rejects.toThrow('record-stop only at its end')
    }
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
