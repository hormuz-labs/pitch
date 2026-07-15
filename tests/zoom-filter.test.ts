import { describe, expect, it } from 'vitest'
import {
  buildContinuousZoomFilter,
  coalesceEvents,
  DEFAULT_ZOOM,
  fitZoomForBox,
  PAN_DURATION,
  planCameraMoves,
  type ZoomEvent,
} from '../apps/worker/src/utils/zoom-filter'

describe('fitZoomForBox', () => {
  it('zooms tighter on small elements (clamped to 2.2)', () => {
    expect(fitZoomForBox(40, 20)).toBe(2.2)
  })

  it('zooms looser on large elements (clamped to 1.3)', () => {
    expect(fitZoomForBox(1800, 1000)).toBe(1.3)
  })

  it('scales in between for mid-size elements', () => {
    // element ~480x270 -> fit = min(1920*0.5/480, 1080*0.5/270) = min(2.0, 2.0) = 2.0
    expect(fitZoomForBox(480, 270)).toBeCloseTo(2.0, 3)
  })

  it('falls back to the default zoom for an invalid box', () => {
    expect(fitZoomForBox(0, 0)).toBe(DEFAULT_ZOOM)
    expect(fitZoomForBox(Number.NaN, 100)).toBe(DEFAULT_ZOOM)
  })
})

describe('planCameraMoves', () => {
  it('returns no moves for an empty event stream', () => {
    expect(planCameraMoves([])).toEqual([])
  })

  it('builds a zoom-in then a static hold then zoom-out (no Ken Burns drift)', () => {
    const events: ZoomEvent[] = [
      { type: 'in', videoTimeSec: 2, x: 600, y: 400, zoom: 1.7 },
      { type: 'out', videoTimeSec: 6 },
    ]
    const moves = planCameraMoves(events)
    // Just the two ramps — no drift move inserted across the hold.
    expect(moves).toHaveLength(2)

    // 1) zoom in from 1x to 1.7x, completing at the event time
    expect(moves[0]!.z0).toBe(1)
    expect(moves[0]!.z1).toBeCloseTo(1.7, 5)
    expect(moves[0]!.t1).toBe(2)

    // 2) zoom out back to 1x, starting from the held (un-drifted) 1.7x
    expect(moves[1]!.z0).toBeCloseTo(1.7, 5)
    expect(moves[1]!.z1).toBe(1)
  })

  it('pans (holds zoom, moves center) when zooming in while already zoomed', () => {
    const events: ZoomEvent[] = [
      { type: 'in', videoTimeSec: 2, x: 600, y: 400, zoom: 1.7 },
      { type: 'in', videoTimeSec: 2.5, x: 1300, y: 420, zoom: 1.7 },
    ]
    const moves = planCameraMoves(events)

    // moves[1] is the pan.
    const pan = moves[1]!
    expect(pan.z0).toBeCloseTo(1.7, 5)
    expect(pan.z1).toBeCloseTo(1.7, 5) // zoom held constant => a pan, not a re-zoom
    expect(pan.cx0).toBe(600)
    expect(pan.cx1).toBe(1300) // center glides to the new target
  })

  it('ignores zoom_in events with non-finite coordinates', () => {
    const events: ZoomEvent[] = [{ type: 'in', videoTimeSec: 2, x: Number.NaN, y: 400, zoom: 1.7 }]
    expect(planCameraMoves(events)).toEqual([])
  })

  it('ignores a zoom_out with no preceding zoom_in', () => {
    expect(planCameraMoves([{ type: 'out', videoTimeSec: 3 }])).toEqual([])
  })

  it('clamps an off-viewport target into the frame (e.g. an element below the fold)', () => {
    const moves = planCameraMoves([{ type: 'in', videoTimeSec: 2, x: 611, y: 1290, zoom: 2 }])
    expect(moves[0]!.cy1).toBeLessThanOrEqual(1080)
    expect(moves[0]!.cx1).toBe(611)
  })
})

describe('coalesceEvents (smoothing bunched live events)', () => {
  it('collapses a rapid burst of zoom-ins to the final target', () => {
    const events: ZoomEvent[] = [
      { type: 'in', videoTimeSec: 2.0, x: 300, y: 200, zoom: 1.7 },
      { type: 'in', videoTimeSec: 2.15, x: 700, y: 300, zoom: 1.7 },
      { type: 'in', videoTimeSec: 2.28, x: 1300, y: 420, zoom: 1.7 },
    ]
    const out = coalesceEvents(events)
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ x: 1300, y: 420 }) // glides straight to the last
  })

  it('drops a zoom-out immediately followed by a zoom-in (becomes one pan)', () => {
    const events: ZoomEvent[] = [
      { type: 'in', videoTimeSec: 2.0, x: 300, y: 200, zoom: 1.7 },
      { type: 'out', videoTimeSec: 4.0 },
      { type: 'in', videoTimeSec: 4.2, x: 1300, y: 420, zoom: 1.7 },
    ]
    const out = coalesceEvents(events)
    expect(out.map(e => e.type)).toEqual(['in', 'in'])
    // planCameraMoves then renders the second as a pan (zoom held), not out+in
    const moves = planCameraMoves(events)
    expect(moves[1]!.z0).toBeCloseTo(1.7, 5)
    expect(moves[1]!.z1).toBeCloseTo(1.7, 5)
  })

  it('drops a dart-in-and-out blip zoom-in', () => {
    const events: ZoomEvent[] = [
      { type: 'in', videoTimeSec: 2.0, x: 300, y: 200, zoom: 1.7 },
      { type: 'out', videoTimeSec: 2.2 },
    ]
    expect(coalesceEvents(events).map(e => e.type)).toEqual(['out'])
    // with no active zoom the lone out is a no-op → no camera move at all
    expect(planCameraMoves(events)).toEqual([])
  })

  it('leaves genuinely-spaced field-to-field pans intact', () => {
    const events: ZoomEvent[] = [
      { type: 'in', videoTimeSec: 2.0, x: 300, y: 200, zoom: 1.7 },
      { type: 'in', videoTimeSec: 2.0 + PAN_DURATION + 0.2, x: 1300, y: 420, zoom: 1.7 },
    ]
    expect(coalesceEvents(events)).toHaveLength(2)
  })
})

describe('buildContinuousZoomFilter', () => {
  it('produces an identity (z=1) zoompan when there are no zoom events', () => {
    const f = buildContinuousZoomFilter([], 0)
    expect(f).toContain('zoompan=')
    expect(f).toContain('[zoomedv]')
    expect(f).toContain("z='1")
    expect(f).not.toContain('trim=start=')
  })

  it('adds a trim clause when trimSec > 0', () => {
    const f = buildContinuousZoomFilter([], 1.25)
    expect(f).toContain('trim=start=1.250')
  })

  it('embeds the target zoom in the expression', () => {
    const f = buildContinuousZoomFilter(
      [{ type: 'in', videoTimeSec: 2, x: 600, y: 400, zoom: 1.9 }],
      0,
    )
    expect(f).toContain('1.900')
  })
})
