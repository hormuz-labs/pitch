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
 * NARRATION IS ONE CONTINUOUS READ: shots.js declares
 *   audio: { vo: "audio/vo.wav", voStart: 0.3 }
 * and the whole read is placed once at voStart. The picture is cut to the
 * words by sync.mjs, not the other way round. Per-shot clips
 * (shots[].vo / voDur) are the legacy fragmented mode — still mixed, with a
 * warning, and failed by audit.mjs. Override placement with
 *   --vo-map=audio/vo-map.json   →  [{ "file": "audio/vo.wav", "t": 0.3 }]
 */
import { execFile } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { promisify } from "node:util";
import { loadShots, loadWords, voStartOf, wordsPathFor } from "./lib/vo-words.mjs";
import { muffleGraph, muffleStages, resolveAudioFx, ringArgs } from "./lib/audio-fx.mjs";
import { breathFilter, breathsFromSpec } from "./lib/breaths.mjs";
import { balanceProblems, balanceRegions, measureAudioWindows } from "./lib/audio-levels.mjs";

const execFileAsync = promisify(execFile);

const argv = process.argv.slice(2);
const flag = (name, dflt = null) => {
  const hit = argv.find(a => a.startsWith(`--${name}=`));
  if (hit) return hit.slice(name.length + 3);
  return argv.includes(`--${name}`) ? true : dflt;
};
const abs = p => (isAbsolute(p) ? p : resolve(process.cwd(), p));
const firstExisting = files => files.find(file => existsSync(abs(file))) || null;
const SETTINGS = abs("audio/mix-settings.json");
let settings = {};
if (existsSync(SETTINGS)) settings = JSON.parse(readFileSync(SETTINGS, "utf8"));
const setting = (name, fallback) => flag(name, settings[name] ?? fallback);

const DURATION = Number(flag("duration", 0));
const OUT = abs(flag("out", "audio/mix.wav"));
const MUSIC = flag("music", firstExisting(["audio/music.mp3", "audio/music.wav", "audio/music.m4a", "audio/music.aac", "audio/music.ogg", "audio/music.flac"]));
const SFX = flag("sfx", firstExisting(["audio/sfx_bus.wav"]));
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
if (MUSIC_ONLY && !MUSIC && !SFX) {
  throw new Error("No audio inputs: supply --music or --sfx, or place the bed at audio/music.<ext>. Nothing was mixed.");
}

// --- mix targets (measured means, not filter settings) ----------------------
const VO_TARGET_MEAN = -18;      // dense speech
// Under narration the bed is support (-13dB). With no voice it is the whole
// track — but it must still leave room for the SFX, which are the only thing
// marking events in a silent film. At -5dB the bed simply buried them.
const BED_ATTEN_DB = Number(setting("bed-db", MUSIC_ONLY ? -10 : -13));

/**
 * Music leads a voiceless film. The bus is already class/peak-staged; never
 * boost it globally just because narration is absent.
 */
const SFX_TRIM_DB = Number(setting("sfx-db", MUSIC_ONLY ? -3 : 0));
let DUCK_DEPTH = Number(setting("duck", 9));
const NO_BREATHS = [true, "true"].includes(setting("no-breaths", false));
const MIN_CONTRAST = Number(flag("min-contrast", 10));  // VO vs music-only gap


if (!DURATION) {
  console.error("--duration=<seconds> required (CONTENT_DURATION from __DURATION()).");
  process.exit(1);
}
if (![DURATION, BED_ATTEN_DB, SFX_TRIM_DB, DUCK_DEPTH].every(Number.isFinite) || DURATION <= 0 || DUCK_DEPTH < 0 || DUCK_DEPTH > 24) {
  throw new Error("duration and gains must be finite; duration > 0 and duck between 0 and 24 dB");
}

// shots.js audio.fx: muffle windows and rings (lib/audio-fx.mjs), resolved
// against the aligned read so they stay on their words after a re-record.
const FX = (() => {
  let spec = null;
  try { spec = loadShots(abs("shots.js")); } catch {}
  if (!Array.isArray(spec?.audio?.fx) || !spec.audio.fx.length) return { muffles: [], rings: [], thins: [], problems: [] };
  const vo = typeof spec.audio.vo === "string" ? spec.audio.vo : null;
  const timeline = vo ? loadWords(wordsPathFor(abs(vo))) : null;
  return resolveAudioFx(spec, timeline ? timeline.words : null, DURATION);
})();
if (FX.problems.length) {
  console.error(`❌ shots.js audio.fx:\n${FX.problems.map((p) => "   " + p).join("\n")}`);
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
/** shots.js (preferred) or js/timing.js → { id: { dur, vo, voDur } } in timeline order. */
function readTiming() {
  const shotsPath = abs("shots.js");
  if (existsSync(shotsPath)) {
    const w = {};
    try {
      // shots.js only assigns a data literal to window.SHOTS — no DOM, no GSAP.
      new Function("window", readFileSync(shotsPath, "utf8"))(w);
    } catch (err) {
      console.error(`Could not evaluate shots.js: ${err.message}`);
      return null;
    }
    const shots = w.SHOTS?.shots;
    if (Array.isArray(shots)) {
      const out = {};
      shots.forEach((s, i) => {
        out[s.id || `shot${i + 1}`] = { dur: Number(s.dur) || 0, vo: s.vo || null, voDur: s.voDur ?? null };
      });
      return out;
    }
  }
  const p = abs("js/timing.js");
  if (!existsSync(p)) return null;
  const w = {};
  try {
    new Function("window", readFileSync(p, "utf8"))(w);
  } catch (err) {
    console.error(`Could not evaluate js/timing.js: ${err.message}`);
    return null;
  }
  return w.SCENE_TIMING || null;
}

function voFromTimingJs() {
  const timing = readTiming();
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

  const timing = readTiming();
  if (!timing) return null;

  const out = [];
  for (const cue of data.cues) {
    const meta = timing[cue.label];
    if (meta?.vo) out.push({ file: meta.vo, t: +(cue.time + VO_LEAD).toFixed(3), scene: cue.label });
  }
  return out.length ? out : null;
}

/** Preferred: the one continuous read declared at the top of shots.js. */
function voFromContinuous() {
  let spec = null;
  try { spec = loadShots(abs("shots.js")); } catch { return null; }
  const file = spec?.audio?.vo;
  if (typeof file !== "string" || !file) return null;
  return [{ file, t: voStartOf(spec), scene: "narration (continuous read)" }];
}

let voSource = VO_MAP ? "--vo-map" : null;
let voClips = VO_MAP ? JSON.parse(readFileSync(abs(VO_MAP), "utf8")) : null;
if (!voClips) {
  voClips = voFromContinuous();
  if (voClips) voSource = "shots.js audio.vo (one continuous read)";
}
if (!voClips) {
  voClips = voFromCuesJson();
  if (voClips) voSource = "audio/cues.json (real master labels)";
}
if (!voClips) {
  voClips = voFromTimingJs();
  if (voClips) voSource = "shots.js durations (hard cuts, so labels equal the summed durs)";
}

if (MUSIC_ONLY) {
  voClips = [];
  voSource = "none — music-only mix";
} else if (!voClips || !voClips.length) {
  console.error(
    "No voiceover found. Generate ONE continuous read (tts.mjs --script=audio/vo.txt --out=audio/vo.wav) and set\n" +
    "  audio: { vo: \"audio/vo.wav\", voStart: 0.3 } in shots.js, or pass --vo-map=<json>.\n" +
    "If this film is intentionally narration-free, pass --music-only."
  );
  process.exit(1);
}
const FRAGMENTED = !MUSIC_ONLY && !VO_MAP && voClips.length > 1;


// resolve + measure, and check for overlap (the classic VO-bleed bug)
const problems = [];
for (const c of voClips) {
  c.path = abs(c.file);
  if (!existsSync(c.path)) { problems.push(`missing VO clip: ${c.file}`); continue; }
  c.dur = await probeDur(c.path);
}
voClips = voClips.filter(c => c.dur);
voClips.sort((a, b) => a.t - b.t);
// One continuous read covers the whole film, so a deep duck would bury the bed
// for the entire runtime with no gap for it to breathe back in. Duck gently
// (~3dB, measured); the -13dB bed level and the vocal-band carve keep the voice
// ~20dB on top (verified by extraction below).
const CONTINUOUS = !MUSIC_ONLY && voClips.length === 1 && voClips[0].dur > DURATION * 0.6;
if (CONTINUOUS && flag("duck") === null && settings.duck == null) DUCK_DEPTH = 3;
if (CONTINUOUS) console.log("mode: continuous read — gentle duck (bed stays audible under the voice)");

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
console.log(`\n  bed ${BED_ATTEN_DB}dB · ${MUSIC_ONLY ? "music-led; no speech sidechain or vocal carve" : `speech duck up to ${DUCK_DEPTH}dB · vocal-band carve`}`);
console.log(`  music: ${MUSIC || "(none)"}`);
console.log(`  sfx:   ${SFX || "(none)"}`);
for (const m of FX.muffles) console.log(`  muffle ${m.from.toFixed(2)}–${m.to.toFixed(2)}s  ${m.targets.map((t) => `${t} ${t === "vo" ? (m.voCutoff ? m.voCutoff + "Hz" : "clear") : m.cutoff + "Hz"}`).join(" · ")}`);
for (const r of FX.rings) console.log(`  ring   ${r.from.toFixed(2)}–${r.to.toFixed(2)}s  ${r.freq}Hz at ${r.level}dBFS`);
for (const t of FX.thins) console.log(`  thin   ${t.from.toFixed(2)}–${t.to.toFixed(2)}s  ${t.targets.join(" · ")} above ${t.cutoff}Hz — the low end returns at ${t.to.toFixed(2)}s`);

if (FRAGMENTED) {
  problems.push(`fragmented narration: ${voClips.length} separate clips. Each clip restarts the voice's intonation and leaves dead air — the robotic sound. ` +
    `Record ONE continuous read (tts.mjs --script), set audio.vo to it, cue the shots and run sync.mjs. (audit.mjs fails this.)`);
}
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
const MIXED = join(tmp, "mix.wav");
rmSync(tmp, { recursive: true, force: true });
mkdirSync(tmp, { recursive: true });
mkdirSync(dirname(OUT), { recursive: true });

const VO_FULL = join(tmp, "vo_full.wav");
/** Run a stem through each muffle (low-pass) and thin (high-pass) pass it takes, one per cutoff. */
async function muffleStem(file, stem) {
  let cur = file;
  const passes = [
    ...muffleStages(FX.muffles, stem).map((g) => ({ ...g, pass: "lowpass", label: "muffled" })),
    ...muffleStages(FX.thins, stem).map((g) => ({ ...g, pass: "highpass", label: "thinned" })),
  ];
  for (const [k, stage] of passes.entries()) {
    const out = join(tmp, `${stem}_fx_${k}.wav`);
    await sh(["-i", cur, "-filter_complex", muffleGraph(stage.windows, stage.cutoff, stage.pass), "-map", "[out]",
      "-ar", "48000", "-ac", "2", "-c:a", "pcm_f32le", out]);
    console.log(`Step M  ${stem.padEnd(14)} ${stage.label} at ${stage.cutoff}Hz (${stage.windows.length} window${stage.windows.length === 1 ? "" : "s"})`);
    cur = out;
  }
  return cur;
}
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
    `alimiter=level=disabled:limit=0.89:latency=1,` +
    `apad=whole_dur=${(DURATION + TAIL).toFixed(3)},atrim=0:${(DURATION + TAIL).toFixed(3)}[out]`,
    "-map", "[out]", "-ar", "48000", "-ac", "2", "-c:a", "pcm_f32le", VO_FULL,
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
  // Breaths: the `breath` beats the page exported through cues.mjs. The bed
  // dips there — the pause before a payoff both reference films have.
  let cues = null;
  try { cues = JSON.parse(readFileSync(abs("audio/cues.json"), "utf8")); } catch {}
  let spec = null;
  try { spec = loadShots(abs("shots.js")); } catch {}
  let breaths = breathsFromSpec(spec, cues);
  if (NO_BREATHS) breaths = [];
  const breathAf = breathFilter(breaths);
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
    (breathAf ? `${breathAf},` : "") +
    `apad=whole_dur=${(DURATION + TAIL).toFixed(3)}`,
    "-ar", "48000", "-ac", "2", "-c:a", "pcm_f32le", BED,
  ]);
  const bedStats = await meanVolume(BED);
  if (MUSIC_ONLY && bedStats.mean < -30) {
    rmSync(tmp, { recursive: true, force: true });
    console.error(`❌ Music bed averages ${bedStats.mean}dB; raise --bed-db before mixing SFX (need at least -30dB).`);
    process.exit(1);
  }
  console.log(`Step B  music_bed      mean ${bedStats.mean}dB  peak ${bedStats.peak}dB  (${MUSIC_ONLY ? "uncarved" : "carved"} + ${BED_ATTEN_DB}dB${breaths.length ? ` · ${breaths.length} scheduled breath${breaths.length === 1 ? "" : "s"} at ${breaths.map((b) => b.at.toFixed(1) + "s").join(", ")}` : ""})`);

  // ---- Step C — duck the bed against the VO ------------------------------
  if (MUSIC_ONLY) {
    console.log(`Step C  music_ducked   (skipped — nothing to duck against)`);
  } else {
  const DUCKED = join(tmp, "music_ducked.wav");
  // A low threshold follows speech with a release long enough to bridge words.
  // Blend a dry floor with the compressed bed: --duck is a real maximum
  // reduction, also for a continuous read, instead of an unrelated ratio.
  const floor = 10 ** (-DUCK_DEPTH / 20);
  await sh([
    "-i", BED, "-i", VO_FULL,
    "-filter_complex",
    `[0:a]asplit=2[dry][wet];[wet][1:a]sidechaincompress=` +
    `threshold=0.02:ratio=10:attack=15:release=350:makeup=1[compressed];` +
    `[dry]volume=${floor}[floor];[compressed]volume=${1 - floor}[duck];` +
    `[floor][duck]amix=inputs=2:normalize=0[out]`,
    "-map", "[out]", "-ar", "48000", "-ac", "2", "-c:a", "pcm_f32le", DUCKED,
  ]);
  const duckStats = await meanVolume(DUCKED);
  console.log(`Step C  music_ducked   mean ${duckStats.mean}dB  peak ${duckStats.peak}dB  (sidechained to VO)`);
  BED = DUCKED;
  }
}

// ---------------------------------------------------------------------------
// 4. Step D — final assembly
// ---------------------------------------------------------------------------
const stems = MUSIC_ONLY ? [] : [await muffleStem(VO_FULL, "vo")];
if (BED) {
  BED = await muffleStem(BED, "bed");
  stems.push(BED);
}
let SFX_STEM = null;
if (SFX) {
  const sfxPath = abs(SFX);
  if (!existsSync(sfxPath)) { console.error(`SFX bus not found: ${sfxPath}`); process.exit(1); }
  SFX_STEM = sfxPath;
  if (SFX_TRIM_DB !== 0) {
    SFX_STEM = join(tmp, "sfx_trimmed.wav");
    await sh(["-i", sfxPath, "-af", `volume=${SFX_TRIM_DB}dB`,
      "-ar", "48000", "-ac", "2", "-c:a", "pcm_f32le", SFX_STEM]);
    const t = await meanVolume(SFX_STEM);
    console.log(`Step C2 sfx_trimmed    mean ${t.mean}dB  (${SFX_TRIM_DB > 0 ? "+" : ""}${SFX_TRIM_DB}dB SFX trim)`);
  }
  SFX_STEM = await muffleStem(SFX_STEM, "sfx");
  stems.push(SFX_STEM);
}

// Check unquantized stems before writing the mix. A final limiter can hide
// bad gain staging but cannot repair an intermediate that already clipped.
if (SFX_STEM) {
  const fx = await measureAudioWindows(SFX_STEM, DURATION);
  const issues = [];
  if (fx.clipped) issues.push(`${fx.clipped} SFX samples exceed full scale before the master limiter; lower --sfx-db`);
  if (MUSIC_ONLY && BED) {
    const bed = await measureAudioWindows(BED, DURATION);
    const bad = balanceProblems(bed, fx, { end: DURATION - 1.5 });
    if (bad.length) {
      const worst = bad.reduce((a, b) => a.reduceDb > b.reduceDb ? a : b);
      issues.push(`SFX overpower music near ${worst.t.toFixed(2)}s: RMS ${worst.meanDelta.toFixed(1)}dB / peak ${worst.peakDelta.toFixed(1)}dB above bed (limits 0 / 6dB). Lower --sfx-db by at least ${Math.ceil(worst.reduceDb)}dB or rebalance that cue`);
      issues.push(`For a global trim, re-run with --sfx-db ${SFX_TRIM_DB - Math.ceil(worst.reduceDb) - 1} (absolute gain, including 1dB margin); no SFX rebuild needed.`);
      issues.push("For per-cue edits, fix ALL affected ranges before rebuilding SFX + mixing:");
      for (const region of balanceRegions(bad)) {
        issues.push(`  ${region.start.toFixed(2)}–${Math.min(DURATION, region.end).toFixed(2)}s: reduce local SFX by at least ${Math.ceil(region.worst.reduceDb)}dB`);
      }
    }
  }
  if (issues.length) {
    rmSync(tmp, { recursive: true, force: true });
    console.error(`❌ Audio balance failed:\n${issues.map(x => "   " + x).join("\n")}`);
    process.exit(1);
  }
  console.log("   SFX headroom and local music balance verified (400ms windows / 100ms hops)");
}

// Rings go in last and untouched: not ducked, not muffled, not carved.
for (const [k, ring] of FX.rings.entries()) {
  const out = join(tmp, `ring_${k}.wav`);
  await sh(ringArgs(ring, DURATION + TAIL, out));
  stems.push(out);
  console.log(`Step R  ring ${k + 1}         ${ring.freq}Hz ${ring.level}dBFS ${ring.from.toFixed(2)}–${ring.to.toFixed(2)}s`);
}

const fadeOutAt = Math.max(0, DURATION - 1.5);
await sh([
  ...stems.flatMap(s => ["-i", s]),
  "-filter_complex",
  `${stems.map((_, i) => `[${i}:a]aresample=48000,aformat=channel_layouts=stereo[s${i}]`).join(";")};` +
  `${stems.map((_, i) => `[s${i}]`).join("")}amix=inputs=${stems.length}:dropout_transition=0:normalize=0[m];` +
  `[m]afade=t=in:d=0.3,afade=t=out:st=${fadeOutAt.toFixed(3)}:d=1.4,` +
  `apad=whole_dur=${(DURATION + TAIL).toFixed(3)},atrim=0:${(DURATION + TAIL).toFixed(3)},` +
  `alimiter=level=disabled:limit=0.95:latency=1[out]`,
  "-map", "[out]", "-ar", "48000", "-ac", "2", "-c:a", "pcm_s16le", MIXED,
]);

const outStats = await meanVolume(MIXED);
const outDur = await probeDur(MIXED);
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
// A continuous read leaves no music-only window at all; measure the ducked bed
// stem itself under the voice windows instead (same instant, voice vs bed).
const bedWindows = (!gapWindows.length && BED) ? voWindows.map(w => ({ ...w, label: `bed under ${w.label}`, file: BED })) : [];

async function measureWindow(w) {
  const f = join(tmp, `w_${Math.round(w.ss * 100)}_${w.file ? "bed" : "mix"}.wav`);
  await sh(["-i", w.file || MIXED, "-ss", String(w.ss), "-t", String(w.t), "-c:a", "pcm_s16le", f]);
  const m = await meanVolume(f);
  return { ...w, ...m };
}

console.log("\nStep E  verification by extraction");
const voM = [];
for (const w of voWindows) { const r = await measureWindow(w); voM.push(r); console.log(`   VO   ${r.mean.toFixed(1)}dB  ${r.label}`); }
const gapM = [];
for (const w of gapWindows) { const r = await measureWindow(w); gapM.push(r); console.log(`   GAP  ${r.mean.toFixed(1)}dB  ${r.label}`); }
for (const w of bedWindows) { const r = await measureWindow(w); gapM.push(r); console.log(`   BED  ${r.mean.toFixed(1)}dB  ${r.label}`); }

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
  if (contrast > 30 && MUSIC) console.log(`⚠ the bed sits ${contrast.toFixed(0)}dB under the voice — inaudible. Raise --bed-db or soften --duck; a bed should sit ~15–25dB under the voice.`);
  if (voAvg > VO_TARGET_MEAN + 4) console.log(`⚠ VO is hot (${voAvg.toFixed(1)}dB vs ~${VO_TARGET_MEAN}dB target)`);
  if (voAvg < VO_TARGET_MEAN - 6) console.log(`⚠ VO is quiet (${voAvg.toFixed(1)}dB vs ~${VO_TARGET_MEAN}dB target)`);
} else {
  console.log("\n⚠ not enough VO/gap windows to verify contrast — check the mix by ear.");
}

if (outDur < DURATION + 1.0) {
  console.log(`❌ mix is ${outDur.toFixed(2)}s — must extend ≥1.0s past the ${DURATION}s timeline (capture muxes with -shortest).`);
  failed = true;
}

if (!failed && !problems.length) renameSync(MIXED, OUT);
console.log(`\n${failed || problems.length ? "⚠ Mix rejected; previous output preserved:" : "✅"} ${OUT}`);
// The export/idle safety net uses this same script. Keep explicit mix choices
// across its automatic rebuilds instead of reverting to the default gains.
if (!failed && !problems.length && !flag("out")) {
  // Keep keys other tools own (sfx-pack, sfx-density) across a level rewrite.
  const next = JSON.stringify({ ...settings, "bed-db": BED_ATTEN_DB, "sfx-db": SFX_TRIM_DB, duck: DUCK_DEPTH, "no-breaths": NO_BREATHS }, null, 2);
  if (!existsSync(SETTINGS) || readFileSync(SETTINGS, "utf8") !== next) {
    writeFileSync(SETTINGS, next);
    const mixedAt = statSync(OUT).mtime;
    utimesSync(SETTINGS, mixedAt, mixedAt);
  }
  console.log("   The studio preview and Export use audio/mix.wav automatically; no shots.js or index.html audio wiring is needed. If the picture checks are complete, report the actual runtime and finish. Launch MP4 export belongs to the user: do not render a review copy or a final video. A level-only edit needs no visual audit.");
}
rmSync(tmp, { recursive: true, force: true });
process.exit(failed || problems.length ? 1 : 0);
