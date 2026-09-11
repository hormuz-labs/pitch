import { spawn } from "node:child_process";

export const MICRO_EVENTS = new Set(["tick", "pop", "click", "type", "data"]);

/** LUFS alone over-amplifies short, high-crest-factor transients. */
export function cueGain({ lufs, peak }, target, offset, event) {
  const ceiling = MICRO_EVENTS.has(event) ? -18 : -9;
  const requested = (Number.isFinite(lufs) ? Math.max(-18, Math.min(18, target - lufs)) : 0) + offset;
  return {
    gainDb: Number.isFinite(peak) ? Math.min(requested, ceiling - peak) : requested,
    ceiling,
  };
}

/** Measure overlapping 400ms windows every 100ms, including brief transients.
 * Stream PCM so memory stays bounded even for a long film. Never quantize a
 * stem here: samples above full scale must remain visible to the gate.
 */
export function measureAudioWindows(file, duration) {
  return new Promise((resolve, reject) => {
    const rate = 48000, hop = 4800, size = 19200;
    const proc = spawn("ffmpeg", ["-v", "error", "-i", file, "-t", String(duration),
      "-ar", String(rate), "-ac", "2", "-f", "f32le", "pipe:1"], { stdio: ["ignore", "pipe", "pipe"] });
    const bins = [];
    let carry = Buffer.alloc(0), frames = 0, errors = "";
    proc.stderr.on("data", b => { errors += b; });
    proc.stdout.on("data", chunk => {
      const data = carry.length ? Buffer.concat([carry, chunk]) : chunk;
      const end = data.length - data.length % 8;
      for (let i = 0; i < end; i += 8) {
        const bin = bins[Math.floor(frames++ / hop)] ||= { energy: 0, peak: 0, count: 0, clipped: 0 };
        for (const v of [data.readFloatLE(i), data.readFloatLE(i + 4)]) {
          bin.energy += v * v;
          bin.peak = Math.max(bin.peak, Math.abs(v));
          bin.count++;
          if (!Number.isFinite(v) || Math.abs(v) >= 1) bin.clipped++;
        }
      }
      carry = data.subarray(end);
    });
    proc.on("error", reject);
    proc.on("close", code => {
      if (code !== 0) return reject(new Error(`Audio measurement failed: ${errors}`));
      const windows = bins.map((_, i) => {
        const parts = bins.slice(i, i + size / hop);
        const count = parts.reduce((n, b) => n + b.count, 0);
        return {
          t: i * hop / rate,
          mean: 10 * Math.log10(Math.max(1e-12, parts.reduce((n, b) => n + b.energy, 0) / count)),
          peak: 20 * Math.log10(Math.max(1e-6, ...parts.map(b => b.peak))),
        };
      });
      resolve({ windows, clipped: bins.reduce((n, b) => n + b.clipped, 0) });
    });
  });
}

/** Compare stems at the SAME instant, not their silence-diluted film means.
 * Ignore near-silent music intros/outros: intentional SFX-only moments are
 * valid. Else keep SFX RMS below music and transient peaks within 6dB.
 */
export function balanceProblems(bed, sfx, { end = Infinity, maxMean = 0, maxPeak = 6 } = {}) {
  const levels = bed.windows.map(w => w.mean).filter(Number.isFinite).sort((a, b) => a - b);
  // Locate the music's entrance/exit relative to its own normal level. A
  // fade-in at -35dB is not yet accompaniment to an intentional opening hit.
  const activeFloor = Math.max(-40, (levels[Math.floor(levels.length * 0.75)] ?? -40) - 12);
  const first = bed.windows.findIndex(w => w.mean >= activeFloor);
  const last = bed.windows.findLastIndex(w => w.mean >= activeFloor);
  return sfx.windows.flatMap((fx, i) => {
    const music = bed.windows[i];
    if (!music || i < first || i > last || fx.t >= end || music.mean < -40 || fx.mean < -55) return [];
    const meanOver = fx.mean - music.mean - maxMean;
    const peakOver = fx.peak - music.peak - maxPeak;
    if (Math.max(meanOver, peakOver) <= 0.5) return [];
    return [{ t: fx.t, meanDelta: fx.mean - music.mean, peakDelta: fx.peak - music.peak,
      reduceDb: Math.max(meanOver, peakOver) }];
  });
}
