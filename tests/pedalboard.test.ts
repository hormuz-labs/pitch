import { execFile, spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdir, readdir, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { run } from '../.pi/cli/run.ts'
import { SCRIPTS_DIR } from '../.pi/lib/paths.ts'
import '../apps/api/src/pipelines/media.ts'
import { takeComputeSeconds } from '../apps/api/src/studio/host-actions.ts'
import { workspaceFor } from '../apps/api/src/studio/paths.ts'

const exec = promisify(execFile)
const python = process.env.STUDIO_PYTHON || 'python3'
const hasPedalboard = spawnSync(python, ['-I', '-c', 'import pedalboard, numpy']).status === 0
const ws = workspaceFor('studio', 'pedalboard-test', randomUUID())
const rate = 48000
const frames = rate + 1 // Includes a one-frame final block for stereo layout detection.

function wav(channels: number, sample: (frame: number, channel: number) => number): Buffer {
  const data = Buffer.alloc(44 + frames * channels * 2)
  data.write('RIFF', 0)
  data.writeUInt32LE(data.length - 8, 4)
  data.write('WAVEfmt ', 8)
  data.writeUInt32LE(16, 16)
  data.writeUInt16LE(1, 20)
  data.writeUInt16LE(channels, 22)
  data.writeUInt32LE(rate, 24)
  data.writeUInt32LE(rate * channels * 2, 28)
  data.writeUInt16LE(channels * 2, 32)
  data.writeUInt16LE(16, 34)
  data.write('data', 36)
  data.writeUInt32LE(data.length - 44, 40)
  for (let frame = 0; frame < frames; frame++) {
    for (let channel = 0; channel < channels; channel++) {
      data.writeInt16LE(
        Math.round(sample(frame, channel) * 32767),
        44 + (frame * channels + channel) * 2,
      )
    }
  }
  return data
}

const command = (...args: string[]) => run(['media', 'pedalboard', ...args], { cwd: ws.dir })
const processAudio = (out: string, effects: unknown, ...extra: string[]) =>
  command(
    '--file',
    'uploads/source.wav',
    '--out',
    out,
    '--effects',
    JSON.stringify(effects),
    ...extra,
  )

async function samples(file: string) {
  const { stdout } = await exec(
    'ffmpeg',
    ['-v', 'error', '-i', path.join(ws.dir, file), '-f', 'f32le', '-c:a', 'pcm_f32le', 'pipe:1'],
    { encoding: 'buffer' },
  )
  return Array.from({ length: stdout.length / 4 }, (_, i) => stdout.readFloatLE(i * 4))
}

beforeAll(async () => {
  await mkdir(path.join(ws.dir, 'uploads'), { recursive: true })
  await writeFile(
    path.join(ws.dir, 'uploads/source.wav'),
    wav(2, (_frame, channel) => (channel === 0 ? 0.4 : -0.2)),
  )
  await writeFile(
    path.join(ws.dir, 'uploads/impulse.wav'),
    wav(1, frame => (frame === Math.round(rate * 0.95) ? 0.5 : 0)),
  )
  await writeFile(
    path.join(ws.dir, 'uploads/tone.wav'),
    wav(1, frame => 0.2 * Math.sin((2 * Math.PI * 880 * frame) / rate)),
  )
})
afterEach(() => vi.unstubAllEnvs())
afterAll(async () => {
  takeComputeSeconds(ws.internal)
  await rm(ws.dir, { recursive: true, force: true })
})

describe('Pedalboard CLI boundary', () => {
  it('is discoverable with its options and accepts JSON chains', async () => {
    expect((await run('media --help', { cwd: ws.dir })).text).toContain('pedalboard')
    expect((await command('--help')).text).toContain('--effects')
    expect((await command('--help')).text).toContain('--tail')
  })

  it('rejects missing paths, traversal, absolute paths and symlink escapes', async () => {
    expect((await command()).ok).toBe(false)
    for (const file of ['../outside.wav', '/tmp/outside.wav']) {
      const result = await command('--file', file, '--out', 'audio/invalid.wav')
      expect(result.ok).toBe(false)
      expect(result.text).toMatch(/workspace-relative|escapes the workspace/)
    }
    await symlink(path.dirname(ws.dir), path.join(ws.dir, 'outside'))
    const result = await processAudio('outside/escape.wav', [{ name: 'Gain' }])
    expect(result.ok).toBe(false)
    expect(result.text).toContain('escapes the workspace')
  })

  it('refuses to replace its input or another existing output', async () => {
    const before = await readFile(path.join(ws.dir, 'uploads/source.wav'))
    const result = await processAudio('uploads/source.wav', [{ name: 'Gain' }])
    expect(result.ok).toBe(false)
    expect(result.text).toContain('NEW file')
    expect(await readFile(path.join(ws.dir, 'uploads/source.wav'))).toEqual(before)
    expect((await processAudio('audio/wrong.mp3', [{ name: 'Gain' }])).text).toContain('.wav')
  })

  it('reports a missing host runtime and cleans partial output', async () => {
    vi.stubEnv('STUDIO_PYTHON', path.join(ws.dir, 'missing-python'))
    const result = await processAudio('audio/missing.wav', [{ name: 'Gain' }])
    expect(result.ok).toBe(false)
    expect(result.text).toContain('STUDIO_PYTHON')
    expect(await readdir(path.join(ws.dir, 'audio'))).toEqual([])
  })
})

// Native DSP requires the same host dependency installed by the API Dockerfile.
// Set STUDIO_PYTHON per docs/installation.md to run these outside the image.
describe.skipIf(!hasPedalboard)('Pedalboard DSP through the CLI and metered host bridge', () => {
  it('lists real constructor parameters and meters the host call', async () => {
    takeComputeSeconds(ws.internal)
    const result = await command('--list')
    expect(result.ok, result.text).toBe(true)
    expect(result.text).toContain('Reverb:')
    expect(result.text).toContain('room_size: float')
    expect(result.text).toContain('PitchShift:')
    expect(takeComputeSeconds(ws.internal)).toBeGreaterThan(0)
  })

  it('applies ordered effects while preserving rate, stereo layout and every frame', async () => {
    const result = await processAudio('audio/quiet stereo.wav', [
      { name: 'Gain', params: { gain_db: -6 } },
      { name: 'Clipping', params: { threshold_db: -12 } },
    ])
    expect(result.ok, result.text).toBe(true)
    expect(result.text).toContain('48000 Hz, 2ch')
    const audio = await samples('audio/quiet stereo.wav')
    expect(audio.length).toBe(frames * 2)
    expect(audio[1000]).toBeCloseTo(0.4 * 10 ** (-6 / 20), 4)
    expect(audio[1001]).toBeCloseTo(-0.2 * 10 ** (-6 / 20), 4)
    expect(audio.at(-2)).toBeCloseTo(audio[1000], 4)
    expect(audio.at(-1)).toBeCloseTo(audio[1001], 4)
  })

  it('keeps delay state across blocks and renders an audible tail', async () => {
    const result = await command(
      '--file',
      'uploads/impulse.wav',
      '--out',
      'audio/echo.wav',
      '--tail',
      '0.3',
      '--effects',
      JSON.stringify([{ name: 'Delay', params: { delay_seconds: 0.15, feedback: 0, mix: 1 } }]),
    )
    expect(result.ok, result.text).toBe(true)
    const audio = await samples('audio/echo.wav')
    expect(audio.length).toBe(frames + rate * 0.3)
    expect(Math.max(...audio.slice(rate))).toBeGreaterThan(0.4)
    expect(Math.max(...audio.slice(0, rate))).toBeLessThan(0.01)
  })

  it('drains pitch-shifter latency instead of truncating the clip', async () => {
    const result = await processAudio('audio/pitched.wav', [
      { name: 'PitchShift', params: { semitones: -5 } },
    ])
    expect(result.ok, result.text).toBe(true)
    expect((await samples('audio/pitched.wav')).length).toBe(frames * 2)
  })

  it('produces a processed file the existing SFX cue builder can measure and mix', async () => {
    const result = await command(
      '--file',
      'uploads/tone.wav',
      '--out',
      'audio/sfx/reveal.wav',
      '--effects',
      JSON.stringify([
        { name: 'Reverb', params: { room_size: 0.6, wet_level: 0.2, dry_level: 0.8 } },
        { name: 'Gain', params: { gain_db: -6 } },
      ]),
      '--tail',
      '0.5',
    )
    expect(result.ok, result.text).toBe(true)
    await writeFile(
      path.join(ws.dir, 'audio/sfx-cues.json'),
      JSON.stringify({
        duration: 3,
        cues: [{ label: 'reveal', t: 1, event: 'impact', file: 'audio/sfx/reveal.wav' }],
      }),
    )
    await exec('node', [path.join(SCRIPTS_DIR, 'launch-video/sfx.mjs'), 'build'], {
      cwd: ws.dir,
    }).catch(error => {
      throw new Error(`${error.stdout}\n${error.stderr}`)
    })
    expect((await stat(path.join(ws.dir, 'audio/sfx_bus.wav'))).size).toBeGreaterThan(1000)
  })

  it('explains how to install a missing Python dependency', async () => {
    await expect(
      exec(python, ['-I', '-S', path.join(SCRIPTS_DIR, 'audio-effects.py'), '{"list":true}']),
    ).rejects.toThrow(/requirements-audio.txt.*STUDIO_PYTHON/)
  })

  it('rejects invalid effects and parameters without leaving artifacts', async () => {
    for (const effects of [
      [],
      [{ name: 'load_plugin', params: { path: '/tmp/effect.vst3' } }],
      [{ name: 'Gain', params: { typo: 1 } }],
      [{ name: 'Gain', params: { gain_db: 'loud' } }],
    ]) {
      const result = await processAudio('audio/invalid.wav', effects)
      expect(result.ok, result.text).toBe(false)
    }
    expect((await processAudio('audio/invalid.wav', [{ name: 'Gain' }], '--tail', '-1')).ok).toBe(
      false,
    )
    expect(await readdir(path.join(ws.dir, 'audio'))).not.toContain('invalid.wav')
    expect(
      (await readdir(path.join(ws.dir, 'audio'))).some(name => name.startsWith('.pedalboard-')),
    ).toBe(false)
  })
})
