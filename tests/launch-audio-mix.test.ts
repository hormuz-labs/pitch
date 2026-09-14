import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  balanceProblems,
  cueGain,
  measureAudioWindows,
} from '../.pi/scripts/launch-video/lib/audio-levels.mjs'
import { correctiveBedDb } from '../apps/api/src/lib/mix.js'

const exec = promisify(execFile)
const mixScript = path.resolve('.pi/scripts/launch-video/mix.mjs')
const sfxScript = path.resolve('.pi/scripts/launch-video/sfx.mjs')
let ws = ''
const mix = (...args: string[]) =>
  exec(
    'node',
    [
      mixScript,
      '--duration=4',
      '--music=audio/music.wav',
      '--sfx=audio/sfx_bus.wav',
      '--music-only',
      ...args,
    ],
    { cwd: ws },
  )
const generate = (name: string, input: string, filter = 'anull') =>
  exec('ffmpeg', [
    '-v',
    'error',
    '-y',
    '-f',
    'lavfi',
    '-i',
    input,
    '-af',
    filter,
    '-ar',
    '48000',
    '-ac',
    '2',
    '-c:a',
    'pcm_f32le',
    path.join(ws, name),
  ])

beforeAll(async () => {
  ws = await mkdtemp(path.join(tmpdir(), 'pitch-audio-mix-'))
  await mkdir(path.join(ws, 'audio'))
  await generate('audio/music.wav', 'sine=frequency=220:duration=4', 'volume=4')
  // A 150ms transient is quiet in the whole-film average but overwhelms the bed.
  await generate(
    'audio/sfx_bus.wav',
    'sine=frequency=880:duration=0.15',
    'volume=6,adelay=1000|1000,apad=whole_dur=4',
  )
})
afterAll(async () => {
  if (ws) await rm(ws, { recursive: true, force: true })
})

describe('launch audio regression', () => {
  it('computes a safer bed level from a marginal contrast failure', () => {
    expect(
      correctiveBedDb(
        'FAIL — the voice is only 7.6dB above the bed (need ≥10dB).\n(currently -13)',
      ),
    ).toBe(-16.4)
    expect(correctiveBedDb('SFX overpower music')).toBeNull()
  })

  it('caps LUFS correction by transient headroom, including user gain', () => {
    expect(cueGain({ lufs: -32.8, peak: -9.7 }, -21, 0, 'impact').gainDb).toBeCloseTo(0.7)
    expect(cueGain({ lufs: -27.2, peak: -2.5 }, -30, 6, 'click').gainDb).toBeCloseTo(-15.5)
  })

  it('rejects brief overpowering cues and preserves an existing mix', async () => {
    await writeFile(path.join(ws, 'audio/mix.wav'), 'previous good mix')
    await expect(mix()).rejects.toMatchObject({
      stderr: expect.stringContaining('SFX overpower music'),
    })
    expect(await readFile(path.join(ws, 'audio/mix.wav'), 'utf8')).toBe('previous good mix')
  })

  it('detects the old +6dB pre-limiter clipping rather than hiding it in PCM16', async () => {
    await expect(mix('--sfx-db=6')).rejects.toMatchObject({
      stderr: expect.stringContaining('SFX samples exceed full scale'),
    })
  })

  it('passes a balanced mix and preserves its gains on the next automatic rebuild', async () => {
    await mix('--sfx-db=-18')
    const original = await readFile(path.join(ws, 'audio/mix.wav'))
    expect(
      JSON.parse(await readFile(path.join(ws, 'audio/mix-settings.json'), 'utf8'))['sfx-db'],
    ).toBe(-18)
    const rerun = await mix()
    expect(rerun.stdout).toContain('-18dB SFX trim')
    expect(await readFile(path.join(ws, 'audio/mix.wav'))).toEqual(original)
    expect((await measureAudioWindows(path.join(ws, 'audio/mix.wav'), 4)).clipped).toBe(0)
  })

  it('allows a designed SFX-only opening without treating silence as a music level', () => {
    expect(
      balanceProblems(
        { windows: [{ mean: -80, peak: -70 }] },
        { windows: [{ t: 0, mean: -20, peak: -9 }] },
      ),
    ).toEqual([])
    const bed = { windows: [-65, -35, -18, -18].map(mean => ({ mean, peak: mean + 6 })) }
    const sfx = {
      windows: [-20, -20, -40, -40].map((mean, i) => ({ t: i / 10, mean, peak: mean + 6 })),
    }
    expect(balanceProblems(bed, sfx)).toEqual([])
  })

  it('honors zero and bounded duck depth for a continuous narration read', async () => {
    await generate('audio/vo.wav', 'sine=frequency=440:duration=3.3', 'volume=4')
    await writeFile(
      path.join(ws, 'shots.js'),
      'window.SHOTS={audio:{vo:"audio/vo.wav",voStart:0.1},shots:[{id:"one",dur:4}]}',
    )
    const run = (depth: number) =>
      exec(
        'node',
        [mixScript, '--duration=4', '--music=audio/music.wav', '--bed-db=-18', `--duck=${depth}`],
        { cwd: ws },
      )
    const zero = await run(0)
    const ducked = await run(6)
    const bedMean = (out: string) =>
      Number(/Step C {2}music_ducked\s+mean (-?[\d.]+)/.exec(out)?.[1])
    const reduction = bedMean(zero.stdout) - bedMean(ducked.stdout)
    expect(reduction).toBeGreaterThan(1)
    expect(reduction).toBeLessThanOrEqual(6)
    const previous = await readFile(path.join(ws, 'audio/mix.wav'))
    await expect(
      exec(
        'node',
        [mixScript, '--duration=4', '--music=audio/music.wav', '--bed-db=0', '--duck=0'],
        { cwd: ws },
      ),
    ).rejects.toMatchObject({ stdout: expect.stringContaining('❌ FAIL') })
    expect(await readFile(path.join(ws, 'audio/mix.wav'))).toEqual(previous)
  })

  it('ends risers at the payoff and rejects unbounded sustained sounds before overwriting the bus', async () => {
    await generate('audio/riser.wav', 'sine=frequency=900:duration=2')
    const sheet = (cue: object) =>
      writeFile(path.join(ws, 'audio/sfx-cues.json'), JSON.stringify({ duration: 4, cues: [cue] }))
    await sheet({ label: 'reveal', t: 2, event: 'riser', file: 'audio/riser.wav', dur: 1.2 })
    await exec('node', [sfxScript, 'build'], { cwd: ws })
    const bus = await measureAudioWindows(path.join(ws, 'audio/sfx_bus.wav'), 4)
    expect(bus.windows.find((w: { t: number }) => w.t === 0)?.mean).toBeLessThan(-80)
    expect(bus.windows.find((w: { t: number }) => w.t === 1)?.mean).toBeGreaterThan(-40)
    expect(bus.windows.find((w: { t: number }) => w.t === 2)?.mean).toBeLessThan(-80)
    await generate('audio/accent.wav', 'sine=frequency=600:duration=0.1')
    await writeFile(
      path.join(ws, 'audio/sfx-cues.json'),
      JSON.stringify({
        duration: 4,
        cues: [
          { label: 'approach', t: 2, event: 'riser', file: 'audio/riser.wav', dur: 1.2 },
          { label: 'payoff', t: 2, event: 'chime', file: 'audio/accent.wav' },
        ],
      }),
    )
    await exec('node', [sfxScript, 'build'], { cwd: ws })
    const previous = await readFile(path.join(ws, 'audio/sfx_bus.wav'))
    await sheet({ label: 'unbounded', t: 1, event: 'data', file: 'audio/riser.wav' })
    await expect(exec('node', [sfxScript, 'build'], { cwd: ws })).rejects.toMatchObject({
      stdout: expect.stringContaining("needs 'dur'"),
    })
    expect(await readFile(path.join(ws, 'audio/sfx_bus.wav'))).toEqual(previous)
  })
})
