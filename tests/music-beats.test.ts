import { execFileSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import motionCommands from '../.pi/cli/motion.ts'
import { collectCommands } from '../.pi/lib/testing.ts'
import { musicEdit } from '../.pi/scripts/launch-video/lib/music-beats.mjs'

const tools = collectCommands(motionCommands)
const hasFfmpeg = (() => {
  try {
    execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
})()

let ws: string
beforeEach(() => {
  ws = fs.mkdtempSync(path.join(os.tmpdir(), 'music-beats-'))
  fs.mkdirSync(path.join(ws, 'audio'))
})
afterEach(() => fs.rmSync(ws, { recursive: true, force: true }))

// 128 BPM from 0.2s: a kick on every downbeat, a hat on every beat, a pink-noise
// floor, and everything louder from 15s (bar 9).
function clickTrack(file: string) {
  const bar = 1.875
  const beat = bar / 4
  execFileSync('ffmpeg', [
    '-v',
    'error',
    '-f',
    'lavfi',
    '-i',
    `aevalsrc='(0.3+0.7*gte(t,15))*gte(t,0.2)*(0.9*sin(2*PI*55*t)*exp(-25*mod(t-0.2,${bar}))+0.25*sin(2*PI*3000*t)*exp(-80*mod(t-0.2,${beat})))':s=44100:d=30`,
    '-f',
    'lavfi',
    '-i',
    'anoisesrc=color=pink:amplitude=0.08:r=44100:d=30',
    '-filter_complex',
    '[0][1]amix=inputs=2:normalize=0',
    file,
  ])
}

describe.skipIf(!hasFfmpeg)('pitch motion beats', { timeout: 30_000 }, () => {
  it('finds the tempo, the downbeats and the drop', async () => {
    clickTrack(path.join(ws, 'audio', 'music.wav'))
    const out = await tools.beats.run({ duration: 28 }, ws)
    expect(out).toMatch(/128 BPM/)
    const music = JSON.parse(fs.readFileSync(path.join(ws, 'audio', 'music-beats.json'), 'utf8'))
    expect(music.bars[0].t).toBeCloseTo(0.2, 1)
    expect(music.bars[4].t).toBeCloseTo(0.2 + 4 * 1.875, 1)
    expect(music.drop.bar).toBe(9)
  })

  it('cuts a music-only film onto the bars it cues', async () => {
    clickTrack(path.join(ws, 'audio', 'music.wav'))
    await tools.beats.run({}, ws)
    fs.writeFileSync(
      path.join(ws, 'shots.js'),
      `window.SHOTS = { shots: [
  { id: "open", type: "x", dur: 2 },
  { id: "turn", type: "x", dur: 2, cue: "bar 3.3", beats: [{ cue: "bar 4", kind: "kick" }] },
  { id: "hit", type: "x", dur: 3, cue: "drop" },
]};\n`,
    )
    await tools.sync.run({ write: true }, ws)
    const music = JSON.parse(fs.readFileSync(path.join(ws, 'audio', 'music-beats.json'), 'utf8'))
    const shots = new Function(
      'window',
      `${fs.readFileSync(path.join(ws, 'shots.js'), 'utf8')}; return window.SHOTS.shots`,
    )({})
    const turn = music.beats[music.beats.indexOf(music.bars[2].t) + 2]
    expect(shots[0].dur).toBeCloseTo(turn, 2)
    expect(shots[0].dur + shots[1].dur).toBeCloseTo(music.drop.t, 2)
    expect(shots[0].dur + shots[1].beats[0].at).toBeCloseTo(music.bars[3].t, 2)
    // every shot carries the beats inside it, in shot seconds
    expect(shots[2].beatTimes.slice(0, 2)).toEqual([0, expect.closeTo(music.period, 1)])
  })
})

describe('a bed that runs past the film', () => {
  // 30 two-second bars from 0.2s; the last two are the ending's decay.
  const bars = Array.from({ length: 30 }, (_, k) => ({
    n: k + 1,
    t: 0.2 + 2 * k,
    db: k >= 28 ? -40 : -10,
  }))

  it('loses whole bars late on so its own ending closes the film', () => {
    const cut = musicEdit({ bars, seconds: 60.2, steady: true }, 31.4)!
    expect(cut).toMatchObject({ a: 24.2, b: 52.2, from: 13, to: 26 })
    const bars_ = (cut.b - cut.a) / 2
    expect(bars_).toBeCloseTo(Math.round(bars_), 6) // whole bars: the grid stays on the beat
    expect(Math.abs(cut.length - 31.4)).toBeLessThanOrEqual(1) // within half a bar of the end
  })

  it('leaves a bed that already ends with the film, is shorter, or has no steady pulse', () => {
    expect(musicEdit({ bars, seconds: 60.2, steady: true }, 59.8)).toBeNull()
    expect(musicEdit({ bars, seconds: 60.2, steady: true }, 75)).toBeNull()
    expect(musicEdit({ bars, seconds: 60.2, steady: false }, 31.4)).toBeNull()
  })
})

// 128 BPM for 40s, full level until 34s, then the ending decays.
function endingTrack(file: string) {
  const bar = 1.875
  execFileSync('ffmpeg', [
    '-v',
    'error',
    '-f',
    'lavfi',
    '-i',
    `aevalsrc='gte(t,0.2)*if(lt(t,34),1,exp(-1.5*(t-34)))*(0.9*sin(2*PI*55*t)*exp(-25*mod(t-0.2,${bar}))+0.25*sin(2*PI*3000*t)*exp(-80*mod(t-0.2,${bar / 4}))+0.2*sin(2*PI*220*t))':s=44100:d=40`,
    file,
  ])
}
/** Mean level of `length` seconds from `from` (volumedetect reports on stderr). */
const meanDb = (file: string, from: number, length: number) => {
  const { stderr } = spawnSync(
    'ffmpeg',
    [
      '-hide_banner',
      '-nostats',
      '-ss',
      String(from),
      '-t',
      String(length),
      '-i',
      file,
      '-af',
      'volumedetect',
      '-f',
      'null',
      '-',
    ],
    { encoding: 'utf8' },
  )
  return Number(/mean_volume: (-?[\d.]+)/.exec(stderr)?.[1] ?? Number.NaN)
}

describe.skipIf(!hasFfmpeg)('pitch motion mix', { timeout: 60_000 }, () => {
  const run = (...extra: string[]) =>
    execFileSync(
      'node',
      [
        path.resolve('.pi/scripts/launch-video/mix.mjs'),
        '--duration=20',
        '--music=audio/music.wav',
        '--music-only',
        '--bed-db=0',
        ...extra,
      ],
      { cwd: ws, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    )

  it("cuts a long bed so the track's own ending lands on the film's end", () => {
    endingTrack(path.join(ws, 'audio', 'music.wav'))
    expect(run()).toMatch(/bars \d+–\d+ cut at [\d.]+s so the track's own ending closes the film/)
    const mix = path.join(ws, 'audio', 'mix.wav')
    // two seconds before the end the ending is already decaying; mid-film it is full
    expect(meanDb(mix, 9, 1) - meanDb(mix, 17.6, 0.6)).toBeGreaterThan(10)
    expect(run('--keep-music')).not.toMatch(/cut at/)
    expect(Math.abs(meanDb(mix, 9, 1) - meanDb(mix, 17.6, 0.6))).toBeLessThan(3)
  })
})
