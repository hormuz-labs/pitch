import { describe, expect, it } from 'vitest'
import {
  buildGlidingCursorChain,
  type ClickEvent,
  planCursorPath,
  planHandWindows,
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

describe('planHandWindows', () => {
  it('holds the hand from just before arrival until the next glide begins', () => {
    // Two pressable rest points at t=2 and t=5; GLIDE=0.75, HAND_APPROACH=0.15.
    const windows = planHandWindows([
      { t: 2, x: 0, y: 0, hand: true },
      { t: 5, x: 0, y: 0, hand: true },
    ])
    expect(windows).toHaveLength(2)
    // first: [2-0.15, 5-0.75] = [1.85, 4.25]
    expect(windows[0]!.start).toBeCloseTo(1.85, 5)
    expect(windows[0]!.end).toBeCloseTo(4.25, 5)
    // last: [5-0.15, 5+HAND_TAIL(1.2)] = [4.85, 6.2]
    expect(windows[1]!.start).toBeCloseTo(4.85, 5)
    expect(windows[1]!.end).toBeCloseTo(6.2, 5)
  })

  it('only makes a window for pressable (hand) targets, not fields/content', () => {
    // Middle point is a non-hand target (e.g. a text field) — no window for it.
    const windows = planHandWindows([
      { t: 2, x: 0, y: 0, hand: true },
      { t: 5, x: 0, y: 0, hand: false },
      { t: 8, x: 0, y: 0, hand: true },
    ])
    expect(windows).toHaveLength(2)
    // the first window still departs when the glide toward the NEXT point (t=5) starts
    expect(windows[0]!.end).toBeCloseTo(5 - 0.75, 5)
    expect(windows[1]!.start).toBeCloseTo(8 - 0.15, 5)
  })

  it('returns no windows when no target is pressable', () => {
    expect(
      planHandWindows([
        { t: 2, x: 0, y: 0, hand: false },
        { t: 5, x: 0, y: 0, hand: false },
      ]),
    ).toEqual([])
  })

  it('never lets consecutive windows overlap (so the enable sum stays 0/1)', () => {
    // Very close pressable clicks would otherwise overlap once padded.
    const windows = planHandWindows([
      { t: 2, x: 0, y: 0, hand: true },
      { t: 2.1, x: 0, y: 0, hand: true },
      { t: 2.2, x: 0, y: 0, hand: true },
    ])
    for (let i = 1; i < windows.length; i++) {
      expect(windows[i]!.start).toBeGreaterThanOrEqual(windows[i - 1]!.end)
    }
  })
})

describe('buildGlidingCursorChain', () => {
  it('returns null when there are no usable clicks', () => {
    expect(buildGlidingCursorChain([], 0, 1, 2, '[0:v]', '[v_cursor]')).toBeNull()
  })

  it('chains an arrow overlay then a hand overlay sharing one path', () => {
    const clicks: ClickEvent[] = [
      { videoTimeSec: 2, x: 600, y: 400, hand: true },
      { videoTimeSec: 4, x: 1300, y: 420, hand: true },
    ]
    const chain = buildGlidingCursorChain(clicks, 0, 1, 2, '[0:v]', '[v_cursor]')
    expect(chain).not.toBeNull()
    // arrow ([1:v]) draws first into an intermediate label, hand ([2:v]) on top
    expect(chain!).toContain('[0:v][1:v]overlay=')
    expect(chain!).toContain('[v_cursor_arrow];')
    expect(chain!).toContain('[v_cursor_arrow][2:v]overlay=')
    expect(chain!).toContain('[v_cursor];')
    // complementary enable gates: arrow suppressed while the hand rests
    expect(chain!).toContain('between(t,')
    expect(chain!).toContain('*(1-(')
    // target coordinates appear in the eased position expressions
    expect(chain!).toContain('1300')
    expect(chain!).toContain('600')
  })

  it('shows no hand overlay window when no click is a button/link', () => {
    const clicks: ClickEvent[] = [
      { videoTimeSec: 2, x: 600, y: 400 }, // hand undefined -> arrow only
      { videoTimeSec: 4, x: 1300, y: 420, hand: false }, // a field -> arrow only
    ]
    const chain = buildGlidingCursorChain(clicks, 0, 1, 2, '[0:v]', '[v_cursor]')
    expect(chain).not.toBeNull()
    // the hand overlay still exists in the graph but its gate is the constant 0,
    // and the arrow is always on (1 - 0). (between(t,…) still appears in the press dip.)
    expect(chain!).toContain("enable='(0)'[v_cursor];")
    expect(chain!).toContain('*(1-(0))')
  })

  it('includes a press dip term per click', () => {
    const chain = buildGlidingCursorChain(
      [{ videoTimeSec: 2, x: 600, y: 400, hand: true }],
      0,
      1,
      2,
      '[0:v]',
      '[v_cursor]',
    )
    // the press uses a sin() nudge centred on the click
    expect(chain!).toContain('sin(')
  })
})
