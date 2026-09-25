#!/usr/bin/env node
/**
 * tighten.mjs — edit the breaths out of a narration read.
 *
 *   node tighten.mjs --vo=audio/vo.wav [--max=0.2] [--floor=-40]
 *
 * Short-form ads run their voice continuously: across five reference ads there
 * is at most one pause of 0.3s or more per 30 seconds. A TTS take breathes
 * between sentences. This shortens every internal silence longer than `max`
 * seconds down to `max` (half kept on each side, so no word is clipped),
 * leaves the head and tail alone, and writes the result over the read with the
 * original kept as <name>.untightened.<ext>. Re-run `pitch motion align`
 * afterwards: every word after the first cut has moved.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { copyFileSync, existsSync, renameSync } from "node:fs";
import { extname, relative, resolve } from "node:path";

const argv = process.argv.slice(2);
const flag = (name, dflt = null) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : dflt;
};
const fail = (msg) => { console.error(`❌ ${msg}`); process.exit(1); };
const ws = process.cwd();
const voArg = flag("vo", "audio/vo.wav");
const vo = resolve(ws, voArg);
if (relative(ws, vo).startsWith("..")) fail("--vo must be inside the project");
if (!existsSync(vo)) fail(`${voArg} does not exist — record the read first (pitch motion tts)`);
const max = Number(flag("max", 0.2));
const floor = Number(flag("floor", -40));
if (!(max >= 0.05 && max <= 1)) fail("--max is the longest pause to keep, 0.05–1 seconds");
if (!(floor <= -20 && floor >= -70)) fail("--floor is the silence threshold in dBFS, -70 to -20");

const probe = (f) => Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f], { encoding: "utf8" }).trim());
const total = probe(vo);
const log = spawnSync("ffmpeg", ["-hide_banner", "-nostdin", "-i", vo, "-af", `silencedetect=noise=${floor}dB:d=${max}`, "-f", "null", "-"], { encoding: "utf8" }).stderr || "";
const starts = [...log.matchAll(/silence_start: ([\d.]+)/g)].map((m) => Number(m[1]));
const ends = [...log.matchAll(/silence_end: ([\d.]+)/g)].map((m) => Number(m[1]));
// Internal gaps only: a silence touching the head or the tail is left as it is.
const gaps = starts.map((s, i) => [s, ends[i]]).filter(([s, e]) => Number.isFinite(e) && s > 0.05 && e < total - 0.05 && e - s > max + 0.01);
if (!gaps.length) { console.log(`✅ ${voArg}: no internal pause longer than ${max}s — nothing to tighten (${total.toFixed(2)}s).`); process.exit(0); }

// Keep [0, g0.s + max/2], [g0.e - max/2, g1.s + max/2], …, [gN.e - max/2, end].
const keep = [];
let from = 0;
for (const [s, e] of gaps) { keep.push([from, s + max / 2]); from = e - max / 2; }
keep.push([from, total]);
const chains = keep.map(([a, b], i) => `[0:a]atrim=${a.toFixed(4)}:${b.toFixed(4)},asetpts=PTS-STARTPTS[s${i}]`).join(";");
const graph = `${chains};${keep.map((_, i) => `[s${i}]`).join("")}concat=n=${keep.length}:v=0:a=1[out]`;
const ext = extname(vo).toLowerCase();
const tmp = vo.replace(/(\.\w+)$/, ".tight$1");
const codec = ext === ".mp3" ? ["-c:a", "libmp3lame", "-b:a", "192k"] : ext === ".wav" ? ["-c:a", "pcm_s16le"] : [];
execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-nostdin", "-y", "-i", vo, "-filter_complex", graph, "-map", "[out]", ...codec, tmp]);
const backup = vo.replace(/(\.\w+)$/, ".untightened$1");
if (!existsSync(backup)) copyFileSync(vo, backup);
renameSync(tmp, vo);
const after = probe(vo);
const removed = gaps.reduce((t, [s, e]) => t + (e - s - max), 0);
console.log(`✂️  ${voArg}: ${gaps.length} pause${gaps.length === 1 ? "" : "s"} over ${max}s shortened — ${total.toFixed(2)}s → ${after.toFixed(2)}s (${removed.toFixed(2)}s of breath removed).`);
console.log(`   longest cut: ${Math.max(...gaps.map(([s, e]) => e - s)).toFixed(2)}s at ${gaps.reduce((a, g) => (g[1] - g[0] > a[1] - a[0] ? g : a))[0].toFixed(2)}s · original kept as ${relative(ws, backup)}`);
console.log(`   next: pitch motion align (every word after the first cut has moved), then pitch motion sync --write.`);
