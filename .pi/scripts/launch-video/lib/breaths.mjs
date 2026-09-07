/**
 * breaths.mjs — the music bed's pauses, as an ffmpeg volume expression.
 *
 * Both reference films drop the kick for a third of a second before a
 * payoff. A `breath` beat in shots.js records the moment (the compiler
 * exports window.__BREATHS, cues.mjs writes them to audio/cues.json), and the
 * mix ducks the bed there: a smooth dip to (1 − depth) over `ramp` seconds
 * on each side, so the pause is felt and never clicks.
 */

/** Breaths from a cues.json object, cleaned and in order. */
export function breathsOf(cues) {
  const list = Array.isArray(cues && cues.breaths) ? cues.breaths : [];
  return list
    .map((b) => ({ at: Number(b.at), dur: Number(b.dur) || 0.45, depth: b.depth == null ? 0.75 : Math.min(1, Math.max(0, Number(b.depth))) }))
    .filter((b) => Number.isFinite(b.at) && b.at >= 0 && b.dur > 0)
    .sort((a, b) => a.at - b.at);
}

/**
 * The gain g(t) for one breath: 1 outside [at − ramp, at + dur + ramp], and a
 * clipped linear ramp into 1 − depth inside. Products of these give the
 * whole track's gain. ffmpeg's expression language has clip(), so the ramps
 * are one expression each.
 */
export function breathExpr(breaths, { ramp = 0.06 } = {}) {
  if (!breaths.length) return null;
  const r = Math.max(0.01, ramp).toFixed(3);
  const terms = breaths.map(({ at, dur, depth }) => {
    const a = at.toFixed(3);
    const b = (at + dur).toFixed(3);
    // rises from 0 at a−ramp to 1 at a, holds, falls to 0 at b+ramp
    const win = `clip((t-(${a}-${r}))/${r},0,1)*clip(((${b}+${r})-t)/${r},0,1)`;
    return `(1-${depth.toFixed(3)}*${win})`;
  });
  return terms.join("*");
}

/** The ffmpeg audio filter for the bed, or null when there are no breaths. */
export function breathFilter(breaths, opts) {
  const expr = breathExpr(breaths, opts);
  return expr ? `volume=volume='${expr}':eval=frame` : null;
}
