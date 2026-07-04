/**
 * zoom-filter.ts
 *
 * Builds a single continuous, cinematic ffmpeg zoompan filter driven by the
 * explicit zoom_in / zoom_out events emitted by the LLM during recording.
 *
 * Camera model
 * ────────────
 * The camera is a smooth path of keyframes over time. Each keyframe is a
 * { zoom, centerX, centerY } state. Transitions between keyframes are eased
 * with a cosine ease-in-out so motion accelerates and decelerates gently
 * (no linear "snap"). Three kinds of move exist:
 *
 *   • zoom-in   — from the full 1× view onto a target element
 *   • pan       — already zoomed; glide the center to an adjacent target at
 *                 the SAME zoom (no jarring zoom-out/zoom-in)
 *   • zoom-out  — return to the full 1× view
 *
 * A new zoom_in while the camera is already zoomed becomes a PAN automatically,
 * which is what makes the demo feel cinematic when highlighting nearby controls.
 *
 * Sync model
 * ──────────
 * A wall-clock `startTime` is captured right before prompt. Every event stores
 *   videoTimeSec = (Date.now() - startTime) / 1000
 * The raw recording is trimmed by `trimSec` (then PTS reset to 0) inside this
 * filter, so post-trim `time` lines up directly with `videoTimeSec`.
 */

// Cinematic timing — slower and eased rather than snappy.
export const ZOOM_IN_DURATION = 0.6 // seconds  1× → target zoom
export const ZOOM_OUT_DURATION = 0.6 // seconds  target zoom → 1×
export const PAN_DURATION = 0.85 // seconds  glide between adjacent targets

export const DEFAULT_ZOOM = 1.7 // gentler than a hard 2× dive
export const OUTPUT_SIZE = '1920x1080'
export const DEFAULT_FPS = 30 // fallback if source fps cannot be detected

export interface ZoomInEvent {
  type: 'in'
  videoTimeSec: number // when LLM called zoom_in()
  x: number // pixel X to center on
  y: number // pixel Y to center on
  zoom: number // target zoom multiplier; LLM-chosen per action
}

export interface ZoomOutEvent {
  type: 'out'
  videoTimeSec: number // when LLM called zoom_out()
}

export type ZoomEvent = ZoomInEvent | ZoomOutEvent

const W = 1920
const H = 1080

/** A single eased camera transition between two states. */
export interface CameraMove {
  t0: number // transition start
  t1: number // transition end
  z0: number
  z1: number
  cx0: number
  cx1: number
  cy0: number
  cy1: number
}

/**
 * Cosine ease-in-out interpolation expression from `a` to `b` over [t0, t1].
 * Velocity is zero at both ends, so the motion glides in and out smoothly.
 */
function easedInterp(a: number, b: number, t0: number, t1: number): string {
  const dur = Math.max(1e-4, t1 - t0)
  const p = `min(1,max(0,(time-${t0.toFixed(4)})/${dur.toFixed(4)}))`
  const ease = `(0.5-0.5*cos(PI*${p}))`
  return `(${a.toFixed(3)}+(${b.toFixed(3)}-(${a.toFixed(3)}))*${ease})`
}

/**
 * Build a piecewise time expression for one camera channel (zoom / cx / cy).
 * Moves are ordered; the earliest is the outermost `if`. Within a move:
 *   time < t0  → hold the start value (covers the gap after the previous move)
 *   t0..t1     → eased transition
 *   time > t1  → defer to the next move (or the final resting value)
 */
function buildChannel(
  moves: CameraMove[],
  pick: (m: CameraMove) => { a: number; b: number },
  finalRest: number,
): string {
  let expr = finalRest.toFixed(3)
  for (let i = moves.length - 1; i >= 0; i--) {
    const m = moves[i]!
    const { a, b } = pick(m)
    const trans = easedInterp(a, b, m.t0, m.t1)
    expr = `if(lt(time,${m.t1.toFixed(4)}),if(lt(time,${m.t0.toFixed(4)}),${a.toFixed(3)},${trans}),${expr})`
  }
  return expr
}

/**
 * Auto-fit zoom for an element of the given on-screen size: small controls get a
 * tighter zoom, large cards a looser one, so the element fills ~`fill` of frame.
 * Pure + exported so the choice is unit-testable.
 */
export function fitZoomForBox(boxW: number, boxH: number, fill = 0.5): number {
  if (!(boxW > 0) || !(boxH > 0)) return DEFAULT_ZOOM
  const fit = Math.min((W * fill) / boxW, (H * fill) / boxH)
  return Math.max(1.3, Math.min(2.2, fit))
}

/**
 * Turn the flat zoom_in/zoom_out event stream into a smooth camera path of eased
 * moves. Holds are intentionally static (no Ken Burns drift) so silent holds can be
 * detected and trimmed as dead air. Pure + exported for testing.
 */
export function planCameraMoves(events: ZoomEvent[]): CameraMove[] {
  // ── Simulate the camera to produce eased moves ─────────────────────────────
  const moves: CameraMove[] = []
  let curZ = 1
  let curX = W / 2
  let curY = H / 2
  let zoomed = false
  let prevEnd = 0

  for (const ev of events) {
    if (ev.type === 'in') {
      // Ignore malformed targets — keep the camera where it is.
      if (!Number.isFinite(ev.x) || !Number.isFinite(ev.y)) {
        console.warn(
          `zoom_in at t=${ev.videoTimeSec.toFixed(3)}s has non-finite coordinates — ignoring`,
        )
        continue
      }
      const tz = Number.isFinite(ev.zoom) && ev.zoom > 1 ? ev.zoom : DEFAULT_ZOOM
      // Coordinates can be page-relative and land outside the visible frame
      // (e.g. an element below the fold). Clamp so the camera never centers off-screen.
      const tx = Math.max(0, Math.min(W, ev.x))
      const ty = Math.max(0, Math.min(H, ev.y))

      // Transition completes AT the event time (so the action is in frame when
      // it happens). A fresh zoom-in ramps from 1×; an in-while-zoomed pans.
      const dur = zoomed ? PAN_DURATION : ZOOM_IN_DURATION
      const t1 = ev.videoTimeSec
      const t0 = Math.max(prevEnd, t1 - dur)
      if (t1 > t0 + 1e-3) {
        moves.push({ t0, t1, z0: curZ, z1: tz, cx0: curX, cx1: tx, cy0: curY, cy1: ty })
        prevEnd = t1
      }
      curZ = tz
      curX = tx
      curY = ty
      zoomed = true
    } else {
      if (!zoomed) continue
      const t0 = Math.max(prevEnd, ev.videoTimeSec)
      const t1 = t0 + ZOOM_OUT_DURATION
      moves.push({ t0, t1, z0: curZ, z1: 1, cx0: curX, cx1: W / 2, cy0: curY, cy1: H / 2 })
      prevEnd = t1
      curZ = 1
      curX = W / 2
      curY = H / 2
      zoomed = false
    }
  }

  // Holds are intentionally STATIC — no Ken Burns drift. The camera simply rests on
  // the target until the next move. (The buildChannel hold-the-start-value behaviour
  // keeps the camera parked during the gaps between moves.) Keeping holds frozen also
  // lets the smart trimmer detect and cut silent holds as dead air.
  return moves
}

/**
 * Turn the flat zoom_in/zoom_out event stream into a smooth camera path and
 * emit one continuous zoompan filter_complex string.
 */
export function buildContinuousZoomFilter(
  events: ZoomEvent[],
  trimSec: number,
  inputLabel = '[0:v]', // override when a concat already feeds this filter
  fps = DEFAULT_FPS,
): string {
  const moves = planCameraMoves(events)

  // ── Compose channel expressions ────────────────────────────────────────────
  const finalZ = moves.length ? moves[moves.length - 1]!.z1 : 1
  const finalX = moves.length ? moves[moves.length - 1]!.cx1 : W / 2
  const finalY = moves.length ? moves[moves.length - 1]!.cy1 : H / 2

  const zExpr = buildChannel(moves, m => ({ a: m.z0, b: m.z1 }), finalZ)
  const cxExpr = buildChannel(moves, m => ({ a: m.cx0, b: m.cx1 }), finalX)
  const cyExpr = buildChannel(moves, m => ({ a: m.cy0, b: m.cy1 }), finalY)

  // Convert the eased center (cx,cy) into a top-left crop window, clamped so the
  // view never leaves the frame. `zoom` here is the per-frame zoom output.
  const xExpr = `min(max(0,(${cxExpr})-${W}/(2*max(1,zoom))),${W}-${W}/max(1,zoom))`
  const yExpr = `min(max(0,(${cyExpr})-${H}/(2*max(1,zoom))),${H}-${H}/max(1,zoom))`

  // ── Assemble filter ────────────────────────────────────────────────────────
  const trimClause = trimSec > 0 ? `trim=start=${trimSec.toFixed(3)},` : ''

  return (
    `${inputLabel}${trimClause}setpts=PTS-STARTPTS[trimmed];` +
    `[trimmed]zoompan=z='${zExpr}':x='${xExpr}':y='${yExpr}'` +
    `:d=1:s=${OUTPUT_SIZE}:fps=${fps}[zoomedv];`
  )
}
