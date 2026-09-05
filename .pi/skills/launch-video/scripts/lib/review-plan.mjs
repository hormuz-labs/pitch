/**
 * Which moments of a film to look at.
 *
 * Three frames per shot by default: the entrance settled (20%), the second act
 * (55%) and the exit beginning (90%). Together they say whether a shot has
 * three acts or one, and they catch what the audit's pixel counts cannot —
 * clipped text, an element half off-canvas, words over a busy image.
 */

/** Sample fractions of a shot for n frames, kept off the cut on both sides. */
export function fractionsFor(n) {
  if (n <= 1) return [0.55];
  if (n === 2) return [0.3, 0.85];
  if (n === 3) return [0.2, 0.55, 0.9];
  return Array.from({ length: n }, (_, i) => 0.12 + (0.8 * i) / (n - 1));
}

/**
 * @param {object} p
 * @param {{id:string,type:string,dur:number}[]} p.shots   from window.SHOTS
 * @param {{label:string,time:number}[]} p.cues            real starts from window.__CUES()
 * @param {number} p.duration                              window.__DURATION()
 * @param {number} [p.perShot]                             frames per shot (default 3)
 * @param {string[]} [p.only]                              shot ids to review (default all)
 * @param {number[]} [p.times]                             explicit seconds, added to the plan
 * @returns {{t:number, shot:string|null, type:string|null, pct:number|null}[]} sorted by t
 */
export function planSamples({ shots, cues, duration, perShot = 3, only = [], times = [] }) {
  const starts = new Map(cues.map(c => [c.label, c.time]));
  // Fall back to cumulative durations for a shot whose label is missing.
  let clock = 0;
  const timed = shots.map(s => {
    const start = typeof starts.get(s.id) === "number" ? starts.get(s.id) : clock;
    clock = start + s.dur;
    return { ...s, start };
  });
  const wanted = only.length ? timed.filter(s => only.includes(s.id)) : timed;
  const out = [];
  const end = Math.max(0, duration - 0.02);
  for (const s of wanted) {
    for (const f of fractionsFor(perShot)) {
      const t = Math.min(end, Math.max(s.start, s.start + f * s.dur));
      out.push({ t: +t.toFixed(3), shot: s.id, type: s.type, pct: Math.round(f * 100) });
    }
  }
  for (const raw of times) {
    const t = Math.min(end, Math.max(0, Number(raw)));
    if (!Number.isFinite(t)) continue;
    const s = timed.find(x => t >= x.start && t < x.start + x.dur) ?? timed[timed.length - 1] ?? null;
    out.push({ t: +t.toFixed(3), shot: s?.id ?? null, type: s?.type ?? null, pct: s ? Math.round(((t - s.start) / s.dur) * 100) : null });
  }
  out.sort((a, b) => a.t - b.t);
  // Two samples within a frame of each other are the same frame.
  return out.filter((s, i) => i === 0 || s.t - out[i - 1].t > 0.05);
}

/** Row-major sheet index and tile position for sample i. */
export function sheetOf(i, cols, rows) {
  const per = cols * rows;
  return { sheet: Math.floor(i / per), row: Math.floor((i % per) / cols), col: i % cols };
}
