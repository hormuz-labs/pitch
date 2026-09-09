import { describe, expect, it } from 'vitest'
import { timelineFollowScrollLeft } from '../apps/web/src/solid/studio/helpers'

describe('timeline playhead follow', () => {
  const base = {
    scrollLeft: 400,
    viewportWidth: 1000,
    scrollWidth: 3200,
    leadingInset: 104,
  }

  it('does not move while the playhead is inside the safe zone', () => {
    expect(
      timelineFollowScrollLeft(
        900,
        base.scrollLeft,
        base.viewportWidth,
        base.scrollWidth,
        base.leadingInset,
        true,
      ),
    ).toBeNull()
  })

  it('keeps a playing timeline near the forward viewing anchor', () => {
    expect(
      timelineFollowScrollLeft(
        1420,
        base.scrollLeft,
        base.viewportWidth,
        base.scrollWidth,
        base.leadingInset,
        true,
      ),
    ).toBeCloseTo(742.56)
  })

  it('centres an out-of-view paused seek and clamps at both ends', () => {
    expect(
      timelineFollowScrollLeft(
        40,
        base.scrollLeft,
        base.viewportWidth,
        base.scrollWidth,
        base.leadingInset,
        false,
      ),
    ).toBe(0)
    expect(
      timelineFollowScrollLeft(
        3150,
        base.scrollLeft,
        base.viewportWidth,
        base.scrollWidth,
        base.leadingInset,
        false,
      ),
    ).toBe(2200)
  })

  it('does nothing when all timeline content already fits', () => {
    expect(timelineFollowScrollLeft(300, 0, 1000, 900, 104, true)).toBeNull()
  })
})
