import { describe, expect, it } from 'vitest'
import { parseMediaStreamDurations } from '../apps/api/src/render/media'
import {
  findInitialBlankSegmentFromSignalStats,
  mapEventTimeThroughTrim,
  resolveAudioDuration,
} from '../apps/api/src/render/utils/smart_trim'

describe('resolveAudioDuration', () => {
  it('returns 0 when there is no audio stream at all', () => {
    expect(resolveAudioDuration([], 25.5)).toBe(0)
    expect(resolveAudioDuration(undefined, 25.5)).toBe(0)
  })

  it('uses the stream duration when ffprobe provides one', () => {
    expect(resolveAudioDuration([{ duration: '22.137208' }], 25.5)).toBeCloseTo(22.137, 3)
    expect(resolveAudioDuration([{ duration: 18.25 }], 25.5)).toBeCloseTo(18.25, 3)
  })

  it('falls back to the container duration when the stream duration is N/A (webm/mov)', () => {
    expect(resolveAudioDuration([{ duration: 'N/A' }], 25.5)).toBe(25.5)
    expect(resolveAudioDuration([{}], 25.5)).toBe(25.5)
  })
})

describe('mapEventTimeThroughTrim', () => {
  it('maps raw recording events through alignment and interior dead-air cuts', () => {
    const kept = [
      { start: 10, end: 20 },
      { start: 40, end: 50 },
    ]
    expect(mapEventTimeThroughTrim(45, 5, kept)).toBe(10)
    expect(mapEventTimeThroughTrim(50, 5, kept)).toBe(15)
  })

  it('preserves spacing between kept speech spans without collapsing', () => {
    const kept = [
      { start: 5, end: 15 },
      { start: 25, end: 35 },
      { start: 45, end: 55 },
    ]
    expect(mapEventTimeThroughTrim(5, 0, kept)).toBe(0)
    expect(mapEventTimeThroughTrim(10, 0, kept)).toBe(5)
    expect(mapEventTimeThroughTrim(25, 0, kept)).toBe(10)
    expect(mapEventTimeThroughTrim(30, 0, kept)).toBe(15)
    expect(mapEventTimeThroughTrim(45, 0, kept)).toBe(20)
    expect(mapEventTimeThroughTrim(50, 0, kept)).toBe(25)
  })
})

describe('parseMediaStreamDurations', () => {
  it('reports video and audio stream extents independently', () => {
    expect(
      parseMediaStreamDurations({
        streams: [
          { codec_type: 'video', duration: '39.5' },
          { codec_type: 'audio', duration: '57.045' },
        ],
      }),
    ).toEqual({ video: 39.5, audio: 57.045 })
  })

  it('treats absent and N/A stream durations as unavailable', () => {
    expect(
      parseMediaStreamDurations({ streams: [{ codec_type: 'video', duration: 'N/A' }] }),
    ).toEqual({ video: 0, audio: 0 })
  })
})

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
