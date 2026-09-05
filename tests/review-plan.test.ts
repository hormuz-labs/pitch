/**
 * Which moments motion_review looks at. The tool is the agent's eyes on the
 * film; the plan decides that every shot is seen at its three acts and that a
 * named shot can be re-checked alone after a fix.
 */
import { describe, expect, it } from 'vitest'
import { fractionsFor, planSamples, sheetOf } from '../.pi/skills/launch-video/scripts/lib/review-plan.mjs'

const shots = [
  { id: 'hook', type: 'word-cut', dur: 2 },
  { id: 'pain', type: 'pile', dur: 3 },
  { id: 'cta', type: 'logo-cta', dur: 4 },
]
const cues = [
  { label: 'hook', time: 0 },
  { label: 'pain', time: 2 },
  { label: 'cta', time: 5 },
]

describe('planSamples', () => {
  it('sees every shot at entrance, second act and exit', () => {
    const plan = planSamples({ shots, cues, duration: 9 })
    expect(plan).toHaveLength(9)
    expect(plan.filter(s => s.shot === 'pain').map(s => s.t)).toEqual([2.6, 3.65, 4.7])
    expect(plan.map(s => s.pct).slice(0, 3)).toEqual([20, 55, 90])
    expect(plan.every((s, i) => i === 0 || s.t > plan[i - 1].t)).toBe(true)
  })

  it('reviews only the named shots after a fix', () => {
    const plan = planSamples({ shots, cues, duration: 9, only: ['cta'], perShot: 2 })
    expect(plan.map(s => s.shot)).toEqual(['cta', 'cta'])
    expect(plan.map(s => s.t)).toEqual([6.2, 8.4])
  })

  it('never seeks past the end of the film', () => {
    const plan = planSamples({ shots, cues, duration: 8.5 })
    expect(Math.max(...plan.map(s => s.t))).toBeLessThanOrEqual(8.48)
  })

  it('falls back to cumulative durations for a shot without a label', () => {
    const plan = planSamples({ shots, cues: [], duration: 9, perShot: 1 })
    expect(plan.map(s => s.t)).toEqual([1.1, 3.65, 7.2])
  })

  it('attributes an explicit time to the shot that holds it', () => {
    const plan = planSamples({ shots, cues, duration: 9, only: ['hook'], perShot: 1, times: [3.5] })
    const extra = plan.find(s => s.t === 3.5)
    expect(extra).toMatchObject({ shot: 'pain', type: 'pile', pct: 50 })
  })

  it('spreads more than three frames evenly inside the shot', () => {
    expect(fractionsFor(5).map(f => +f.toFixed(2))).toEqual([0.12, 0.32, 0.52, 0.72, 0.92])
  })
})

describe('sheetOf', () => {
  it('lays frames out row-major across 4×3 sheets', () => {
    expect(sheetOf(0, 4, 3)).toEqual({ sheet: 0, row: 0, col: 0 })
    expect(sheetOf(5, 4, 3)).toEqual({ sheet: 0, row: 1, col: 1 })
    expect(sheetOf(12, 4, 3)).toEqual({ sheet: 1, row: 0, col: 0 })
  })
})
