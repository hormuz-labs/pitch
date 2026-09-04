import { describe, expect, it } from 'vitest'
import {
  clampCameraCenter,
  computeScrollTargetY,
  computeZoomFraming,
  cropWindow,
  FRAME_H,
  FRAME_W,
  fitZoomForBox,
  isBoxFullyVisible,
} from '../apps/api/src/render/utils/zoom-framing.js'

const VIEW = FRAME_H // 1080 viewport height for window scrolling

describe('computeScrollTargetY — scroll the element to the vertical centre', () => {
  it('far below the fold → scrolls so the element lands dead-centre (540)', () => {
    // element 2000px down the document, top of page
    const p = computeScrollTargetY(2000, 60, 0, VIEW, 8000)
    expect(p.willScroll).toBe(true)
    expect(p.elementViewportCenterAfter).toBeCloseTo(540, 0)
  })

  it('THE FAILING CASE: partially visible at the bottom edge → scrolls to centre', () => {
    // element top at 845 (visible but low), used to be skipped by the lenient "in view"
    const p = computeScrollTargetY(845, 40, 0, VIEW, 8000)
    expect(p.willScroll).toBe(true)
    expect(p.elementViewportCenterAfter).toBeCloseTo(540, 0)
  })

  it('above the fold (need to scroll up) → scrolls up to centre', () => {
    const p = computeScrollTargetY(-600, 50, 3000, VIEW, 8000)
    expect(p.willScroll).toBe(true)
    expect(p.delta).toBeLessThan(0) // scrolls up
    expect(p.elementViewportCenterAfter).toBeCloseTo(540, 0)
  })

  it('already centred → no scroll', () => {
    const p = computeScrollTargetY(520, 40, 1000, VIEW, 8000) // centre at 540
    expect(p.willScroll).toBe(false)
    expect(p.elementViewportCenterAfter).toBeCloseTo(540, 0)
  })

  it('within the 8% dead-zone → no micro-scroll', () => {
    const p = computeScrollTargetY(560, 40, 1000, VIEW, 8000) // centre 580, 40px off — < 86px
    expect(p.willScroll).toBe(false)
  })

  it('EDGE: last element on the page (cannot centre) → scrolls to max, stays low but visible', () => {
    // doc 6000 tall, viewport 1080 → maxScroll 4920. Element near the very bottom.
    const docH = 6000
    const scrollY = 4920 // already at the bottom
    const rectTop = 1000 // element sits low in the viewport, document pos 5920
    const p = computeScrollTargetY(rectTop, 40, scrollY, VIEW, docH)
    expect(p.target).toBe(4920) // clamped to maxScroll, can't scroll further
    expect(p.willScroll).toBe(false)
    // can't be centred; stays where it is (low) but on screen
    expect(p.elementViewportCenterAfter).toBeGreaterThan(VIEW / 2)
    expect(p.elementViewportCenterAfter).toBeLessThan(VIEW)
  })

  it('EDGE: very top / nav element at scroll 0 → cannot scroll up, stays near top', () => {
    const p = computeScrollTargetY(20, 40, 0, VIEW, 8000) // document centre 40
    expect(p.target).toBe(0)
    expect(p.willScroll).toBe(false)
    expect(p.elementViewportCenterAfter).toBeCloseTo(40, 0)
  })

  it('EDGE: short non-scrolling page → never scrolls', () => {
    const p = computeScrollTargetY(900, 40, 0, VIEW, 900) // docHeight < viewport
    expect(p.target).toBe(0)
    expect(p.willScroll).toBe(false)
  })

  it('clamps target within [0, maxScroll] for every input', () => {
    for (const rectTop of [-5000, -100, 0, 500, 1080, 5000, 20000]) {
      const p = computeScrollTargetY(rectTop, 50, 1500, VIEW, 8000)
      expect(p.target).toBeGreaterThanOrEqual(0)
      expect(p.target).toBeLessThanOrEqual(8000 - VIEW)
    }
  })
})

describe('fitZoomForBox — fit the element, never dive into a container', () => {
  it('small precise control → tight zoom (capped at 2.2)', () => {
    expect(fitZoomForBox(85, 34)).toBeCloseTo(2.2, 1)
  })
  it('big full-width section → loose zoom (floored at 1.3)', () => {
    expect(fitZoomForBox(1400, 700)).toBeCloseTo(1.3, 1)
  })
  it('medium card → in-between', () => {
    const z = fitZoomForBox(700, 300)
    expect(z).toBeGreaterThan(1.3)
    expect(z).toBeLessThan(2.2)
  })
  it('degenerate box → safe default', () => {
    expect(fitZoomForBox(0, 0)).toBe(1.7)
  })
})

describe('clampCameraCenter — keep the zoom window inside the frame', () => {
  it('centred element → unchanged', () => {
    const c = clampCameraCenter(960, 540, 1.7)
    expect(c.cx).toBeCloseTo(960, 0)
    expect(c.cy).toBeCloseTo(540, 0)
  })
  it('element near bottom edge → camera pulled up so window stays in frame', () => {
    const c = clampCameraCenter(960, 1020, 1.7)
    expect(c.cy).toBeLessThan(1020)
    expect(c.cy).toBeCloseTo(1080 - 540 / 1.7, 0)
  })
  it('element near right edge → camera pulled left', () => {
    const c = clampCameraCenter(1900, 540, 1.7)
    expect(c.cx).toBeLessThan(1900)
    expect(c.cx).toBeCloseTo(1920 - 960 / 1.7, 0)
  })
})

describe('computeZoomFraming — full recorder decision', () => {
  it('honours an explicit zoom for a small element', () => {
    const f = computeZoomFraming({ x: 900, y: 520, w: 90, h: 40 }, 2.0)
    expect(f.zoom).toBeCloseTo(2.0, 1)
  })
  it('caps an explicit 2.2x on a big container down to its fit', () => {
    const f = computeZoomFraming({ x: 200, y: 100, w: 1400, h: 700 }, 2.2)
    expect(f.zoom).toBeLessThan(2.2)
    expect(f.zoom).toBeCloseTo(1.3, 1)
  })
  it('cursor anchor (rawCx/rawCy) is the element centre, not the clamped camera', () => {
    const f = computeZoomFraming({ x: 900, y: 1000, w: 80, h: 40 }) // low element
    expect(f.rawCy).toBeCloseTo(1020, 0) // cursor on the element
    expect(f.cy).toBeLessThan(f.rawCy) // camera pulled up
  })
})

describe('INVARIANT: after framing, the element is fully visible in the camera window', () => {
  // Sweep elements all over the frame, with assorted sizes, at assorted requested zooms.
  const positions = [
    { x: 50, y: 30 }, // top-left corner
    { x: 1700, y: 30 }, // top-right
    { x: 960, y: 540 }, // centre
    { x: 50, y: 1000 }, // bottom-left
    { x: 1700, y: 1000 }, // bottom-right
    { x: 960, y: 1040 }, // bottom edge
    { x: 960, y: 20 }, // top edge
  ]
  const sizes = [
    { w: 60, h: 30 },
    { w: 200, h: 120 },
    { w: 600, h: 300 },
  ]
  const zooms = [undefined, 1.5, 2.0, 2.2]
  for (const p of positions) {
    for (const s of sizes) {
      for (const rz of zooms) {
        const box = {
          x: Math.min(p.x, FRAME_W - s.w),
          y: Math.min(p.y, FRAME_H - s.h),
          w: s.w,
          h: s.h,
        }
        it(`box ${JSON.stringify(box)} @zoom=${rz} stays fully framed`, () => {
          const f = computeZoomFraming(box, rz)
          // The element must fit the window at this zoom for full visibility; fit-zoom
          // guarantees it unless the element is larger than `fill` of the frame, in
          // which case it is at least mostly framed — assert it fits when it can.
          const win = cropWindow(f.cx, f.cy, f.zoom)
          const fits = box.w <= win.w + 0.5 && box.h <= win.h + 0.5
          if (fits) {
            expect(isBoxFullyVisible(box, f.cx, f.cy, f.zoom)).toBe(true)
          }
          // The camera window itself never leaves the frame.
          expect(win.x).toBeGreaterThanOrEqual(-0.5)
          expect(win.y).toBeGreaterThanOrEqual(-0.5)
          expect(win.x + win.w).toBeLessThanOrEqual(FRAME_W + 0.5)
          expect(win.y + win.h).toBeLessThanOrEqual(FRAME_H + 0.5)
        })
      }
    }
  }
})
