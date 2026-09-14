import { describe, expect, it } from 'vitest'
import { renderTimeline } from '../.pi/scripts/launch-video/lib/render-timeline.mjs'

const source = { sourceBytes: 123_456, sourceMtimeMs: 1_789_012.5 }

describe('renderTimeline', () => {
  it('turns shot labels into spans and excludes colon-qualified beat labels', () => {
    const timeline = renderTimeline(
      [
        { label: 'pain:reveal', time: 3 },
        { label: 'cta', time: 7 },
        { label: 'hook', time: 0 },
        { label: 'pain', time: 2 },
      ],
      { from: 0, to: 10, ...source },
    )

    expect(timeline).toEqual({
      durationSec: 10,
      beats: [
        { start: 0, dur: 2, text: 'hook', type: 'shot' },
        { start: 2, dur: 5, text: 'pain', type: 'shot' },
        { start: 7, dur: 3, text: 'cta', type: 'shot' },
      ],
      ...source,
    })
  })

  it('clips and rebases a segment that starts and ends inside shots', () => {
    const timeline = renderTimeline(
      [
        { label: 'hook', time: 0 },
        { label: 'pain', time: 2 },
        { label: 'proof', time: 5 },
        { label: 'cta', time: 8 },
      ],
      { from: 3, to: 7, ...source },
    )

    expect(timeline.durationSec).toBe(4)
    expect(timeline.beats).toEqual([
      { start: 0, dur: 2, text: 'pain', type: 'shot' },
      { start: 2, dur: 2, text: 'proof', type: 'shot' },
    ])
  })

  it('keeps hostile labels as plain text', () => {
    const label = '<img src=x onerror=alert(1)>; globalThis.pwned = true'
    expect(renderTimeline([{ label, time: 0 }], { from: 0, to: 1, ...source }).beats).toEqual([
      { start: 0, dur: 1, text: label, type: 'shot' },
    ])
  })

  it.each([
    [[{ label: 'shot', time: Number.NaN }], { from: 0, to: 1, ...source }],
    [[{ label: 'shot', time: Number.POSITIVE_INFINITY }], { from: 0, to: 1, ...source }],
    [[{ label: 'shot', time: 0 }], { from: Number.NaN, to: 1, ...source }],
    [[{ label: 'shot', time: 0 }], { from: 1, to: 1, ...source }],
    [[{ label: 'shot', time: 0 }], { from: 0, to: 1, ...source, sourceBytes: -1 }],
    [[{ label: 'shot', time: 0 }], { from: 0, to: 1, ...source, sourceMtimeMs: Number.NaN }],
  ])('rejects invalid timing or source metadata', (cues, options) => {
    expect(() => renderTimeline(cues, options)).toThrow()
  })

  it('rejects malformed cues instead of emitting ambiguous metadata', () => {
    expect(() => renderTimeline([{ label: 42, time: 0 }], { from: 0, to: 1, ...source })).toThrow()
    expect(() => renderTimeline(null, { from: 0, to: 1, ...source })).toThrow()
  })
})
