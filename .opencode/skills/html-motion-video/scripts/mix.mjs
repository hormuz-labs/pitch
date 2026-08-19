#!/usr/bin/env node
/**
 * mix.mjs — deterministic final mixdown: VO + music bed + SFX bus → audio/mix.wav
 *
 * The narration is the priority signal. Everything else gets out of its way,
 * three ways at once:
 *
 *   1. LEVEL     — the bed is attenuated to sit well under the voice.
 *   2. DUCKING   — a sidechain compressor keyed off the VO pulls the bed down
 *                  the moment a line starts and lets it breathe back after.
 *   3. FREQUENCY — a gentle dip is carved in the bed around the speech
 *                  intelligibility band (~400Hz–3.5kHz) so the two are not
 *                  fighting for the same spectrum even while both play.
 *
 * Built step-by-step with intermediate files (never one mega filter_complex —
 * those have silently dropped the attenuation), then VERIFIED by extraction:
 * the script measures real VO windows against real music-only gaps and exits
 * non-zero if the contrast is too low. A mix that masks the voice fails here
 * instead of in the final render.
 *
 * Usage (run from inside the project folder):
 *   node $SKILL/scripts/mix.mjs --duration=70.4
 *   node $SKILL/scripts/mix.mjs --duration=70.4 --music=audio/music.mp3 --sfx=audio/sfx_bus.wav
 *   node $SKILL/scripts/mix.mjs --duration=70.4 --dry-run
 *   node $SKILL/scripts/mix.mjs --duration=70.4 --music-only --music=audio/music.mp3
 *
 * VO placement is derived from js/timing.js (SCENE_TIMING), or override with
 *   --vo-map=audio/vo-map.json   →  [{ "file": "audio/vo_s1.wav", "t": 0.3 }, ...]
 */
import { execFile } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const argv = process.argv.slice(2);
const flag = (name, dflt = null) => {
  const hit = argv.find(a => a.startsWith(`--${name}=`));
  if (hit) return hit.slice(name.length + 3);
  return argv.includes(`--${name}`) ? true : dflt;
};
const abs = p => (isAbsolute(p) ? p : resolve(process.cwd(), p));

const DURATION = Number(flag("duration", 0));
const OUT = abs(flag("out", "audio/mix.wav"));
const MUSIC = flag("music", null);
const SFX = flag("sfx", null);
const VO_MAP = flag("vo-map", null);
const VO_LEAD = Number(flag("vo-lead", 0.3));     // gap between scene start and its line
const DRY = !!flag("dry-run");
const TAIL = 1.4;                                  // mix must outlast the video

/**
 * Music-only films (no narration) are a legitimate direction — see the skill's
 * audio persona axis. Without a voice there is nothing to duck against and
 * nothing to carve room for, so the bed becomes the PRIMARY signal and sits far
 * louder than the ~-30dB it lives at under speech.
 *
 * Deliberately opt-in: a missing VO file should fail loudly rather than quietly
 * shipping a silent-narration cut.
 */
const MUSIC_ONLY = !!flag("music-only");

// --- mix targets (measured means, not filter settings) ----------------------
const VO_TARGET_MEAN = -18;      // dense speech
// Under narration the bed is support (-13dB). With no voice it is the whole
// track — but it must still leave room for the SFX, which are the only thing
// marking events in a silent film. At -5dB the bed simply buried them.
const BED_ATTEN_DB = Number(flag("bed-db", MUSIC_ONLY ? -10 : -13));

/**
 * SFX gain trim. The per-class SFX levels are tuned for a mix whose loudest
 * element is a voice; with no voice, the same levels sit far too low against a
 * bed that has moved up. Lift them so events still read as events.
 */
const SFX_TRIM_DB = Number(flag("sfx-db", MUSIC_ONLY ? 6 : 0));
const DUCK_DEPTH = Number(flag("duck", 9));        // extra dB the bed drops under speech
const MIN_CONTRAST = Number(flag("min-contrast", 10));  // VO vs music-only gap


if (!DURATION) {
  console.error("--duration=<seconds> required (CONTENT_DURATION from __DURATION()).");
  process.exit(1);
}

const sh = (args, opts = {}) =>
  execFileAsync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args],
    { timeout: 600000, maxBuffer: 16 * 1024 * 1024, ...opts });

async function probeDur(file) {
  const { stdout } = await execFileAsync("ffprobe",
    ["-v", "quiet", "-show_entries", "format=duration", "-of", "csv=p=0", file], { timeout: 30000 });
  return Number(stdout.trim());
}

async function meanVolume(file) {
  const { stderr } = await execFileAsync("ffmpeg",
    ["-hide_banner", "-nostats", "-i", file, "-af", "volumedetect", "-f", "null", "-"],
    { maxBuffer: 8 * 1024 * 1024, timeout: 120000 });
  return {
    mean: Number(stderr.match(/mean_volume:\s*(-?\d+(?:\.\d+)?)/)?.[1]),
    peak: Number(stderr.match(/max_volume:\s*(-?\d+(?:\.\d+)?)/)?.[1]),
  };
}

// ---------------------------------------------------------------------------
// 1. Work out where every VO line sits on the timeline
// ---------------------------------------------------------------------------
function voFromTimingJs() {
  const p = abs("js/timing.js");
  if (!existsSync(p)) return null;
  const src = readFileSync(p, "utf8");
  const sandbox = { window: {} };
  try {
    // timing.js only assigns window.SCENE_TIMING — no DOM, no GSAP.
    new Function("window", src)(sandbox.window);
  } catch (err) {
    console.error(`Could not evaluate js/timing.js: ${err.message}`);
    return null;
  }
  const timing = sandbox.window.SCENE_TIMING;
  if (!timing) return null;

  const out = [];
  let t = 0;
  for (const [scene, meta] of Object.entries(timing)) {
    if (meta.vo) out.push({ file: meta.vo, t: t + VO_LEAD, scene, voDur: meta.voDur ?? null });
    t += meta.dur;
  }
  return out;
}

/**
 * Preferred source: the page's REAL labels, exported by scripts/cues.mjs.
 * Summing SCENE_TIMING durations only matches the picture when every boundary
 * is a plain cut — any overlap shifts later labels earlier, which silently
 * drifts the voiceover out of sync with the scenes it belongs to.
 */
function voFromCuesJson() {
  const p = abs("audio/cues.json");
  if (!existsSync(p)) return null;
  let data;
  try { data = JSON.parse(readFileSync(p, "utf8")); } catch { return null; }
  if (!data?.cues?.length) return null;

  const w = {};
  const timingPath = abs("js/timing.js");
  if (!existsSync(timingPath)) return null;
  try { new Function("window", readFileSync(timingPath, "utf8"))(w); } catch { return null; }
  const timing = w.SCENE_TIMING;
  if (!timing) return null;

  const out = [];
  for (const cue of data.cues) {
    const meta = timing[cue.label];
    if (meta?.vo) out.push({ file: meta.vo, t: +(cue.time + VO_LEAD).toFixed(3), scene: cue.label });
  }
  return out.length ? out : null;
}

let voSource = VO_MAP ? "--vo-map" : null;
let voClips = VO_MAP ? JSON.parse(readFileSync(abs(VO_MAP), "utf8")) : null;
if (!voClips) {
  voClips = voFromCuesJson();
  if (voClips) voSource = "audio/cues.json (real master labels)";
}
if (!voClips) {
  voClips = voFromTimingJs();
  if (voClips) voSource = "js/timing.js (summed durations — run scripts/cues.mjs for real labels)";
}

if (MUSIC_ONLY) {
  voClips = [];
  voSource = "none — music-only mix";
} else if (!voClips || !voClips.length) {
  console.error(
    "No voiceover found. Provide --vo-map=<json> or a js/timing.js with SCENE_TIMING entries carrying `vo` paths.\n" +
    "If this film is intentionally narration-free, pass --music-only."
  );
  process.exit(1);
}

// resolve + measure, and check for overlap (the classic VO-bleed bug)
const problems = [];
for (const c of voClips) {
  c.path = abs(c.file);
  if (!existsSync(c.path)) { problems.push(`missing VO clip: ${c.file}`); continue; }
  c.dur = await probeDur(c.path);
}
voClips = voClips.filter(c => c.dur);
voClips.sort((a, b) => a.t - b.t);

for (let i = 0; i < voClips.length - 1; i++) {
  const a = voClips[i], b = voClips[i + 1];
  const endsAt = a.t + a.dur;
  if (endsAt + 0.3 > b.t) {
    problems.push(
      `VO overlap: ${a.file} ends at ${endsAt.toFixed(2)}s but ${b.file} starts at ${b.t.toFixed(2)}s ` +
      `(need ≥0.3s gap) — lengthen the scene or tighten the copy`
    );
  }
}
// Guarded: there is no "last line" in a music-only mix.
const lastEnd = voClips.length
  ? voClips[voClips.length - 1].t + voClips[voClips.length - 1].dur
  : 0;
if (voClips.length && lastEnd > DURATION) {
  problems.push(`VO runs past the timeline: last line ends at ${lastEnd.toFixed(2)}s > ${DURATION}s`);
}

console.log(`Mix plan — ${voClips.length} VO clips, timeline ${DURATION}s`);
console.log(`VO placement from: ${voSource}\n`);
console.log("    T      DUR   CLIP");
for (const c of voClips) {
  console.log(`  ${c.t.toFixed(2).padStart(6)} ${c.dur.toFixed(2).padStart(6)}   ${c.file}${c.scene ? `  (${c.scene})` : ""}`);
}
console.log(`\n  bed ${BED_ATTEN_DB}dB · duck −${DUCK_DEPTH}dB under speech · vocal-band carve on bed`);
console.log(`  music: ${MUSIC || "(none)"}`);
console.log(`  sfx:   ${SFX || "(none)"}`);

if (problems.length) {
  console.log("");
  for (const p of problems) console.log(`⚠ ${p}`);
}
if (DRY) { console.log("\n--dry-run: nothing rendered."); process.exit(problems.length ? 1 : 0); }
if (problems.some(p => p.startsWith("missing"))) process.exit(1);

// ---------------------------------------------------------------------------
// 2. Step A — unified full-length VO track
// ---------------------------------------------------------------------------
const tmp = join(dirname(OUT), ".mix-build");
rmSync(tmp, { recursive: true, force: true });
mkdirSync(tmp, { recursive: true });
mkdirSync(dirname(OUT), { recursive: true });

const VO_FULL = join(tmp, "vo_full.wav");
if (!MUSIC_ONLY) {
  const inputs = voClips.flatMap(c => ["-i", c.path]);
  // highpass clears rumble the TTS sometimes carries; compression evens the
  // line-to-line level so ducking triggers consistently.
  const chains = voClips.map((c, i) => {
    const ms = Math.round(c.t * 1000);
    return `[${i}:a]aresample=48000,aformat=channel_layouts=stereo,highpass=f=90,adelay=${ms}|${ms}[v${i}]`;
  }).join(";");
  const mixIn = voClips.map((_, i) => `[v${i}]`).join("");
  await sh([
    ...inputs,
    "-filter_complex",
    `${chains};${mixIn}amix=inputs=${voClips.length}:dropout_transition=0:normalize=0[m];` +
    `[m]acompressor=threshold=-21dB:ratio=4:makeup=1.8,volume=+4dB,` +
    // The makeup gain can push peaks to 0dBFS on loud lines; catch them here so
    // the VO stem never enters the mix already clipped.
    `alimiter=level=disabled:limit=0.89,` +
    `apad=whole_dur=${(DURATION + TAIL).toFixed(3)},atrim=0:${(DURATION + TAIL).toFixed(3)}[out]`,
    "-map", "[out]", "-ar", "48000", "-ac", "2", "-c:a", "pcm_s16le", VO_FULL,
  ]);
}
if (!MUSIC_ONLY) {
  const voStats = await meanVolume(VO_FULL);
  console.log(`\nStep A  vo_full        mean ${voStats.mean}dB  peak ${voStats.peak}dB`);
} else {
  console.log(`\nStep A  vo_full        (skipped — music-only)`);
}

// ---------------------------------------------------------------------------
// 3. Step B — music bed: trimmed, vocal-band carved, attenuated
// ---------------------------------------------------------------------------
let BED = null;
if (MUSIC) {
  const musicPath = abs(MUSIC);
  if (!existsSync(musicPath)) { console.error(`Music not found: ${musicPath}`); process.exit(1); }
  BED = join(tmp, "music_bed.wav");
  // The carve: two gentle dips across the speech intelligibility band. Gentle
  // and wide beats one deep notch — the bed keeps its character, the voice
  // gets a clear lane.
  await sh([
    "-i", musicPath,
    "-af",
    `aresample=48000,aformat=channel_layouts=stereo,` +
    `atrim=0:${(DURATION + TAIL).toFixed(3)},asetpts=PTS-STARTPTS,` +
    // The carve exists to make room for a voice; with none, it just dulls the
    // track, so it is skipped in music-only mode.
    (MUSIC_ONLY ? "" : `equalizer=f=800:t=q:w=1.1:g=-2.5,equalizer=f=2400:t=q:w=1.0:g=-3.5,`) +
    `volume=${BED_ATTEN_DB}dB,` +
    `apad=whole_dur=${(DURATION + TAIL).toFixed(3)}`,
    "-ar", "48000", "-ac", "2", "-c:a", "pcm_s16le", BED,
  ]);
  const bedStats = await meanVolume(BED);
  console.log(`Step B  music_bed      mean ${bedStats.mean}dB  peak ${bedStats.peak}dB  (carved + ${BED_ATTEN_DB}dB)`);

  // ---- Step C — duck the bed against the VO ------------------------------
  if (MUSIC_ONLY) {
    console.log(`Step C  music_ducked   (skipped — nothing to duck against)`);
  } else {
  const DUCKED = join(tmp, "music_ducked.wav");
  // ratio derived from the requested depth; threshold low enough that normal
  // speech level triggers it, release long enough to avoid pumping between words.
  const ratio = Math.max(2, Math.min(20, DUCK_DEPTH * 1.6)).toFixed(1);
  await sh([
    "-i", BED, "-i", VO_FULL,
    "-filter_complex",
    `[1:a]asplit=1[sc];[0:a][sc]sidechaincompress=` +
    `threshold=0.02:ratio=${ratio}:attack=8:release=320:makeup=1:level_sc=1[out]`,
    "-map", "[out]", "-ar", "48000", "-ac", "2", "-c:a", "pcm_s16le", DUCKED,
  ]);
  const duckStats = await meanVolume(DUCKED);
  console.log(`Step C  music_ducked   mean ${duckStats.mean}dB  peak ${duckStats.peak}dB  (sidechained to VO)`);
  BED = DUCKED;
  }
}

// ---------------------------------------------------------------------------
// 4. Step D — final assembly
// ---------------------------------------------------------------------------
const stems = MUSIC_ONLY ? [] : [VO_FULL];
if (BED) stems.push(BED);
let SFX_STEM = null;
if (SFX) {
  const sfxPath = abs(SFX);
  if (!existsSync(sfxPath)) { console.error(`SFX bus not found: ${sfxPath}`); process.exit(1); }
  SFX_STEM = sfxPath;
  if (SFX_TRIM_DB !== 0) {
    SFX_STEM = join(tmp, "sfx_trimmed.wav");
    await sh(["-i", sfxPath, "-af", `volume=${SFX_TRIM_DB}dB`,
      "-ar", "48000", "-ac", "2", "-c:a", "pcm_s16le", SFX_STEM]);
    const t = await meanVolume(SFX_STEM);
    console.log(`Step C2 sfx_trimmed    mean ${t.mean}dB  (${SFX_TRIM_DB > 0 ? "+" : ""}${SFX_TRIM_DB}dB for a voiceless mix)`);
  }
  stems.push(SFX_STEM);
}

const fadeOutAt = Math.max(0, DURATION - 1.5);
await sh([
  ...stems.flatMap(s => ["-i", s]),
  "-filter_complex",
  `${stems.map((_, i) => `[${i}:a]aresample=48000,aformat=channel_layouts=stereo[s${i}]`).join(";")};` +
  `${stems.map((_, i) => `[s${i}]`).join("")}amix=inputs=${stems.length}:dropout_transition=0:normalize=0[m];` +
  `[m]afade=t=in:d=0.3,afade=t=out:st=${fadeOutAt.toFixed(3)}:d=1.4,` +
  `apad=whole_dur=${(DURATION + TAIL).toFixed(3)},atrim=0:${(DURATION + TAIL).toFixed(3)},` +
  `alimiter=level=disabled:limit=0.95[out]`,
  "-map", "[out]", "-ar", "48000", "-ac", "2", "-c:a", "pcm_s16le", OUT,
]);

const outStats = await meanVolume(OUT);
const outDur = await probeDur(OUT);
console.log(`Step D  mix            mean ${outStats.mean}dB  peak ${outStats.peak}dB  ${outDur.toFixed(2)}s`);

// ---------------------------------------------------------------------------
// 5. Step E — VERIFY by extraction. This is the gate.
// ---------------------------------------------------------------------------
// Sample inside real VO lines, and inside real music-only gaps between them.
const voWindows = voClips
  .filter(c => c.dur > 1.2)
  .slice(0, 4)
  .map(c => ({ label: c.file.split("/").pop(), ss: c.t + 0.4, t: Math.min(2.0, c.dur - 0.6) }));

const gapWindows = [];
for (let i = 0; i < voClips.length - 1 && gapWindows.length < 3; i++) {
  const start = voClips[i].t + voClips[i].dur + 0.30;
  const end = voClips[i + 1].t - 0.10;
  if (end - start >= 0.5) {
    gapWindows.push({ label: `gap after ${voClips[i].file.split("/").pop()}`, ss: start, t: Math.min(1.5, end - start) });
  }
}
// The music-only tail after the last line is the most reliable gap of all —
// always sample it (before the 1.5s fade-out starts, or the measurement just
// reads the fade).
{
  const start = lastEnd + 0.30;
  const end = Math.min(DURATION - 1.6, DURATION);
  if (end - start >= 0.5) {
    gapWindows.push({ label: "music-only tail", ss: start, t: Math.min(2.0, end - start) });
  }
}
if (!gapWindows.length) {
  // Fall back to the head: most films open on music before the first line.
  const end = voClips[0].t - 0.10;
  if (end >= 0.6) gapWindows.push({ label: "music-only intro", ss: 0.15, t: Math.min(1.5, end - 0.15) });
}

async function measureWindow(w) {
  const f = join(tmp, `w_${Math.round(w.ss * 100)}.wav`);
  await sh(["-i", OUT, "-ss", String(w.ss), "-t", String(w.t), "-c:a", "pcm_s16le", f]);
  const m = await meanVolume(f);
  return { ...w, ...m };
}

console.log("\nStep E  verification by extraction");
const voM = [];
for (const w of voWindows) { const r = await measureWindow(w); voM.push(r); console.log(`   VO   ${r.mean.toFixed(1)}dB  ${r.label}`); }
const gapM = [];
for (const w of gapWindows) { const r = await measureWindow(w); gapM.push(r); console.log(`   GAP  ${r.mean.toFixed(1)}dB  ${r.label}`); }

rmSync(tmp, { recursive: true, force: true });

let failed = false;
if (MUSIC_ONLY) {
  // No voice to measure against — check the bed is actually present instead.
  if (outStats.mean < -30) {
    console.log(`\n❌ FAIL — music-only mix averages ${outStats.mean}dB; the bed is inaudible.`);
    console.log(`   Raise --bed-db (currently ${BED_ATTEN_DB}).`);
    failed = true;
  } else {
    console.log(`\n✅ music-only mix at ${outStats.mean}dB mean · peak ${outStats.peak}dB`);
  }
} else if (voM.length && gapM.length) {
  const voAvg = voM.reduce((s, x) => s + x.mean, 0) / voM.length;
  const gapAvg = gapM.reduce((s, x) => s + x.mean, 0) / gapM.length;
  // How far the voice sits ABOVE the music-only floor. Both are negative dBFS
  // means, and the gap is the quieter of the two, so the voice minus the gap is
  // the positive headroom figure we want.
  const contrast = voAvg - gapAvg;
  console.log(`\n   VO mean ${voAvg.toFixed(1)}dB · music-only mean ${gapAvg.toFixed(1)}dB · contrast ${contrast.toFixed(1)}dB`);
  if (contrast < MIN_CONTRAST) {
    console.log(`\n❌ FAIL — the voice is only ${contrast.toFixed(1)}dB above the bed (need ≥${MIN_CONTRAST}dB).`);
    console.log(`   The narration is competing with the music. Re-run with a lower --bed-db`);
    console.log(`   (currently ${BED_ATTEN_DB}) or a deeper --duck (currently ${DUCK_DEPTH}).`);
    failed = true;
  } else {
    console.log(`\n✅ narration sits ${contrast.toFixed(1)}dB above the bed (target ≥${MIN_CONTRAST}dB)`);
  }
  if (voAvg > VO_TARGET_MEAN + 4) console.log(`⚠ VO is hot (${voAvg.toFixed(1)}dB vs ~${VO_TARGET_MEAN}dB target)`);
  if (voAvg < VO_TARGET_MEAN - 6) console.log(`⚠ VO is quiet (${voAvg.toFixed(1)}dB vs ~${VO_TARGET_MEAN}dB target)`);
} else {
  console.log("\n⚠ not enough VO/gap windows to verify contrast — check the mix by ear.");
}

if (outDur < DURATION + 1.0) {
  console.log(`❌ mix is ${outDur.toFixed(2)}s — must extend ≥1.0s past the ${DURATION}s timeline (capture muxes with -shortest).`);
  failed = true;
}

console.log(`\n${failed ? "⚠" : "✅"} ${OUT}`);
process.exit(failed || problems.length ? 1 : 0);
