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
