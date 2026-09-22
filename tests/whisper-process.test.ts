import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { transcribeWav } from '../.pi/lib/whisper.ts'

let dir: string
let bin: string
beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'whisper-process-'))
  bin = path.join(dir, 'whisper-test')
  await writeFile(path.join(dir, 'model.bin'), 'test')
  vi.stubEnv('WHISPER_MODEL', path.join(dir, 'model.bin'))
  await writeFile(
    bin,
    `#!${process.execPath}
const fs = require('node:fs');
const out = process.argv[process.argv.indexOf('-of') + 1];
setTimeout(() => fs.writeFileSync(out + '.json', JSON.stringify({transcription:[{text:' hello',offsets:{from:0,to:200}}]})), 200);
`,
  )
  await chmod(bin, 0o755)
})
afterEach(async () => {
  vi.unstubAllEnvs()
  await rm(dir, { recursive: true, force: true })
})

describe('non-blocking transcription', () => {
  it('keeps heartbeat timers responsive while the model process runs', async () => {
    let heartbeats = 0
    const timer = setInterval(() => heartbeats++, 10)
    try {
      const result = await transcribeWav('unused.wav', { bin })
      expect(heartbeats).toBeGreaterThan(3)
      expect(result.words).toEqual([{ word: 'hello', start: 0, end: 0.2 }])
    } finally {
      clearInterval(timer)
    }
  })

  it('interrupts a running model when the render action is cancelled', async () => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 30)
    try {
      await expect(transcribeWav('unused.wav', { bin, signal: controller.signal })).rejects.toThrow(
        /abort/i,
      )
    } finally {
      clearTimeout(timer)
    }
  })
})
