/**
 * What a scoped motion_audit samples. Re-checking one shot must read the same
 * clock as the full audit, and never see a still stretch across the gap
 * between two spans.
 */
import { describe, expect, it } from 'vitest'
import {
  quietStretches,
  sampleTimes,
  spansFor,
} from '../.pi/scripts/launch-video/lib/audit-span.mjs'

const cues = [
  { label: 'hook', time: 0 },
  { label: 'pain', time: 2 },
  { label: 'tools', time: 5 },
  { label: 'cta', time: 8 },
]

describe('spansFor', () => {
  it('is the whole film when no shot is named', () => {
    expect(spansFor({ cues, duration: 12 })).toEqual([
      { start: 0, end: 12, ids: ['hook', 'pain', 'tools', 'cta'] },
    ])
  })

  it('names one shot as its own span, to the film end for the last one', () => {
    expect(spansFor({ cues, duration: 12, only: ['cta'] })).toEqual([
      { start: 8, end: 12, ids: ['cta'] },
    ])
  })

  it('merges adjacent shots and keeps separate ones apart', () => {
    expect(spansFor({ cues, duration: 12, only: ['tools', 'cta'] })).toEqual([
      { start: 5, end: 12, ids: ['tools', 'cta'] },
    ])
    expect(spansFor({ cues, duration: 12, only: ['cta', 'hook'] })).toEqual([
      { start: 0, end: 2, ids: ['hook'] },
      { start: 8, end: 12, ids: ['cta'] },
    ])
  })
})

describe('sampleTimes', () => {
  it('sits on the full audit grid and starts one grid point before the span', () => {
    const [ts] = sampleTimes([{ start: 8.1, end: 9, ids: ['cta'] }], 0.25, 12)
    expect(ts).toEqual([8, 8.25, 8.5, 8.75, 9])
  })

  it('never passes the film end', () => {
    const [ts] = sampleTimes([{ start: 11.6, end: 11.9, ids: ['x'] }], 0.25, 11.9)
    expect(ts[ts.length - 1]).toBe(11.9)
  })
})

describe('quietStretches', () => {
  it('measures the still stretch to the end of the span', () => {
    const { longest, gaps } = quietStretches([8.25, 9], [{ start: 8, end: 12, ids: ['cta'] }], 1.5)
    expect(longest).toEqual({ dur: 3, from: 9, to: 12 })
    expect(gaps).toEqual([[9, 12]])
  })

  it('does not run a stretch across the gap between two spans', () => {
    const spans = [
      { start: 0, end: 2, ids: ['hook'] },
      { start: 8, end: 12, ids: ['cta'] },
    ]
    const { longest } = quietStretches([0.5, 1.5, 8.5, 11.5], spans, 1.5)
    expect(longest.dur).toBe(3)
    expect(longest.from).toBe(8.5)
  })
})
