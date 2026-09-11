import { describe, expect, it } from 'vitest'
import {
  breathExpr,
  breathFilter,
  breathsFromSpec,
  breathsOf,
} from '../.pi/scripts/launch-video/lib/breaths.mjs'

const gain = (breaths: object[], t: number) => {
  const clip = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x))
  return new Function('t', 'clip', 'cos', 'PI', 'min', `return ${breathExpr(breaths)}`)(
    t,
    clip,
    Math.cos,
    Math.PI,
    Math.min,
  ) as number
}

describe('music breaths', () => {
  it('defaults to a shallow dip and rejects non-finite envelopes', () => {
    const b = breathsOf({
      breaths: [{ at: 2 }, { at: -1 }, { at: 3, depth: 'bad' }, { at: 5, release: 0 }],
    })
    expect(b).toEqual([{ at: 2, dur: 0.45, depth: 0.35, attack: 0.15, release: 0.3 }])
    expect(breathsOf(null)).toEqual([])
    expect(breathFilter([])).toBeNull()
  })

  it('eases into the dip and stays down across the payoff before recovering', () => {
    const breaths = breathsOf({ breaths: [{ at: 7.5, dur: 0.45 }] })
    expect(gain(breaths, 7.3)).toBeCloseTo(1)
    expect(gain(breaths, 7.425)).toBeCloseTo(0.825)
    expect(gain(breaths, 7.7)).toBeCloseTo(0.65)
    expect(gain(breaths, 8)).toBeLessThan(0.7)
    expect(gain(breaths, 8.3)).toBeCloseTo(1)
  })

  it('does not stack overlapping dips into an accidental near-mute', () => {
    const breaths = breathsOf({
      breaths: [
        { at: 2, depth: 0.5 },
        { at: 2.1, depth: 0.5 },
      ],
    })
    expect(gain(breaths, 2.2)).toBeCloseTo(0.5)
  })

  it('takes edited beat settings from shots while retaining compiled labels', () => {
    const breaths = breathsFromSpec(
      { shots: [{ id: 'reveal', dur: 3, beats: [{ kind: 'breath', at: 1, depth: 0.2 }] }] },
      {
        cues: [{ label: 'reveal', time: 8 }],
        breaths: [{ at: 9, depth: 0.75 }],
      },
    )
    expect(breaths[0]).toMatchObject({ at: 9, depth: 0.2 })
    expect(
      breathsFromSpec({ shots: [{ id: 'reveal', dur: 3 }] }, { breaths: [{ at: 1 }] }),
    ).toEqual([])
  })
})
