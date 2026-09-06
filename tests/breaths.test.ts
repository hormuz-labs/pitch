/**
 * A breath is a dip in the bed before a payoff. These are the numbers the mix
 * hands ffmpeg for it.
 */
import { describe, expect, it } from 'vitest'
import {
  breathExpr,
  breathFilter,
  breathsOf,
} from '../.pi/skills/launch-video/scripts/lib/breaths.mjs'

describe('breathsOf', () => {
  it('cleans, defaults and orders the cues file entries', () => {
    const b = breathsOf({
      breaths: [{ at: 12.8 }, { at: 4.3, dur: 0.3, depth: 2 }, { at: 'x' }, { at: -1 }],
    })
    expect(b).toEqual([
      { at: 4.3, dur: 0.3, depth: 1 },
      { at: 12.8, dur: 0.45, depth: 0.75 },
    ])
    expect(breathsOf(null)).toEqual([])
  })
})

describe('breathExpr', () => {
  it('is null with nothing to duck', () => {
    expect(breathExpr([])).toBeNull()
    expect(breathFilter([])).toBeNull()
  })
  it('writes one clipped window per breath and multiplies them', () => {
    const e = breathExpr(
      [
        { at: 4.3, dur: 0.45, depth: 0.75 },
        { at: 12, dur: 0.5, depth: 0.5 },
      ],
      { ramp: 0.05 },
    )
    expect(e).toBe(
      '(1-0.750*clip((t-(4.300-0.050))/0.050,0,1)*clip(((4.750+0.050)-t)/0.050,0,1))*(1-0.500*clip((t-(12.000-0.050))/0.050,0,1)*clip(((12.500+0.050)-t)/0.050,0,1))',
    )
    expect(breathFilter([{ at: 1, dur: 0.4, depth: 0.75 }])).toMatch(
      /^volume=volume='.*':eval=frame$/,
    )
  })
  it('evaluates to full gain outside a breath and the dip inside it', () => {
    const e = breathExpr([{ at: 2, dur: 0.4, depth: 0.75 }], { ramp: 0.05 })!
    const clip = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x))
    const g = (t: number) => new Function('t', 'clip', `return ${e}`)(t, clip) as number
    expect(g(1)).toBeCloseTo(1)
    expect(g(2.2)).toBeCloseTo(0.25)
    expect(g(1.975)).toBeCloseTo(0.625)
    expect(g(3)).toBeCloseTo(1)
  })
})
