import { describe, expect, it } from 'vitest'
import {
  buildGlidingCursorChain,
  type ClickEvent,
  planCursorPath,
} from '../apps/worker/src/utils/cursor-fx'

describe('planCursorPath', () => {
  it('returns no points when there are no clicks', () => {
    expect(planCursorPath([], 0)).toEqual([])
  })

  it('shifts onto the untrimmed timeline and sorts by time', () => {
    const clicks: ClickEvent[] = [
      { videoTimeSec: 5, x: 100, y: 200 },
      { videoTimeSec: 2, x: 300, y: 400 },
    ]
    const pts = planCursorPath(clicks, 1)
    expect(pts.map(p => p.x)).toEqual([300, 100]) // re-ordered by time
    // t = videoTimeSec + trimSec - LEAD(0.08)
    expect(pts[0]!.t).toBeCloseTo(2.92, 5)
    expect(pts[1]!.t).toBeCloseTo(5.92, 5)
  })

  it('drops clicks with non-finite coordinates', () => {
    const clicks: ClickEvent[] = [
      { videoTimeSec: 1, x: Number.NaN, y: 10 },
      { videoTimeSec: 2, x: 10, y: 20 },
    ]
    const pts = planCursorPath(clicks, 0)
    expect(pts).toHaveLength(1)
    expect(pts[0]!.x).toBe(10)
  })

  it('never produces a negative time', () => {
    const pts = planCursorPath([{ videoTimeSec: 0, x: 1, y: 1 }], 0)
    expect(pts[0]!.t).toBe(0)
  })

  it('clamps off-viewport click coordinates into the frame', () => {
    const pts = planCursorPath([{ videoTimeSec: 2, x: 611, y: 1290 }], 0)
    expect(pts[0]!.y).toBeLessThanOrEqual(1080)
    expect(pts[0]!.x).toBe(611)
  })
})

describe('buildGlidingCursorChain', () => {
  it('returns null when there are no usable clicks', () => {
    expect(buildGlidingCursorChain([], 0, 1, '[0:v]', '[v_cursor]')).toBeNull()
  })

  it('emits an animated overlay using the cursor input and the given labels', () => {
    const clicks: ClickEvent[] = [
      { videoTimeSec: 2, x: 600, y: 400 },
      { videoTimeSec: 4, x: 1300, y: 420 },
    ]
    const chain = buildGlidingCursorChain(clicks, 0, 1, '[0:v]', '[v_cursor]')
    expect(chain).not.toBeNull()
    expect(chain!).toContain('[0:v][1:v]overlay=')
    expect(chain!).toContain('[v_cursor];')
    expect(chain!).toContain('enable=')
    // target coordinates appear in the eased position expressions
    expect(chain!).toContain('1300')
    expect(chain!).toContain('600')
  })

  it('includes a press dip term per click', () => {
    const chain = buildGlidingCursorChain(
      [{ videoTimeSec: 2, x: 600, y: 400 }],
      0,
      1,
      '[0:v]',
      '[v_cursor]',
    )
    // the press uses a sin() nudge centred on the click
    expect(chain!).toContain('sin(')
  })
})
