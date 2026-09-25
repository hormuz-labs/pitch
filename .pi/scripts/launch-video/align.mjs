#!/usr/bin/env node
/**
 * align.mjs — word-level timestamps for the ONE continuous narration read.
 *
 *   node align.mjs --vo=audio/vo.wav [--script=audio/vo.txt] [--out=audio/vo-words.json]
 *                  [--model=~/.cache/whisper-cpp/ggml-large-v3-turbo.bin] [--lang=en]
 *
 * WHY: narration is recorded as a single read (natural prosody, no per-clip
 * restarts), so the picture must be cut TO the words. This script transcribes
 * the read with whisper.cpp (`whisper-cli`, local, ~3s for 30s of audio),
 * then aligns the KNOWN script to the transcript with a sequence alignment,
 * so every script word gets an onset even where the recogniser misheard it.
 * sync.mjs and audit.mjs consume the result via lib/vo-words.mjs.
 *
 * Output: audio/vo-words.json — { file, duration, text, matched, words:[{w,n,s,e,src}] }
 */
import { execFileSync, execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { availableParallelism, cpus, homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { normWord, speechGaps, tokenize, wordsPathFor } from "./lib/vo-words.mjs";

const argv = process.argv.slice(2);
const flag = (name, dflt = null) => {
  const hit = argv.find(a => a.startsWith(`--${name}=`));
  if (hit) return hit.slice(name.length + 3);
  return argv.includes(`--${name}`) ? true : dflt;
};

function defaultWhisperThreads() {
  const env = process.env.WHISPER_THREADS;
  if (env) {
    const parsed = parseInt(env, 10);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  const total = typeof availableParallelism === "function" ? availableParallelism() : cpus().length;
  if (total <= 4) return total;
  if (total <= 8) return Math.min(total, 6);
  return Math.min(Math.floor(total / 2), 12);
}

const VO = resolve(flag("vo", "audio/vo.wav"));
if (!existsSync(VO)) { console.error(`❌ narration not found: ${VO} — run motion_tts first.`); process.exit(1); }
const OUT = resolve(flag("out", wordsPathFor(VO)));
const LANG = flag("lang", "en");
const WHISPER = flag("whisper", process.env.WHISPER_CLI || "whisper-cli");
const THREADS = flag("threads", defaultWhisperThreads());

let scriptText = flag("text", null);
const scriptFile = flag("script", null) || VO.replace(/\.\w+$/, ".txt");
if (!scriptText) {
  if (!existsSync(scriptFile)) {
    console.error(`❌ no script text: pass --script=<file> or --text=…  (motion_tts writes ${basename(scriptFile)} next to the WAV).`);
    process.exit(1);
  }
  scriptText = readFileSync(scriptFile, "utf8");
}
// ElevenLabs v3 delivery tags ([excited], [whispers], [pause]) steer the read
// but are never spoken; aligning them as words would shift every onset after.
scriptText = scriptText.replace(/\[[^\]\n]{1,40}\]/g, " ").replace(/\s+/g, " ").trim();

function findModel() {
  const explicit = flag("model", process.env.WHISPER_MODEL || null);
  if (explicit && existsSync(explicit.replace(/^~/, homedir()))) {
    return explicit.replace(/^~/, homedir());
  }
  const dirs = [
    join(homedir(), ".cache/whisper-cpp"),
    "/usr/local/share/whisper.cpp/models",
    resolve("docker-data/whisper"),
  ];
  const models = [
    "ggml-large-v3-turbo.bin",
    "ggml-large-v3.bin",
    "ggml-medium.en.bin",
    "ggml-small.en.bin",
    "ggml-base.en.bin",
  ];
  for (const dir of dirs) {
    for (const m of models) {
      const p = join(dir, m);
      if (existsSync(p)) return p;
    }
  }
  return null;
}
const MODEL = findModel();
if (!MODEL) {
  // Deliberately NOT a runnable command: this is a host provisioning gap, and
  // the agent's shell is a network-less VM. An agent handed a curl line has
  // run it in the guest, watched it fail, and then hand-written a fake word
  // timeline rather than stopping.
  console.error("❌ no whisper.cpp model on the host, so narration cannot be aligned.\n" +
    "   This is a host setup problem you cannot fix from your shell — do NOT hand-write\n" +
    "   audio/vo-words.json, and do NOT run motion_sync against invented timings.\n" +
    "   Tell the user: the studio needs a ggml model in the whisper cache volume\n" +
    "   (docker-data/whisper), or WHISPER_MODEL pointing at one.");
  process.exit(1);
}
try { execFileSync("which", [WHISPER], { stdio: "pipe" }); } catch {
  console.error(`❌ ${WHISPER} not on PATH — brew install whisper-cpp (or set WHISPER_CLI).`);
  process.exit(1);
}

// --- 1. transcribe (16 kHz mono is what whisper.cpp wants) -------------------
const tmp = join(dirname(OUT), ".align");
rmSync(tmp, { recursive: true, force: true });
mkdirSync(tmp, { recursive: true });
const wav16 = join(tmp, "vo16.wav");
execSync(`ffmpeg -hide_banner -loglevel error -y -i "${VO}" -ar 16000 -ac 1 "${wav16}"`, { stdio: "pipe" });
const duration = Number(execSync(`ffprobe -v quiet -show_entries format=duration -of csv=p=0 "${VO}"`).toString().trim());

const jsonBase = join(tmp, "words");
const prompt = scriptText.slice(0, 600);   // biases the recogniser toward the real copy (brand names, numbers)
try {
  execFileSync(WHISPER, ["-m", MODEL, "-f", wav16, "-t", String(THREADS), "-l", LANG, "-ml", "1", "-sow", "-oj", "-of", jsonBase, "-np",
    "--prompt", prompt], { stdio: "pipe", maxBuffer: 32 * 1024 * 1024 });
} catch (err) {
  // A broken whisper-cli (missing shared library, bad model file) is a host
  // problem. Say so in one line rather than dumping a Node stack the agent
  // then spends turns investigating from inside a sandbox that cannot fix it.
  const detail = String(err.stderr || err.message || err).trim().split("\n").filter(Boolean).slice(-3).join(" | ");
  console.error(`❌ whisper-cli failed on the host, so the narration cannot be aligned: ${detail}\n` +
    "   This is a studio installation problem (the whisper.cpp build in Dockerfile.base), not something you can fix from the workspace. Report it and stop.");
  process.exit(1);
}
const raw = JSON.parse(readFileSync(jsonBase + ".json", "utf8"));
const heard = (raw.transcription || [])
  .map(t => ({ w: t.text.trim(), s: t.offsets.from / 1000, e: t.offsets.to / 1000 }))
  .filter(t => normWord(t.w).length > 0)
  .map(t => ({ ...t, n: normWord(t.w) }));
rmSync(tmp, { recursive: true, force: true });

if (!heard.length) { console.error("❌ whisper heard nothing — is the WAV silent?"); process.exit(1); }

// --- 2. align the known script to what was heard ------------------------------
function lev(a, b) {
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}
const sim = (a, b) => (a === b ? 1 : 1 - lev(a, b) / Math.max(a.length, b.length));

const script = tokenize(scriptText).map(w => ({ w, n: normWord(w) }));
const S = script.length, T = heard.length;
const GAP = -0.45, MISS = -0.6, MATCH_MIN = 0.55;
// DP over script × heard: maximise similarity, penalise gaps.
const score = Array.from({ length: S + 1 }, () => new Float64Array(T + 1));
const back = Array.from({ length: S + 1 }, () => new Int8Array(T + 1));
for (let i = 1; i <= S; i++) { score[i][0] = i * GAP; back[i][0] = 1; }
for (let j = 1; j <= T; j++) { score[0][j] = j * GAP; back[0][j] = 2; }
for (let i = 1; i <= S; i++) {
  for (let j = 1; j <= T; j++) {
    const s = sim(script[i - 1].n, heard[j - 1].n);
    const diag = score[i - 1][j - 1] + (s >= MATCH_MIN ? s : MISS);
    const up = score[i - 1][j] + GAP;     // script word unheard
    const left = score[i][j - 1] + GAP;   // heard word not in script
    if (diag >= up && diag >= left) { score[i][j] = diag; back[i][j] = 0; }
    else if (up >= left) { score[i][j] = up; back[i][j] = 1; }
    else { score[i][j] = left; back[i][j] = 2; }
  }
}
const matchOf = new Array(S).fill(-1);
for (let i = S, j = T; i > 0 || j > 0;) {
  const b = back[i][j];
  if (b === 0) { if (sim(script[i - 1].n, heard[j - 1].n) >= MATCH_MIN) matchOf[i - 1] = j - 1; i--; j--; }
  else if (b === 1) i--;
  else j--;
}

// --- 3. every script word gets a time: matched → heard; else interpolate ------
const words = script.map((w, i) => ({ w: w.w, n: w.n, s: null, e: null, src: matchOf[i] >= 0 ? "heard" : "interp" }));
words.forEach((w, i) => { if (matchOf[i] >= 0) { w.s = heard[matchOf[i]].s; w.e = heard[matchOf[i]].e; } });
const matched = words.filter(w => w.src === "heard").length;
const firstIdx = words.findIndex(w => w.s !== null);
if (firstIdx < 0) { console.error("❌ nothing in the script matched the recording — wrong file or wrong script?"); process.exit(1); }
// leading / trailing unmatched words: extrapolate at an average speaking rate
const RATE = 0.28;
for (let i = firstIdx - 1; i >= 0; i--) { words[i].e = words[i + 1].s - 0.02; words[i].s = Math.max(0, words[i].e - RATE); }
let lastIdx = S - 1; while (words[lastIdx].s === null) lastIdx--;
for (let i = lastIdx + 1; i < S; i++) { words[i].s = words[i - 1].e + 0.02; words[i].e = Math.min(duration, words[i].s + RATE); }
// interior gaps: spread by character count between the surrounding anchors
for (let i = 0; i < S; i++) {
  if (words[i].s !== null) continue;
  let a = i - 1, b = i; while (words[b].s === null) b++;
  const span0 = words[a].e, span1 = words[b].s;
  const chunk = words.slice(a + 1, b);
  const chars = chunk.reduce((t, w) => t + w.n.length + 1, 0);
  let t = span0;
  for (const w of chunk) { const d = (span1 - span0) * (w.n.length + 1) / chars; w.s = t; w.e = t + d * 0.9; t += d; }
  i = b;
}
// enforce monotonic, non-negative
for (let i = 0; i < S; i++) {
  if (i && words[i].s < words[i - 1].e) words[i].s = words[i - 1].e;
  if (words[i].e < words[i].s + 0.04) words[i].e = words[i].s + 0.04;
  words[i].s = +words[i].s.toFixed(3); words[i].e = +words[i].e.toFixed(3);
}

const result = {
  file: VO.includes(process.cwd()) ? VO.slice(process.cwd().length + 1) : VO,
  duration: +duration.toFixed(3),
  model: basename(MODEL),
  text: scriptText,
  heard: heard.map(h => h.w).join(" "),
  matched: +(matched / S).toFixed(3),
  speechStart: words[0].s,
  speechEnd: words[S - 1].e,
  words,
};
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(result, null, 1));

// --- 4. report ----------------------------------------------------------------
const rel = p => (p.startsWith(process.cwd()) ? p.slice(process.cwd().length + 1) : p);
console.log(`🗣  ${rel(VO)} — ${duration.toFixed(2)}s, ${S} words, ${(S / (words[S - 1].e - words[0].s)).toFixed(2)} words/s, speech ${words[0].s.toFixed(2)}→${words[S - 1].e.toFixed(2)}s`);
console.log(`   matched ${matched}/${S} script words to the recording (${(100 * matched / S).toFixed(0)}%), model ${basename(MODEL)}`);
const gaps = speechGaps(words, 0.5);
if (gaps.length) console.log(`   breaths ≥0.5s: ${gaps.slice(0, 6).map(g => `${g.dur}s after "${g.after}"`).join(", ")}`);
const line = [];
for (const w of words) line.push(`${w.s.toFixed(2)} ${w.w}${w.src === "interp" ? "?" : ""}`);
console.log("\n   " + line.join("  ·  ").replace(/(.{110,}?)  ·  /g, "$1\n   "));
console.log(`\n✨ ${rel(OUT)}  (words marked ? were interpolated, not heard)`);
if (matched / S < 0.6) {
  console.error(`\n❌ only ${(100 * matched / S).toFixed(0)}% of the script was recognised — is ${rel(scriptFile)} the text that was actually spoken?`);
  process.exit(1);
}
