#!/usr/bin/env node
/**
 * beats.mjs — measure the music bed's pulse so the picture can land on it.
 *
 *   node beats.mjs [--music=audio/music.mp3] [--duration=32] [--out=audio/music-beats.json]
 *
 * Onset strength is log-band spectral flux; the tempo is its autocorrelation
 * peak under a prior around 120 BPM; beats come from dynamic programming over
 * the onsets (Ellis 2007, as in librosa); the downbeat is the bar phase where
 * the low end hits hardest (4/4 assumed); loudness per bar gives the changes
 * and the drop. The mixer lays the bed from its first sample, so these times
 * are film times.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { BEATS_PATH } from "./lib/music-beats.mjs";

const argv = process.argv.slice(2);
const flag = (name, dflt = null) => argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? dflt;
const MUSIC = flag("music") ?? ["mp3", "wav", "m4a", "aac", "ogg", "flac"].map(e => `audio/music.${e}`).find(f => existsSync(f));
const DURATION = flag("duration") ? Number(flag("duration")) : null;
const OUT = flag("out", BEATS_PATH);
if (!MUSIC || !existsSync(MUSIC)) {
  console.error(`❌ No music bed${MUSIC ? ` at ${MUSIC}` : " (audio/music.<ext>)"} — import or generate one first.`);
  process.exit(1);
}

const SR = 22050, N = 1024, HOP = 256, FPS = SR / HOP, MAX_SECONDS = 240;

// --- decode -------------------------------------------------------------------
const raw = execFileSync("ffmpeg", ["-v", "error", "-i", MUSIC, "-t", String(MAX_SECONDS), "-ac", "1", "-ar", String(SR), "-f", "f32le", "-"], { maxBuffer: 1 << 30 });
const x = new Float32Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + (raw.length & ~3)));
const seconds = x.length / SR;
if (seconds < 4) { console.error(`❌ ${MUSIC} is ${seconds.toFixed(1)}s — too short to find a pulse.`); process.exit(1); }

// --- log-band spectral flux ------------------------------------------------------
const COS = new Float64Array(N / 2), SIN = new Float64Array(N / 2), HANN = new Float64Array(N);
for (let k = 0; k < N / 2; k++) { COS[k] = Math.cos((2 * Math.PI * k) / N); SIN[k] = -Math.sin((2 * Math.PI * k) / N); }
for (let k = 0; k < N; k++) HANN[k] = 0.5 - 0.5 * Math.cos((2 * Math.PI * k) / N);
function fft(re, im) {
  for (let i = 1, j = 0; i < N; i++) {
    let bit = N >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= N; len <<= 1) {
    const half = len >> 1, step = N / len;
    for (let i = 0; i < N; i += len) {
      for (let k = 0; k < half; k++) {
        const a = i + k, b = a + half, wr = COS[k * step], wi = SIN[k * step];
        const tr = re[b] * wr - im[b] * wi, ti = re[b] * wi + im[b] * wr;
        re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
      }
    }
  }
}
// 40 log-spaced bands, 30 Hz – 8 kHz; the bands under 150 Hz are the kick
const EDGES = Array.from({ length: 41 }, (_, i) => Math.max(1, Math.round((30 * (8000 / 30) ** (i / 40) * N) / SR)));
const BANDS = EDGES.slice(0, -1).map((lo, i) => [lo, Math.max(lo + 1, EDGES[i + 1])]);
const LOW = BANDS.filter(([lo]) => (lo * SR) / N < 150).length;

const frames = Math.floor(x.length / HOP) + 1;
const onset = new Float64Array(frames), low = new Float64Array(frames);
const re = new Float64Array(N), im = new Float64Array(N);
let prev = null;
for (let t = 0; t < frames; t++) {
  const start = t * HOP - N / 2;
  for (let k = 0; k < N; k++) { const s = start + k; re[k] = s >= 0 && s < x.length ? x[s] * HANN[k] : 0; im[k] = 0; }
  fft(re, im);
  const level = BANDS.map(([lo, hi]) => {
    let e = 0;
    for (let k = lo; k < hi; k++) e += re[k] * re[k] + im[k] * im[k];
    return 10 * Math.log10(e / (hi - lo) + 1e-10);
  });
  if (prev) {
    let all = 0, kick = 0;
    level.forEach((l, b) => { const d = Math.max(0, l - prev[b]); all += d; if (b < LOW) kick += d; });
    onset[t] = all / BANDS.length; low[t] = kick / Math.max(1, LOW);
  }
  prev = level;
}
const std = a => { const m = a.reduce((s, v) => s + v, 0) / a.length; return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / a.length) || 1; };
const oStd = std(onset), lStd = std(low);
for (let t = 0; t < frames; t++) { onset[t] /= oStd; low[t] /= lStd; }

// --- tempo: autocorrelation peak, weighted toward 120 BPM ---------------------------
const span = Math.min(frames, Math.round(FPS * Math.max(20, Math.min(DURATION ? DURATION + 8 : 90, 90))));
const mean = onset.slice(0, span).reduce((s, v) => s + v, 0) / span;
const ac = lag => { let s = 0; for (let t = 0; t + lag < span; t++) s += (onset[t] - mean) * (onset[t + lag] - mean); return s; };
const ac0 = ac(0);
const lagLo = Math.floor((60 * FPS) / 200), lagHi = Math.ceil((60 * FPS) / 50);
const acs = new Float64Array(lagHi + 2);
for (let lag = lagLo - 1; lag <= lagHi + 1; lag++) acs[lag] = ac(lag);
let best = lagLo, bestScore = -Infinity;
for (let lag = lagLo; lag <= lagHi; lag++) {
  const w = Math.exp(-0.5 * Math.log2((60 * FPS) / lag / 120) ** 2);
  if (acs[lag] * w > bestScore) { bestScore = acs[lag] * w; best = lag; }
}
const [ya, yb, yc] = [acs[best - 1], acs[best], acs[best + 1]];
const P = best + (ya - 2 * yb + yc ? (0.5 * (ya - yc)) / (ya - 2 * yb + yc) : 0);
const pulse = acs[best] / ac0;

// --- beats: dynamic programming over the onset envelope ------------------------------
const local = new Float64Array(frames);
const half = Math.round(P);
for (let t = 0; t < frames; t++) {
  let s = 0;
  for (let k = -half; k <= half; k++) if (t + k >= 0 && t + k < frames) s += onset[t + k] * Math.exp(-0.5 * ((k * 32) / P) ** 2);
  local[t] = s;
}
const cum = new Float64Array(frames), back = new Int32Array(frames).fill(-1);
// Library beds are quantized: a tight grid keeps the tracker from swinging onto syncopation.
const TIGHT = 1000;
for (let t = 0; t < frames; t++) {
  let top = -Infinity, arg = -1;
  for (let p = t - Math.round(2 * P); p <= t - Math.round(P / 2); p++) {
    if (p < 0) continue;
    const s = cum[p] - TIGHT * Math.log((t - p) / P) ** 2;
    if (s > top) { top = s; arg = p; }
  }
  cum[t] = local[t] + (arg >= 0 ? top : 0);
  back[t] = arg;
}
const peaks = [];
for (let t = 1; t < frames - 1; t++) if (cum[t] > cum[t - 1] && cum[t] >= cum[t + 1]) peaks.push(t);
const median = [...peaks.map(t => cum[t])].sort((a, b) => a - b)[Math.floor(peaks.length / 2)] ?? 0;
const end = peaks.filter(t => cum[t] >= 0.5 * median).at(-1) ?? frames - 1;
const beatFrames = [];
for (let t = end; t >= 0; t = back[t]) beatFrames.unshift(t);
const floor = 0.5 * Math.sqrt(beatFrames.reduce((s, t) => s + local[t] ** 2, 0) / beatFrames.length);
while (beatFrames.length > 4 && local[beatFrames[0]] < floor) beatFrames.shift();
while (beatFrames.length > 4 && local[beatFrames.at(-1)] < floor) beatFrames.pop();
const beats = beatFrames.map(t => +(t / FPS).toFixed(3));
const gaps = beats.slice(1).map((b, i) => b - beats[i]);
const period = gaps.reduce((s, g) => s + g, 0) / gaps.length;
const drift = std(gaps) / period;

// --- downbeat: the bar phase where the low end lands hardest --------------------------
const near = (env, t) => { let m = 0; for (let k = -2; k <= 2; k++) m = Math.max(m, env[t + k] ?? 0); return m; };
const hit = t => Math.max(near(low, t), 0.5 * near(onset, t));
const phase = [0, 1, 2, 3].map(p => { const at = beatFrames.filter((_, i) => i % 4 === p); return at.reduce((s, t) => s + hit(t), 0) / Math.max(1, at.length); });
const order = [0, 1, 2, 3].sort((a, b) => phase[b] - phase[a]);
const downbeatClear = (phase[order[0]] - phase[order[1]]) / (phase[order[0]] || 1) > 0.12;

// --- bars and their loudness -----------------------------------------------------------
const rmsDb = (a, b) => {
  const lo = Math.max(0, Math.floor(a * SR)), hi = Math.min(x.length, Math.floor(b * SR));
  let s = 0;
  for (let i = lo; i < hi; i++) s += x[i] * x[i];
  return hi > lo ? 10 * Math.log10(s / (hi - lo) + 1e-12) : -120;
};
const bars = [];
for (let i = order[0], n = 1; i < beats.length; i += 4, n++) {
  const t = beats[i], next = beats[i + 4] ?? Math.min(seconds, t + 4 * period);
  bars.push({ n, t, db: +rmsDb(t, next).toFixed(1) });
}
const changes = [];
for (let i = 2; i < bars.length; i++) {
  const delta = bars[i].db - (bars[i - 1].db + bars[i - 2].db) / 2;
  if (Math.abs(delta) < 3) continue;
  const last = changes.at(-1);
  if (last && last.bar === bars[i].n - 1 && Math.sign(last.db) === Math.sign(delta)) {
    if (Math.abs(delta) > Math.abs(last.db)) Object.assign(last, { bar: bars[i].n, t: bars[i].t, db: +delta.toFixed(1) });
  } else changes.push({ bar: bars[i].n, t: bars[i].t, db: +delta.toFixed(1) });
}
const inFilm = c => DURATION === null || c.t < DURATION;
const drop = changes.filter(c => c.db >= 4 && inFilm(c)).sort((a, b) => b.db - a.db)[0] ?? null;

const bpm = +(60 / period).toFixed(1);
const result = { file: MUSIC, seconds: +seconds.toFixed(2), bpm, period: +period.toFixed(3), steady: drift < 0.05, pulse: +pulse.toFixed(2), downbeatClear, beats, bars, changes, drop };
mkdirSync(dirname(resolve(OUT)), { recursive: true });
writeFileSync(resolve(OUT), JSON.stringify(result, null, 2) + "\n");

// --- report ------------------------------------------------------------------------------
const shown = bars.filter(b => DURATION === null ? b.n <= 32 : b.t < DURATION);
const dbs = shown.map(b => b.db), lo = Math.min(...dbs), hi = Math.max(...dbs);
const glyph = db => "▁▂▃▄▅▆▇█"[Math.min(7, Math.round(((db - lo) / Math.max(12, hi - lo)) * 7))];
const feel = result.steady ? "steady" : "loose — the pulse wanders, so cue the changes rather than every bar";
console.log(`🎵 ${MUSIC} — ${bpm} BPM · beat ${period.toFixed(3)}s · bar ${(4 * period).toFixed(2)}s · ${feel}`);
if (pulse < 0.1) console.log("   ⚠ weak pulse: this bed has no strong beat; land reveals on its changes, not on bars.");
if (!downbeatClear) console.log("   ⚠ the downbeat is a guess; if a cut feels a beat early or late, cue bar N.2 or N.4.");
console.log(`\n   bar   time     loudness`);
for (const b of shown) {
  const c = changes.find(c => c.bar === b.n);
  const mark = c ? `  ${c.db > 0 ? "↑" : "↓"} ${c.db > 0 ? "+" : ""}${c.db}dB${drop && drop.bar === b.n ? "  ← drop" : ""}` : "";
  console.log(`   ${String(b.n).padStart(3)}  ${b.t.toFixed(2).padStart(6)}s  ${glyph(b.db)} ${b.db.toFixed(0)}dB${mark}`);
}
console.log(`\n✅ ${OUT}: ${beats.length} beats, ${bars.length} bars${drop ? `, drop at bar ${drop.bar} (${drop.t.toFixed(2)}s)` : ", no clear drop"}.`);
console.log(`   Cue shots, beats and lines with "bar N", "bar N.3", "beat N" or "drop", then pitch motion sync.`);
