import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const host = vi.hoisted(() => ({ actions: new Map<string, any>(), call: vi.fn() }))
vi.mock('../apps/api/src/studio/host-actions.ts', () => ({
  registerHostAction: (name: string, action: any) => host.actions.set(name, action),
  callHostAction: host.call,
}))

import { releaseDemoRecording } from '../apps/api/src/flows/demo-video/index.ts'

let root: string
beforeEach(async () => {
  vi.clearAllMocks()
  root = await mkdtemp(path.join(tmpdir(), 'demo-source-cursor-'))
  await mkdir(path.join(root, 'recording'))
  for (const file of ['demo.webm', 'voice.mp3', 'click.mp3'])
    await writeFile(path.join(root, 'recording', file), 'fixture')
  await write('demo-config.json', {
    startTime: 1000,
    videoStartTime: 1000,
    cursor: 'recording/cursor.json',
  })
  await write('demo-state.json', {
    audioClips: [
      {
        filePath: 'recording/voice.mp3',
        absoluteTimestamp: 2200,
        durationSec: 0.5,
        text: 'Click here.',
      },
      { filePath: 'recording/click.mp3', absoluteTimestamp: 2000 },
    ],
  })
  await write('cursor.json', {
    version: 2,
    complete: true,
    startTime: 1000,
    events: [
      { kind: 'down', time: 3, buttons: 1 },
      { kind: 'up', time: 3.1, buttons: 0 },
    ],
  })
  host.call.mockResolvedValue('{}')
})
afterEach(async () => rm(root, { recursive: true, force: true }))
const write = (file: string, value: unknown) =>
  writeFile(path.join(root, 'recording', file), JSON.stringify(value))
const prepare = () =>
  host.actions.get('demo_source')({ dir: root, internal: path.basename(root) }, {}, {})

describe('demo source cursor handoff', () => {
  it('passes portable telemetry and aligns click audio to actual press time without moving narration', async () => {
    await prepare()
    expect(host.call).toHaveBeenCalledWith(
      root,
      'demo_source_encode',
      {
        source: 'recording/demo.webm',
        cursor: 'recording/cursor.json',
        capture_start: 1000,
        clips: [
          { source: 'recording/voice.mp3', start: 1.2, duration: 0.5, text: 'Click here.' },
          { source: 'recording/click.mp3', start: 3, text: undefined },
        ],
      },
      {},
    )
  })

  it('blocks failed telemetry rather than rendering a new cursorless source', async () => {
    await write('cursor.json', { version: 2, complete: false, startTime: 1000 })
    await expect(prepare()).rejects.toThrow('incomplete')
    expect(host.call).not.toHaveBeenCalled()
  })

  it('keeps legacy baked-cursor sources free of a second cursor', async () => {
    await write('demo-config.json', { startTime: 1000, videoStartTime: 1000 })
    await prepare()
    expect(host.call.mock.calls[0]![2]).not.toHaveProperty('cursor')
    expect(host.call.mock.calls[0]![2].clips[1].start).toBe(1)
  })

  it('uses the declared Matroska master and refuses incomplete finalization', async () => {
    await writeFile(path.join(root, 'recording/demo.mkv'), 'fixture')
    await write('demo-config.json', {
      startTime: 1000,
      videoStartTime: 1000,
      videoFile: 'recording/demo.mkv',
      cursor: 'recording/cursor.json',
    })
    await write('capture-status.json', { state: 'complete' })
    await prepare()
    expect(host.call.mock.calls[0]![2].source).toBe('recording/demo.mkv')
    await write('capture-status.json', { state: 'failed', error: 'capture storage failed' })
    await expect(prepare()).rejects.toThrow('not finalized')
    await expect(host.actions.get('demo_record_stop')({ dir: root }, {}, {})).rejects.toThrow(
      'Previous recording failed',
    )
    await expect(releaseDemoRecording({ dir: root } as any)).resolves.toBeUndefined()
  })
})
