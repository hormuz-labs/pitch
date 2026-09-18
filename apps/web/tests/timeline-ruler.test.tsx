import { describe, expect, it } from 'vitest'
import { fmtRulerTick, timelineRulerTicks } from '../src/solid/studio/helpers'

describe('adaptive timeline ruler', () => {
  it('uses finer intervals when a short timeline has room', () => {
    expect(timelineRulerTicks(2.2, 1000)).toEqual([
      0, 0.2, 0.4, 0.6, 0.8, 1, 1.2, 1.4, 1.6, 1.8, 2, 2.2,
    ])
  })

  it('reduces tick density for narrow views and long timelines', () => {
    expect(timelineRulerTicks(120, 300)).toEqual([0, 50, 100, 120])
  })

  it('formats sub-second ruler labels precisely', () => {
    expect(fmtRulerTick(0.25, 2.2)).toBe('0.25s')
    expect(fmtRulerTick(1.2, 2.2)).toBe('1.2s')
    expect(fmtRulerTick(65, 120)).toBe('1:05.0')
  })
})
