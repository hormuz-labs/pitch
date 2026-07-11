// Pure, dependency-free framing math shared by the recorder (demo-generator tools) and
// the renderer (zoom-filter). Kept here so every rule below is unit-testable in
// isolation — this is the logic that decides where the page scrolls and where the
// camera points, which is the thing that most visibly breaks a demo.
//
// Two levers bring a target into "proper view":
//   1. PAGE SCROLL  — moves document content; bounded by the scroll range.
//   2. CAMERA PAN   — pans the zoom window over the recorded frame; bounded by it.
// The rule: scroll to put the element at the vertical centre when the page can; when
// it can't (document edge / non-scrolling page) pan the camera as far as possible
// while keeping the element fully inside the frame.

export const FRAME_W = 1920
export const FRAME_H = 1080

// Don't bother scrolling for a sub-8%-of-viewport nudge — it's already centred enough
// and a micro-scroll just looks fidgety.
export const SCROLL_CENTER_DEADZONE = 0.08

export interface Box {
  x: number
  y: number
  w: number
  h: number
}

export interface ScrollPlan {
  /** Absolute scroll position to animate to (clamped to [0, maxScroll]). */
  target: number
  /** Signed pixels to scroll (target - current). */
  delta: number
  /** Whether we will actually animate a scroll (delta past the dead-zone). */
  willScroll: boolean
  /** Where the element's vertical centre ends up in the viewport afterwards. */
  elementViewportCenterAfter: number
}

/**
 * Decide how far to scroll so an element lands at the vertical centre of its scroller,
 * clamped to the scroll range. Mirrors the window branch of SMOOTH_SCROLL_JS exactly.
 *
 * @param rectTop   element's getBoundingClientRect().top (viewport-relative, may be < 0 or > viewH)
 * @param rectH     element height
 * @param scrollY   current scroll position of the scroller
 * @param viewH     scroller's visible height (viewport height)
 * @param docHeight total scrollable content height
 */
export function computeScrollTargetY(
  rectTop: number,
  rectH: number,
  scrollY: number,
  viewH: number,
  docHeight: number,
): ScrollPlan {
  const docCenter = rectTop + scrollY + rectH / 2 // element centre in document space
  const maxScroll = Math.max(0, docHeight - viewH)
  const target = Math.max(0, Math.min(maxScroll, docCenter - viewH / 2))
  const delta = target - scrollY
  const willScroll = Math.abs(delta) >= viewH * SCROLL_CENTER_DEADZONE
  return {
    target,
    delta,
    willScroll,
    elementViewportCenterAfter: docCenter - target,
  }
}

/**
 * Auto-fit zoom for an element's on-screen size: small controls get a tighter zoom,
 * big sections a looser one so the element fills ~`fill` of the frame. Clamped to a
 * sane cinematic range. (Same formula as zoom-filter.fitZoomForBox, kept here so this
 * module has no imports.)
 */
export function fitZoomForBox(boxW: number, boxH: number, fill = 0.5): number {
  if (!(boxW > 0) || !(boxH > 0)) return 1.7
  const fit = Math.min((FRAME_W * fill) / boxW, (FRAME_H * fill) / boxH)
  return Math.max(1.3, Math.min(2.2, fit))
}

/**
 * Clamp the camera centre so the zoom window stays fully inside the frame. Equivalent
 * to the crop-window clamp the ffmpeg filter applies (x in [0, W - W/zoom]); expressed
 * here on the centre so the recorder and renderer agree. An element near a frame edge
 * ends up off-centre but never cut off or parked on empty space past the page edge.
 */
export function clampCameraCenter(
  cx: number,
  cy: number,
  zoom: number,
  frameW = FRAME_W,
  frameH = FRAME_H,
): { cx: number; cy: number } {
  const z = Math.max(1, zoom)
  const halfW = frameW / (2 * z)
  const halfH = frameH / (2 * z)
  return {
    cx: Math.max(halfW, Math.min(frameW - halfW, cx)),
    cy: Math.max(halfH, Math.min(frameH - halfH, cy)),
  }
}

export interface ZoomFraming {
  /** Camera zoom level. */
  zoom: number
  /** Camera centre (clamped to keep the window in frame). */
  cx: number
  cy: number
  /** The element's true centre (cursor/click anchor). */
  rawCx: number
  rawCy: number
}

/**
 * Full framing for a zoom_in on a box: pick the zoom (fit-capped) and the camera centre
 * (clamped). `requestedZoom` is treated as a ceiling-limited preference — an explicit
 * value is honoured but never tighter than what keeps the whole element framed, so a
 * hard 2.2x dive never lands on the empty middle of a big container.
 */
export function computeZoomFraming(
  box: Box,
  requestedZoom?: number,
  frameW = FRAME_W,
  frameH = FRAME_H,
): ZoomFraming {
  const rawCx = box.x + box.w / 2
  const rawCy = box.y + box.h / 2
  const fitZoom = fitZoomForBox(box.w, box.h)
  const zoom = requestedZoom == null ? fitZoom : Math.min(requestedZoom, fitZoom)
  const { cx, cy } = clampCameraCenter(rawCx, rawCy, zoom, frameW, frameH)
  return {
    zoom,
    cx,
    cy,
    rawCx: Math.max(0, Math.min(frameW, rawCx)),
    rawCy: Math.max(0, Math.min(frameH, rawCy)),
  }
}

/** The crop window (top-left + size) the camera shows for a given centre + zoom. */
export function cropWindow(
  cx: number,
  cy: number,
  zoom: number,
  frameW = FRAME_W,
  frameH = FRAME_H,
): Box {
  const z = Math.max(1, zoom)
  const w = frameW / z
  const h = frameH / z
  const x = Math.min(Math.max(0, cx - w / 2), frameW - w)
  const y = Math.min(Math.max(0, cy - h / 2), frameH - h)
  return { x, y, w, h }
}

/** True if `box` is fully inside the crop window for the given camera centre + zoom. */
export function isBoxFullyVisible(box: Box, cx: number, cy: number, zoom: number): boolean {
  const c = cropWindow(cx, cy, zoom)
  return (
    box.x >= c.x - 0.5 &&
    box.y >= c.y - 0.5 &&
    box.x + box.w <= c.x + c.w + 0.5 &&
    box.y + box.h <= c.y + c.h + 0.5
  )
}
