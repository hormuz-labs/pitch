/**
 * The 60fps option for demo and recording renders. A screen recording is
 * usually 30fps; asking for 60 runs the zoom/pan camera and the title cards
 * at 60 (the source frames are repeated), and anything else keeps the
 * recording's own rate.
 */
import { describe, expect, it } from 'vitest'
import { outputFps } from '../apps/api/src/render/media.js'
import { buildContinuousZoomFilter } from '../apps/api/src/render/utils/zoom-filter.js'

describe('outputFps', () => {
  it('keeps the source rate unless 30 or 60 is asked for', () => {
    expect(outputFps(undefined, 30)).toBe(30)
    expect(outputFps('60', 30)).toBe(60)
    expect(outputFps(60, 24)).toBe(60)
    expect(outputFps(30, 60)).toBe(30)
    expect(outputFps('silky', 30)).toBe(30)
    expect(outputFps(120, 30)).toBe(30)
  })
})

describe('the camera runs at the output rate', () => {
  it('resamples to constant 60fps before and inside zoompan', () => {
    const f = buildContinuousZoomFilter([], 0, '[0:v]', 60)
    expect(f).toContain('fps=60,setpts')
    expect(f).toContain(':fps=60[zoomedv]')
    expect(f).not.toContain('fps=30')
  })
})
