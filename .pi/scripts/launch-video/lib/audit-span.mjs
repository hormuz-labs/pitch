/**
 * What motion_audit samples: the whole film, or the shots named with --shots.
 *
 * A scoped audit exists because re-checking one shot used to cost the whole
 * film: 134 captures and 30s to see whether a 5s CTA still held. The named
 * shots become spans on the film's clock; each span is sampled on the same
 * step grid a full audit uses, so a scoped number is the full audit's number
 * for that stretch — not a different measurement.
 */

/** Merged [start, end] spans for the named shots (every shot when none are named). */
export function spansFor({ cues, duration, only = [] }) {
  if (!only.length) return [{ start: 0, end: duration, ids: cues.map(c => c.label) }];
  const ranges = cues
    .map((c, i) => ({ id: c.label, start: c.time, end: i + 1 < cues.length ? cues[i + 1].time : duration }))
    .filter(r => only.includes(r.id))
    .sort((a, b) => a.start - b.start);
  const spans = [];
  for (const r of ranges) {
    const last = spans[spans.length - 1];
    if (last && r.start <= last.end + 1e-6) { last.end = Math.max(last.end, r.end); last.ids.push(r.id); }
    else spans.push({ start: r.start, end: r.end, ids: [r.id] });
  }
  return spans;
}

/**
 * Sample times per span, on the film's step grid. A span begins at the grid
 * point at or before its start so its first event has a frame to differ from.
 */
export function sampleTimes(spans, step, duration) {
  return spans.map(sp => {
    const from = Math.floor(sp.start / step + 1e-6), to = Math.ceil(sp.end / step - 1e-6);
    const ts = [];
    for (let i = from; i <= to; i++) ts.push(Math.min(i * step, duration));
    return ts;
  });
}

/**
 * The still stretches: the longest one, and every one over maxQuiet. Measured
 * inside each span — a stretch never runs across a gap between two spans.
 */
export function quietStretches(eventTimes, spans, maxQuiet) {
  let longest = { dur: 0, from: 0, to: 0 };
  const gaps = [];
  for (const sp of spans) {
    let last = sp.start;
    const inSpan = eventTimes.filter(t => t > sp.start + 1e-6 && t <= sp.end + 1e-6);
    for (const t of [...inSpan, sp.end]) {
      const dur = t - last;
      if (dur > longest.dur) longest = { dur, from: last, to: t };
      if (dur > maxQuiet) gaps.push([last, t]);
      last = t;
    }
  }
  return { longest, gaps };
}
