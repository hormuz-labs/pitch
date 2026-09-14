/**
 * Build the shot map stored beside a captured launch video.
 *
 * The compiler reserves colon-qualified labels for beats. Every other master
 * label is a shot start, so this needs no evaluation of the source shots.js.
 */
export function renderTimeline(cues, { from, to, sourceBytes, sourceMtimeMs }) {
  if (!Array.isArray(cues)) throw new TypeError("cues must be an array");
  if (!Number.isFinite(from) || from < 0)
    throw new TypeError("from must be a finite non-negative number");
  if (!Number.isFinite(to) || to <= from)
    throw new TypeError("to must be finite and greater than from");
  if (!Number.isSafeInteger(sourceBytes) || sourceBytes < 0)
    throw new TypeError("sourceBytes must be a non-negative safe integer");
  if (!Number.isFinite(sourceMtimeMs) || sourceMtimeMs < 0)
    throw new TypeError("sourceMtimeMs must be a finite non-negative number");

  const labels = new Set();
  const shots = cues
    .map((cue) => {
      if (!cue || typeof cue !== "object") throw new TypeError("each cue must be an object");
      if (typeof cue.label !== "string" || cue.label.length === 0)
        throw new TypeError("each cue label must be a non-empty string");
      if (!Number.isFinite(cue.time) || cue.time < 0)
        throw new TypeError("each cue time must be a finite non-negative number");
      if (labels.has(cue.label)) throw new TypeError(`duplicate cue label: ${cue.label}`);
      labels.add(cue.label);
      return { label: cue.label, time: cue.time };
    })
    .filter((cue) => !cue.label.includes(":"))
    .sort((a, b) => a.time - b.time);

  if (shots.length === 0 || shots[0].time !== 0)
    throw new TypeError("cues must include a shot starting at zero");
  for (let i = 1; i < shots.length; i++) {
    if (shots[i].time === shots[i - 1].time) throw new TypeError("shot cue times must be unique");
  }

  const beats = [];
  for (let i = 0; i < shots.length; i++) {
    const shot = shots[i];
    const end = shots[i + 1]?.time ?? to;
    const clippedStart = Math.max(from, shot.time);
    const clippedEnd = Math.min(to, end);
    if (clippedEnd <= clippedStart) continue;
    beats.push({
      start: clippedStart - from,
      dur: clippedEnd - clippedStart,
      text: shot.label,
      type: "shot",
    });
  }

  return { durationSec: to - from, beats, sourceBytes, sourceMtimeMs };
}
