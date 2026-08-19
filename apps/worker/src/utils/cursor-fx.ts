/**
 * cursor-fx.ts
 *
 * Builds an animated cursor overlay for the demo recording. Instead of popping a
 * static cursor at each click point, a single cursor glides smoothly between
 * click targets (easing in and out) and gives a small "press" dip at the moment
 * of each click — the way a polished product demo feels.
 *
 * Two cursor images share the same glide path: an ARROW while travelling between
 * targets, swapping to a HAND POINTER only while it rests on a target the click
 * marked as a button/link (`hand: true`) — mirroring how a real OS cursor turns
 * into a hand over a pressable control but stays an arrow over a text field or
 * plain content. The swap is a pair of chained overlays gated by complementary
 * `enable` windows.
 *
 * The overlay runs on the UNTRIMMED timeline (before the zoom filter trims and
 * zooms), so click times are `videoTimeSec + trimSec` and coordinates are in the
 * source 1920×1080 page space — the cursor then zooms/pans together with the page.
 */

export interface ClickEvent {
  videoTimeSec: number
  x: number
  y: number
  // True when the clicked element was a button/link (pressable) — only these show
  // the hand pointer. Fields, plain content and unknown targets stay an arrow.
  hand?: boolean
}

const GLIDE = 0.75 // seconds to travel to a click target (visible, cinematic)
const LEAD = 0.08 // arrive a hair before the click lands
const PRESS_PX = 8 // how far the cursor dips on click
const PRESS_DUR = 0.18 // seconds of the press dip
const VW = 1920
const VH = 1080

// Hand-pointer hotspot alignment. The arrow overlay is placed with its top-left
// at the click point, so its visible tip sits ~(3,3)px into the 24px image. The
// hand PNG's rendered fingertip sits ~(13,4)px into its 36px image. Shift the hand
// so its fingertip lands on the same screen point the arrow tip does: (x+3−13, y+3−4).
const HAND_DX = -10
const HAND_DY = -1
// The cursor is a HAND while resting on a clickable target and an ARROW while
// travelling. Switch to the hand just before it settles, and after the final
// click (no next target to glide to) hold the hand for a beat before it vanishes.
const HAND_APPROACH = 0.15
const HAND_TAIL = 1.2

/** Keep a point inside the visible frame (coords can be page-relative/off-screen). */
function clampX(x: number): number {
  return Math.max(0, Math.min(VW - 2, x))
}
function clampY(y: number): number {
  return Math.max(0, Math.min(VH - 2, y))
}

/** Cosine ease-in-out from a→b over [t0,t1], using the overlay `t` variable. */
function eased(a: number, b: number, t0: number, t1: number): string {
  const dur = Math.max(1e-4, t1 - t0)
  const p = `min(1,max(0,(t-${t0.toFixed(4)})/${dur.toFixed(4)}))`
  return `(${a.toFixed(2)}+(${b.toFixed(2)}-(${a.toFixed(2)}))*(0.5-0.5*cos(PI*${p})))`
}

export interface Pt {
  t: number // time the cursor should be AT this point
  x: number
  y: number
  hand: boolean // show the hand pointer while resting here (button/link target)
}

/**
 * Plan the cursor's resting/arrival points: one per usable click, shifted onto
 * the untrimmed timeline (arriving `LEAD`s before the click) and time-ordered.
 * Pure + exported for testing.
 */
export function planCursorPath(clicks: ClickEvent[], trimSec: number): Pt[] {
  return clicks
    .filter(c => Number.isFinite(c.x) && Number.isFinite(c.y))
    .map(c => ({
      t: Math.max(0, c.videoTimeSec + trimSec - LEAD),
      x: clampX(c.x),
      y: clampY(c.y),
      hand: !!c.hand,
    }))
    .sort((a, b) => a.t - b.t)
}

export interface Window {
  start: number
  end: number
}

/**
 * The time spans (untrimmed timeline) during which the cursor RESTS on a
 * button/link target (`hand: true`) and should show the hand pointer. Only those
 * points get a window — a rest on a text field or plain content keeps the arrow.
 * A window lasts from just before the cursor settles (HAND_APPROACH before its
 * arrival point) until it starts gliding to the NEXT target (of any kind); the
 * last one holds for HAND_TAIL. Windows are clipped to never overlap, so their
 * sum is always 0 or 1 in the enable filter. Pure + exported for testing.
 */
export function planHandWindows(pts: Pt[]): Window[] {
  const windows: Window[] = []
  let prevEnd = 0
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]!
    if (!p.hand) continue // only pressable (button/link) targets show the hand
    const next = pts[i + 1]
    // Depart when the glide toward the next target begins; the last target holds.
    const departure = next ? Math.max(p.t, next.t - GLIDE) : p.t + HAND_TAIL
    const start = Math.max(prevEnd, p.t - HAND_APPROACH)
    const end = Math.max(start + 0.05, departure)
    windows.push({ start, end })
    prevEnd = end
  }
  return windows
}

/**
 * Build the filter chain for the gliding cursor. Emits two chained overlays that
 * share one glide path — an arrow while travelling, a hand while resting on a
 * clickable target. Returns null when there are no usable click events.
 */
export function buildGlidingCursorChain(
  clicks: ClickEvent[],
  trimSec: number,
  arrowInputIdx: number,
  handInputIdx: number,
  inLabel: string,
  outLabel: string,
): string | null {
  const pts: Pt[] = planCursorPath(clicks, trimSec)

  if (pts.length === 0) return null

  // Position channels: rest at the first point, then ease between consecutive
  // points. Built last→first so the earliest point is the outermost `if`.
  let xExpr = pts[pts.length - 1]!.x.toFixed(2)
  let yExpr = pts[pts.length - 1]!.y.toFixed(2)
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i]!
    if (i === 0) {
      xExpr = `if(lt(t,${p.t.toFixed(4)}),${p.x.toFixed(2)},${xExpr})`
      yExpr = `if(lt(t,${p.t.toFixed(4)}),${p.y.toFixed(2)},${yExpr})`
    } else {
      const prev = pts[i - 1]!
      const t1 = p.t
      const t0 = Math.max(prev.t, t1 - GLIDE)
      const tx = eased(prev.x, p.x, t0, t1)
      const ty = eased(prev.y, p.y, t0, t1)
      xExpr = `if(lt(t,${t1.toFixed(4)}),if(lt(t,${t0.toFixed(4)}),${prev.x.toFixed(2)},${tx}),${xExpr})`
      yExpr = `if(lt(t,${t1.toFixed(4)}),if(lt(t,${t0.toFixed(4)}),${prev.y.toFixed(2)},${ty}),${yExpr})`
    }
  }

  // Press dip: a brief smooth +Y nudge centred on each click (sin gives 0→peak→0).
  const dips = clicks
    .filter(c => Number.isFinite(c.x) && Number.isFinite(c.y))
    .map(c => {
      const tc = Math.max(0, c.videoTimeSec + trimSec)
      const s = tc - PRESS_DUR / 2
      return `if(between(t,${s.toFixed(4)},${(s + PRESS_DUR).toFixed(4)}),${PRESS_PX}*sin(PI*(t-${s.toFixed(4)})/${PRESS_DUR.toFixed(4)}),0)`
    })
  const dipExpr = dips.length ? `+(${dips.join('+')})` : ''

  const show = Math.max(0, pts[0]!.t - 0.4)

  // Complementary enable gates. `handOr` is a sum of non-overlapping between()
  // terms, so it is 1 exactly while resting on a button/link target and 0
  // otherwise; the arrow shows for the rest of the visible time. With no such
  // targets it is the constant 0 — the hand never shows and the arrow is always on.
  const handWindows = planHandWindows(pts)
  const handOr = handWindows.length
    ? handWindows.map(w => `between(t,${w.start.toFixed(4)},${w.end.toFixed(4)})`).join('+')
    : '0'
  const arrowEnable = `gte(t,${show.toFixed(4)})*(1-(${handOr}))`
  const handEnable = `(${handOr})`

  const yBody = `(${yExpr})${dipExpr}`
  const midLabel = `${outLabel.slice(0, -1)}_arrow]`

  // Arrow while travelling, then hand while resting — chained so the hand draws
  // on top of the (already-composited, but disabled-there) arrow layer.
  return (
    `${inLabel}[${arrowInputIdx}:v]overlay=` +
    `x='${xExpr}':y='${yBody}':enable='${arrowEnable}'${midLabel};` +
    `${midLabel}[${handInputIdx}:v]overlay=` +
    `x='(${xExpr})+(${HAND_DX})':y='${yBody}+(${HAND_DY})':enable='${handEnable}'${outLabel};`
  )
}
