import { describe, expect, it } from 'vitest'
import { musicPrompt } from '../apps/api/src/pipelines/lyria.js'
import { findDrops, fitOffset, WINDOW } from '../apps/api/src/pipelines/music-fit.js'

/** A low-band level track: [dB, seconds] runs, sliced into WINDOW windows. */
const track = (...runs: [number, number][]) =>
  runs.flatMap(([db, s]) => Array.from({ length: Math.round(s / WINDOW) }, () => db))

describe('Lyria music bed', () => {
  it('asks for an instrumental of the film length without doubling an instruction', () => {
    expect(musicPrompt(' Trap-pop, 140 BPM. ', 30.2)).toBe(
      'Trap-pop, 140 BPM.\nInstrumental only, no vocals.\nAbout 31 seconds long.',
    )
    expect(musicPrompt('Instrumental synthwave.', 12)).toBe(
      'Instrumental synthwave.\nAbout 12 seconds long.',
    )
    expect(() => musicPrompt(' ', 30)).toThrow(/prompt is required/)
    expect(() => musicPrompt('A bed', 2)).toThrow(/3 and 600/)
  })

  it('finds where the bass drops out and slams back, not the silent tail', () => {
    const drops = findDrops(track([-31, 6], [-16, 10], [-38, 3], [-13, 30], [-120, 3]))
    expect(drops.map(d => d.at)).toEqual([6, 19])
    expect(drops[1].lift).toBeCloseTo(25)
    expect(drops[1].after).toBe(3)
  })

  it('ignores gaps in the groove, too short to be a breakdown', () => {
    expect(findDrops(track([-15, 5], [-35, 1], [-15, 2], [-38, 0.75], [-15, 5]))).toEqual([])
  })

  it('counts a short gap that opens a sustained section: a half-time groove into the big drop', () => {
    const groove = track([-16, 1.5], [-32, 1.25], [-16, 1.5], [-32, 1.25], [-16, 1.5], [-32, 1.25])
    const drops = findDrops([...groove, ...track([-15, 12])])
    expect(drops.map(d => d.at)).toEqual([8.25])
  })

  it('trims the head so the earliest drop after the turn word lands on it', () => {
    const drops = [
      { at: 6.5, lift: 21, after: 6.5 },
      { at: 19.75, lift: 26, after: 4.25 },
      { at: 40, lift: 20, after: 2 },
      { at: 76.75, lift: 65, after: 16.25 },
    ]
    expect(fitOffset(drops, 14.2)).toEqual({ offset: 19.75 - 14.2, drop: drops[1] })
    expect(fitOffset(drops, 5)).toEqual({ offset: 1.5, drop: drops[0] })
    expect(fitOffset(drops, 60)).toEqual({ offset: 16.75, drop: drops[3] })
    expect(fitOffset(drops, 80)).toEqual({ offset: 0 })
    expect(fitOffset(drops, undefined)).toEqual({ offset: 0 })
  })
})
