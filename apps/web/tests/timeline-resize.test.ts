import { describe, expect, it } from 'vitest'
import {
  clampTimelineHeight,
  MIN_TIMELINE_HEIGHT,
  timelineHeightLimit,
  timelineRowsHeight,
} from '../src/solid/studio/timelineResize'

describe('timeline resize bounds', () => {
  it('caps the tray at its rendered toolbar and track content', () => {
    const rows = [
      { offsetHeight: 24 },
      { offsetHeight: 86 },
      { offsetHeight: 38 },
      { offsetHeight: 36 },
    ]
    expect(timelineRowsHeight(rows)).toBe(184)
    expect(timelineHeightLimit(900, timelineRowsHeight(rows), 42)).toBe(256)
    expect(clampTimelineHeight(700, 256)).toBe(256)
  })

  it('also preserves enough room for the preview', () => {
    expect(timelineHeightLimit(500, 420, 42)).toBe(300)
  })

  it('never collapses below the usable timeline minimum', () => {
    expect(timelineHeightLimit(260, 20, 20)).toBe(MIN_TIMELINE_HEIGHT)
    expect(clampTimelineHeight(20, 260)).toBe(MIN_TIMELINE_HEIGHT)
  })
})
