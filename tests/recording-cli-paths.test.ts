import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import recordingCommands from '../.pi/cli/recording.ts'
import { collectCommands } from '../.pi/lib/testing.ts'

const tools = collectCommands(recordingCommands)
let base: string
let outside: string
beforeEach(() => {
  base = fs.mkdtempSync(path.join(os.tmpdir(), 'recording-cli-'))
  outside = fs.mkdtempSync(path.join(os.tmpdir(), 'someone-else-'))
  fs.writeFileSync(path.join(outside, 'private.mp4'), 'not yours')
})
afterEach(() => {
  fs.rmSync(base, { recursive: true, force: true })
  fs.rmSync(outside, { recursive: true, force: true })
})

const hasFfmpeg = (() => {
  try {
    execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
})()

describe('pitch recording reads only its own workspace', () => {
  it('refuses a video outside the project, however it is named', async () => {
    fs.symlinkSync(path.join(outside, 'private.mp4'), path.join(base, 'link.mp4'))
    for (const videoPath of [
      path.join(outside, 'private.mp4'),
      `../${path.basename(outside)}/private.mp4`,
      'link.mp4',
    ]) {
      const out = await tools['probe-video'].run({ videoPath }, base)
      expect(out, videoPath).toMatch(/ERROR: probe failed — .*outside this project/)
    }
  })

  it.skipIf(!hasFfmpeg)('probes a video in the workspace', async () => {
    fs.mkdirSync(path.join(base, 'recording'))
    execFileSync('ffmpeg', [
      '-v',
      'error',
      '-f',
      'lavfi',
      '-i',
      'testsrc=size=320x240:rate=10',
      '-t',
      '1',
      path.join(base, 'recording', 'upload $(id).mp4'),
    ])
    const out = JSON.parse(
      await tools['probe-video'].run({ videoPath: 'recording/upload $(id).mp4' }, base),
    )
    expect(out).toMatchObject({ width: 320, height: 240, hasAudio: false })
  })
})
