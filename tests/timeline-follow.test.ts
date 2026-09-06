import { describe, expect, it } from 'vitest'
import { timelineFollowScrollLeft } from '../apps/web/src/studio/timelineFollow'

describe('timeline playhead follow', () => {
  const base = {
    scrollLeft: 400,
    viewportWidth: 1000,
    scrollWidth: 3200,
    leadingInset: 104,
  }

  it('does not move while the playhead is inside the safe zone', () => {
    expect(timelineFollowScrollLeft({ ...base, contentX: 900, playing: true })).toBeNull()
  })

  it('keeps a playing timeline near the forward viewing anchor', () => {
    expect(timelineFollowScrollLeft({ ...base, contentX: 1420, playing: true })).toBeCloseTo(742.56)
  })

  it('centres an out-of-view paused seek and clamps at both ends', () => {
    expect(timelineFollowScrollLeft({ ...base, contentX: 40, playing: false })).toBe(0)
    expect(timelineFollowScrollLeft({ ...base, contentX: 3150, playing: false })).toBe(2200)
  })

  it('does nothing when all timeline content already fits', () => {
    expect(
      timelineFollowScrollLeft({
        contentX: 300,
        scrollLeft: 0,
        viewportWidth: 1000,
        scrollWidth: 900,
        leadingInset: 104,
        playing: true,
      }),
    ).toBeNull()
  })
})
