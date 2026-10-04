/**
 * music-beats.mjs — the music bed's measured pulse (audio/music-beats.json,
 * written by beats.mjs) and the cues that point into it.
 *
 *   { file, bpm, period, beats: [s…], bars: [{ n, t, db }], changes: [{ bar, t, db }], drop }
 *
 * A shot, beat or line may cue a musical position instead of a spoken phrase:
 * "bar 5" (its downbeat), "bar 5.3" (its third beat), "beat 17", or "drop".
 * The mixer lays the bed from the file's first sample, so file time is film time.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export const BEATS_PATH = "audio/music-beats.json";
const MUSIC_CUE = /^\s*(?:bar\s+(\d+)(?:\.(\d))?|beat\s+(\d+)|drop)\s*$/i;

export const isMusicCue = cue => typeof cue === "string" && MUSIC_CUE.test(cue);

export function loadBeats(path = BEATS_PATH) {
  const p = resolve(path);
  if (!existsSync(p)) return null;
  try {
    const data = JSON.parse(readFileSync(p, "utf8"));
    return Array.isArray(data.beats) && Array.isArray(data.bars) ? data : null;
  } catch { return null; }
}

/** Film seconds of a music cue, or null when the track has no such position. */
export function musicCueTime(beats, cue) {
  const m = String(cue).match(MUSIC_CUE);
  if (!m || !beats) return null;
  if (m[3]) return beats.beats[Number(m[3]) - 1] ?? null;
  if (!m[1]) return beats.drop?.t ?? null;
  const bar = beats.bars.find(b => b.n === Number(m[1]));
  if (!bar) return null;
  if (!m[2] || m[2] === "1") return bar.t;
  const first = beats.beats.findIndex(t => Math.abs(t - bar.t) < 1e-3);
  return first < 0 ? null : beats.beats[first + Number(m[2]) - 1] ?? null;
}

/**
 * Where to cut a bed that runs past the film so its own ending lands on the
 * film's end, as a music editor would: keep [0, a] and [b, seconds], a and b
 * downbeats a whole number of bars apart (the grid the shots were timed to
 * stays on the beat), the cut as late as the ending allows and between bars
 * of like loudness. The ending is the last two bars still at the track's
 * level, and whatever decay follows them. `end` is when the mix ends (the
 * film plus its tail). Null when the bed already ends with the film, is
 * shorter, or has no steady pulse to cut on.
 */
export function musicEdit({ bars, seconds, steady }, end) {
  if (!steady || !Array.isArray(bars) || bars.length < 8) return null;
  const bar = (bars.at(-1).t - bars[0].t) / (bars.length - 1);
  if (!(bar > 0) || seconds - end < bar * 0.75) return null;
  const level = [...bars.slice(0, -1).map((x) => x.db)].sort((p, q) => p - q)[Math.floor((bars.length - 1) / 2)];
  const lastFull = bars.findLastIndex((x, k) => k < bars.length - 1 && x.db >= level - 6);
  const ending = bars[Math.max(0, lastFull - 1)].t;
  let best = null, tried = 0;
  for (let j = bars.length - 1; j >= 1 && tried < 4; j--) {
    if (bars[j].t > ending) continue; // the tail keeps the whole ending
    const a = end - (seconds - bars[j].t);
    if (a < bars[0].t + 4 * bar) break; // any earlier cuts into the opening
    let i = 0;
    for (let k = 1; k < j; k++) if (Math.abs(bars[k].t - a) < Math.abs(bars[i].t - a)) i = k;
    if (Math.abs(bars[i].t - a) > bar / 2 || i < 1) continue;
    tried++;
    const score = Math.abs(bars[i - 1].db - bars[j].db) + 0.5 * tried;
    if (!best || score < best.score) best = { a: bars[i].t, b: bars[j].t, from: bars[i].n, to: bars[j].n - 1, score };
  }
  return best && { a: best.a, b: best.b, from: best.from, to: best.to, length: +(best.a + seconds - best.b).toFixed(3) };
}
