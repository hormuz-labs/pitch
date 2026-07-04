import { describe, expect, it } from 'vitest'
import { findInitialBlankSegmentFromSignalStats } from '../apps/worker/src/utils/smart_trim'

const frame = (
  pts: number,
  yMin: number,
  yMax: number,
  satAvg = 0,
) => `frame:${pts} pts:${pts} pts_time:${pts}
lavfi.signalstats.YMIN=${yMin}
lavfi.signalstats.YMAX=${yMax}
lavfi.signalstats.SATAVG=${satAvg}`

describe('findInitialBlankSegmentFromSignalStats', () => {
  it('returns the initial white-screen span before real content appears', () => {
    const log = [
      frame(0, 235, 235),
      frame(0.5, 235, 235),
      frame(1, 235, 235),
      frame(1.5, 16, 235, 22),
      frame(2, 12, 235, 35),
    ].join('\n')

    expect(findInitialBlankSegmentFromSignalStats(log)).toEqual({ start: 0, end: 1.5 })
  })

  it('handles FFmpeg metadata lines with filter prefixes', () => {
    const log = [
      `[Parsed_metadata_2 @ 0x123] ${frame(0, 235, 235).split('\n').join('\n[Parsed_metadata_2 @ 0x123] ')}`,
      `[Parsed_metadata_2 @ 0x123] ${frame(1, 20, 235, 18).split('\n').join('\n[Parsed_metadata_2 @ 0x123] ')}`,
    ].join('\n')

    expect(findInitialBlankSegmentFromSignalStats(log)).toEqual({ start: 0, end: 1 })
  })

  it('returns the initial black-screen span before real content appears', () => {
    const log = [frame(0, 16, 16), frame(0.5, 16, 18), frame(1, 4, 225, 18)].join('\n')

    expect(findInitialBlankSegmentFromSignalStats(log)).toEqual({ start: 0, end: 1 })
  })

  it('does not trim when the first frame already has visible content', () => {
    const log = [frame(0, 12, 235, 28), frame(0.5, 12, 235, 30)].join('\n')

    expect(findInitialBlankSegmentFromSignalStats(log)).toBeNull()
  })

  it('does not trim when the scan never reaches visible content', () => {
    const log = [frame(0, 235, 235), frame(0.5, 235, 235), frame(1, 235, 235)].join('\n')

    expect(findInitialBlankSegmentFromSignalStats(log)).toBeNull()
  })
})
