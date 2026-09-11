/**
 * breaths.mjs — the music bed's pauses, as an ffmpeg volume expression.
 *
 * Both reference films drop the kick for a third of a second before a
 * payoff. A `breath` beat in shots.js records the moment (the compiler
 * exports window.__BREATHS, cues.mjs writes them to audio/cues.json), and the
 * mix ducks the bed there with eased attack and release, so the pause is
 * felt without a sharp drop or a snap back before the payoff.
 */

/** Breaths from a cues.json object, cleaned and in order. */
export function breathsOf(cues) {
  const list = Array.isArray(cues && cues.breaths) ? cues.breaths : [];
  return list
    .map((b) => ({ at: Number(b.at), dur: b.dur == null ? 0.45 : Number(b.dur), depth: b.depth == null ? 0.35 : Math.min(1, Math.max(0, Number(b.depth))),
      attack: b.attack == null ? 0.15 : Number(b.attack), release: b.release == null ? 0.3 : Number(b.release) }))
    .filter((b) => Number.isFinite(b.at) && b.at >= 0 && Number.isFinite(b.dur) && b.dur > 0 && Number.isFinite(b.depth)
      && Number.isFinite(b.attack) && b.attack > 0 && Number.isFinite(b.release) && b.release > 0)
    .sort((a, b) => a.at - b.at);
}

/** Use current beat settings with the compiler's labels. A breath-only edit
 * must not replay an obsolete depth from the last cues export.
 */
export function breathsFromSpec(spec, cues) {
  if (!Array.isArray(spec?.shots)) return breathsOf(cues);
  const labels = new Map((cues?.cues || []).map(c => [c.label, c.time]));
  const breaths = [];
  let clock = 0;
  for (const shot of spec.shots) {
    const D = Number(shot.dur) || 0;
    const start = labels.get(shot.id) ?? clock;
    const beats = shot.beats || [];
    beats.forEach((b, i) => {
      if (b.kind !== "breath") return;
      const at = Math.min(Math.max(0, b.at ?? D * (i + 1) / (beats.length + 1)), D - 0.05);
      breaths.push({ ...b, at: +(start + at).toFixed(3) });
    });
    clock += D;
  }
  return breathsOf({ breaths });
}

/**
 * Unity outside [at − attack, at + dur + release], with cosine-eased ramps
 * into and out of 1 − depth. The optional legacy ramp overrides both sides.
 * Overlapping windows take the lower gain without compounding reductions.
 */
export function breathExpr(breaths, { ramp } = {}) {
  if (!breaths.length) return null;
  const terms = breaths.map(({ at, dur, depth, attack = 0.15, release = 0.3 }) => {
    const aRamp = Math.max(0.01, ramp ?? attack).toFixed(3);
    const rRamp = Math.max(0.01, ramp ?? release).toFixed(3);
    const a = at.toFixed(3);
    const b = (at + dur).toFixed(3);
    // rises from 0 at a−ramp to 1 at a, holds, falls to 0 at b+ramp
    const smooth = x => `(0.5-0.5*cos(PI*clip(${x},0,1)))`;
    const win = `${smooth(`(t-(${a}-${aRamp}))/${aRamp}`)}*${smooth(`((${b}+${rRamp})-t)/${rRamp}`)}`;
    return `(1-${depth.toFixed(3)}*${win})`;
  });
  // Overlapping breaths use the deeper envelope instead of multiplying into
  // an unintended near-mute.
  return terms.reduce((a, b) => a ? `min(${a},${b})` : b, "");
}

/** The ffmpeg audio filter for the bed, or null when there are no breaths. */
export function breathFilter(breaths, opts) {
  const expr = breathExpr(breaths, opts);
  return expr ? `volume=volume='${expr}':eval=frame` : null;
}
