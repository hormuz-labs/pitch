/**
 * cursor-fx.ts
 *
 * Builds an animated cursor overlay for the demo recording. Instead of popping a
 * static cursor at each click point, a single cursor glides smoothly between
 * click targets (easing in and out) and gives a small "press" dip at the moment
 * of each click — the way a polished product demo feels.
 *
 * The overlay runs on the UNTRIMMED timeline (before the zoom filter trims and
 * zooms), so click times are `videoTimeSec + trimSec` and coordinates are in the
 * source 1920×1080 page space — the cursor then zooms/pans together with the page.
 */

export interface ClickEvent {
  videoTimeSec: number
  x: number
  y: number
}

const GLIDE = 0.75 // seconds to travel to a click target (visible, cinematic)
const LEAD = 0.08 // arrive a hair before the click lands
const PRESS_PX = 8 // how far the cursor dips on click
const PRESS_DUR = 0.18 // seconds of the press dip
const VW = 1920
const VH = 1080

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
}

/**
 * Plan the cursor's resting/arrival points: one per usable click, shifted onto
 * the untrimmed timeline (arriving `LEAD`s before the click) and time-ordered.
 * Pure + exported for testing.
 */
export function planCursorPath(clicks: ClickEvent[], trimSec: number): Pt[] {
  return clicks
    .filter(c => Number.isFinite(c.x) && Number.isFinite(c.y))
    .map(c => ({ t: Math.max(0, c.videoTimeSec + trimSec - LEAD), x: clampX(c.x), y: clampY(c.y) }))
    .sort((a, b) => a.t - b.t)
}

/**
 * Build the filter chain for the gliding cursor.
 * Returns null when there are no usable click events.
 */
export function buildGlidingCursorChain(
  clicks: ClickEvent[],
  trimSec: number,
  cursorInputIdx: number,
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

  return (
    `${inLabel}[${cursorInputIdx}:v]overlay=` +
    `x='${xExpr}':y='(${yExpr})${dipExpr}':` +
    `enable='gte(t,${show.toFixed(4)})'${outLabel};`
  )
}
