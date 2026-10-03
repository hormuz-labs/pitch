import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import motionCommands from '../.pi/cli/motion.ts'
import { collectCommands } from '../.pi/lib/testing.ts'

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
