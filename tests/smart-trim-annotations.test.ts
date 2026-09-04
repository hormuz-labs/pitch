import { describe, expect, it } from 'vitest'
import { annotationProtectionSegments } from '../apps/api/src/render/utils/smart_trim'

describe('annotationProtectionSegments', () => {
  it('protects the draw-on lead and explanatory hold within video bounds', () => {
    expect(annotationProtectionSegments([{ videoTimeSec: 0.2 }, { videoTimeSec: 9 }], 10)).toEqual([
      { start: 0, end: 2.7 },
      { start: 8.5, end: 10 },
    ])
  })
})
