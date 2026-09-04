import { describe, expect, it } from 'vitest'
import { describeBeat, scenesFromTimeline } from '../apps/studio/src/render/utils/beats.js'
import { mapThroughKeptSegments } from '../apps/studio/src/render/utils/smart_trim.js'
import { inspectorTag } from '../apps/studio/src/routes/files.js'

describe('mapThroughKeptSegments', () => {
  const kept = [
    { start: 2, end: 6 }, // 0 → 4 on the output
    { start: 10, end: 13 }, // 4 → 7 on the output
  ]

  it('shifts a time by the dead air removed before it', () => {
    expect(mapThroughKeptSegments(2, kept)).toBe(0)
    expect(mapThroughKeptSegments(4.5, kept)).toBe(2.5)
    expect(mapThroughKeptSegments(10, kept)).toBe(4)
    expect(mapThroughKeptSegments(12, kept)).toBe(6)
  })

  it('snaps a time inside a dropped gap onto the cut', () => {
    expect(mapThroughKeptSegments(0, kept)).toBe(0)
    expect(mapThroughKeptSegments(8, kept)).toBe(4)
  })

  it('clamps past the end to the output duration', () => {
    expect(mapThroughKeptSegments(99, kept)).toBe(7)
  })

  it('is the identity when nothing was trimmed', () => {
    expect(mapThroughKeptSegments(5, [{ start: 0, end: 30 }])).toBe(5)
  })
})

describe('scenesFromTimeline', () => {
  it('has no scenes without a timeline', () => {
    expect(scenesFromTimeline(null)).toEqual([])
    expect(scenesFromTimeline({ durationSec: 10, beats: [] })).toEqual([])
  })

  it('tiles the whole video, each beat running until the next', () => {
    const scenes = scenesFromTimeline({
      durationSec: 20,
      beats: [
        { start: 4, dur: 3, text: 'Here is the dashboard' },
        { start: 11, dur: 4, text: 'And this is pricing' },
      ],
    })
    expect(scenes.map(s => [s.start, s.end])).toEqual([
      [0, 4],
      [4, 11],
      [11, 20],
    ])
    // The gap before the first line is the intro card, not narration.
    expect(scenes[0]!.label).toBe('Opening')
    expect(scenes[1]!.label).toBe('Here is the dashboard')
    expect(scenes.map(s => s.index)).toEqual([1, 2, 3])
    expect(new Set(scenes.map(s => s.id)).size).toBe(3)
  })

  it('starts at the first beat when there is no opening gap', () => {
    const scenes = scenesFromTimeline({
      durationSec: 8,
      beats: [{ start: 0.2, dur: 2, text: 'Straight in' }],
    })
    expect(scenes).toHaveLength(1)
    expect(scenes[0]!.start).toBe(0.2)
    expect(scenes[0]!.end).toBe(8)
  })

  it('orders beats that arrive out of sequence', () => {
    const scenes = scenesFromTimeline({
      durationSec: 12,
      beats: [
        { start: 6, dur: 1, text: 'second' },
        { start: 0.5, dur: 1, text: 'first' },
      ],
    })
    expect(scenes.map(s => s.label)).toEqual(['first', 'second'])
  })
})

describe('describeBeat', () => {
  const scenes = scenesFromTimeline({
    durationSec: 10,
    beats: [{ start: 0, dur: 2, text: 'Welcome to Pitch' }],
  })

  it('quotes the narration of the selected moment', () => {
    expect(describeBeat(scenes, 'beat-1')).toContain('"Welcome to Pitch"')
    expect(describeBeat(scenes, 'beat-1')).toContain('0.0s–10.0s')
  })

  it('ignores ids that are not beats', () => {
    expect(describeBeat(scenes, 'shot-3')).toBeNull()
    expect(describeBeat(scenes, null)).toBeNull()
  })
})

describe('inspectorTag', () => {
  it('points at the engine relative to the page, so a proxy prefix survives', () => {
    // Page at <prefix>/files/projects/<internal>/deck.html
    expect(inspectorTag('/deck.html', '.slide')).toContain('src="../../engine/js/inspector.js"')
    // A page in a subdirectory has to climb one more level.
    expect(inspectorTag('/build/output.html', '.slide')).toContain(
      'src="../../../engine/js/inspector.js"',
    )
  })

  it('never emits an absolute path (it would escape the /api prefix in dev)', () => {
    expect(inspectorTag('/deck.html', '.slide')).not.toContain('src="/files')
  })

  it('carries the preview token through to the script request', () => {
    expect(inspectorTag('/deck.html', '.slide', 'a b&c')).toContain(
      'engine/js/inspector.js?token=a%20b%26c',
    )
  })

  it('passes the container selector to the injected inspector', () => {
    expect(inspectorTag('/deck.html', '.page')).toContain('{container:".page"}')
  })
})
