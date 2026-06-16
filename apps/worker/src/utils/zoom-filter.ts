/**
 * zoom-filter.ts
 *
 * Builds a single continuous ffmpeg zoompan filter driven by explicit
 * zoom_in / zoom_out events emitted by the LLM during recording.
 *
 * Sync model
 * ──────────
 * A wall-clock `startTime` is captured right before prompt.
 * Every event timestamp is stored as:
 *
 *   videoTimeSec = (Date.now() - startTime) / 1000
 */

export const ZOOM_IN_DURATION  = 1.5;   // seconds  1x → target zoom
export const ZOOM_OUT_DURATION = 1.5;   // seconds  target zoom → 1x

export const DEFAULT_ZOOM = 2;          // fallback when LLM omits zoom
export const OUTPUT_SIZE  = "1920x1080";
export const DEFAULT_FPS  = 30;         // fallback if source fps cannot be detected

export interface ZoomInEvent {
  type: "in";
  videoTimeSec: number;   // when LLM called zoom_in()
  x: number;              // pixel X to center on
  y: number;              // pixel Y to center on
  zoom: number;           // target zoom multiplier (1.5–4); LLM-chosen per action
}

export interface ZoomOutEvent {
  type: "out";
  videoTimeSec: number;   // when LLM called zoom_out()
}

export type ZoomEvent = ZoomInEvent | ZoomOutEvent;

/**
 * Pairs zoom_in events with their following zoom_out events and builds
 * one continuous zoompan filter_complex string.
 *
 * An unpaired zoom_in (no following zoom_out) gets a default hold of
 * ZOOM_IN_DURATION seconds before automatically zooming back out.
 */
export function buildContinuousZoomFilter(
  events: ZoomEvent[],
  trimSec: number,
  inputLabel = "[0:v]",   // override when a concat already feeds this filter
  fps = DEFAULT_FPS
): string {
  const W = 1920;
  const H = 1080;

  // ── Pair up in/out events ──────────────────────────────────────────────────
  type ZoomPair = { tIn: number; tOut: number; x: number; y: number; zoom: number };
  const pairs: ZoomPair[] = [];

  for (let i = 0; i < events.length; i++) {
    const ev = events[i];
    if (!ev || ev.type !== "in") continue;

    // Find the next zoom_out after this zoom_in
    let tOut: number | null = null;
    for (let j = i + 1; j < events.length; j++) {
      const inner = events[j];
      if (inner?.type === "out") {
        tOut = inner.videoTimeSec;
        break;
      }
    }

    // Unpaired: hold for ZOOM_IN_DURATION before zooming out
    if (tOut === null) tOut = ev.videoTimeSec + ZOOM_IN_DURATION;

    // Guard: zoom_out must be after zoom_in
    if (tOut <= ev.videoTimeSec) tOut = ev.videoTimeSec + ZOOM_IN_DURATION;

    const zoom = ev.zoom ?? DEFAULT_ZOOM;

    // Hard guard: if coordinates are not finite numbers, skip
    if (!Number.isFinite(ev.x) || !Number.isFinite(ev.y)) {
      console.warn(`zoom_in at t=${ev.videoTimeSec.toFixed(3)}s has non-finite coordinates (x=${ev.x}, y=${ev.y}) — skipping this zoom pair`);
      continue;
    }

    pairs.push({ tIn: ev.videoTimeSec, tOut, x: ev.x, y: ev.y, zoom });
  }

  // ── Build chained zoom expression (zoompan `time` variable) ───────────────
  // Start with zoom=1, no pan. Iterate oldest→newest so the most-recent
  // window is the outermost if() and is evaluated first.
  let zExpr    = "1";
  let panXExpr = "0";
  let panYExpr = "0";

  for (const { tIn, tOut, x: cx, y: cy, zoom } of pairs) {
    const zs = Math.max(0, tIn - ZOOM_IN_DURATION);  // zoom-in start
    const hs = tIn;                                    // hold start  (LLM said zoom in here)
    const he = tOut;                                   // hold end    (LLM said zoom out here)
    const ze = tOut + ZOOM_OUT_DURATION;               // zoom-out end

    const zinRamp  = `1+(time-${zs})/${ZOOM_IN_DURATION}*(${zoom}-1)`;
    const zoutRamp = `${zoom}-(time-${he})/${ZOOM_OUT_DURATION}*(${zoom}-1)`;

    zExpr = [
      `if(between(time,${zs},${hs}),min(${zinRamp},${zoom}),`,
      `if(between(time,${hs},${he}),${zoom},`,
      `if(between(time,${he},${ze}),max(${zoutRamp},1),`,
      `${zExpr})))`,
    ].join("");

    const pxInWindow = `min(max(0,${cx}-${W}/(2*max(1,zoom))),${W}-${W}/max(1,zoom))`;
    const pyInWindow = `min(max(0,${cy}-${H}/(2*max(1,zoom))),${H}-${H}/max(1,zoom))`;

    panXExpr = `if(between(time,${zs},${ze}),${pxInWindow},${panXExpr})`;
    panYExpr = `if(between(time,${zs},${ze}),${pyInWindow},${panYExpr})`;
  }

  // ── Assemble filter ────────────────────────────────────────────────────────
  const trimClause = trimSec > 0 ? `trim=start=${trimSec.toFixed(3)},` : "";

  return (
    `${inputLabel}${trimClause}setpts=PTS-STARTPTS[trimmed];` +
    `[trimmed]zoompan=z='${zExpr}':x='${panXExpr}':y='${panYExpr}'` +
    `:d=1:s=${OUTPUT_SIZE}:fps=${fps}[zoomedv];`
  );
}
