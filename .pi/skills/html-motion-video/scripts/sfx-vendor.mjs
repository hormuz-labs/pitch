#!/usr/bin/env node
/**
 * sfx-vendor.mjs — vendor the curated SFX into the repo, small enough to commit.
 *
 * The raw libraries are hundreds of MB, most of it never used. This copies ONLY
 * the clips the manifest actually indexes into `assets/sfx-lib/<event>/`,
 * transcoding WAV to Opus on the way (~16x smaller, transparent at the levels
 * SFX play at), and rewrites the manifest to point at the vendored files.
 *
 * After this the SFX layer is self-contained: the manifest and its audio travel
 * together, the worker needs no access to the original packs, and the whole
 * thing is a normal git commit rather than an LFS problem.
 *
 *   node scripts/sfx-vendor.mjs              # vendor + re-measure + rewrite manifest
 *   node scripts/sfx-vendor.mjs --dry-run    # report what it would do
 *   node scripts/sfx-vendor.mjs --bitrate=128k
 *
 * WHY RE-MEASURE: encoding shifts integrated loudness slightly and Opus adds a
 * decoder pre-skip. The mixer places transients by `onset` and matches levels by
 * `lufs`, so those numbers must describe the files we actually ship — copying
 * the old measurements across would silently reintroduce the sync and level
 * errors the manifest exists to prevent.
 *
 * The original packs stay where they are (gitignore them). They are the source;
 * `assets/sfx-lib/` is the derived artifact. Re-run this after any re-index.
 */
import { execFile } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const HERE = dirname(fileURLToPath(import.meta.url));
const SKILL = resolve(HERE, "..");
const REPO = resolve(SKILL, "..", "..", "..");
const MANIFEST = join(SKILL, "data", "sfx-index.json");

const argv = process.argv.slice(2);
const flag = (n, d = null) => {
  const hit = argv.find(a => a.startsWith(`--${n}=`));
  if (hit) return hit.slice(n.length + 3);
  return argv.includes(`--${n}`) ? true : d;
};
const DRY = !!flag("dry-run");
const BITRATE = flag("bitrate", "96k");
const OUT_ROOT = resolve(REPO, flag("out", "assets/sfx-lib"));

if (!existsSync(MANIFEST)) {
  console.error(`No manifest at ${MANIFEST} — run scripts/sfx-index.mjs first.`);
  process.exit(1);
}
const manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));

/** Same one-pass analysis the indexer uses — see sfx-index.mjs for the why. */
async function analyze(file) {
  let stderr = "";
  try {
    ({ stderr } = await execFileAsync("ffmpeg", [
      "-hide_banner", "-nostats", "-i", file,
      "-af", "silencedetect=n=-50dB:d=0.02,ebur128=peak=true", "-f", "null", "-",
    ], { timeout: 60000, maxBuffer: 8 * 1024 * 1024 }));
  } catch (err) { stderr = err?.stderr || ""; }

  const durM = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  const dur = durM ? Number(durM[1]) * 3600 + Number(durM[2]) * 60 + Number(durM[3]) : null;
  if (dur == null) return null;

  const spans = [];
  const re = /silence_start:\s*(-?\d+(?:\.\d+)?)[\s\S]*?silence_end:\s*(\d+(?:\.\d+)?)/g;
  let m; while ((m = re.exec(stderr))) spans.push([Number(m[1]), Number(m[2])]);
  const starts = [...stderr.matchAll(/silence_start:\s*(-?\d+(?:\.\d+)?)/g)].map(x => Number(x[1]));
  const lastStart = starts.length ? starts[starts.length - 1] : null;
  const closed = spans.length ? spans[spans.length - 1][0] : null;
  const trailingStart = lastStart != null && lastStart !== closed ? lastStart : null;

  const lead = spans.length && spans[0][0] <= 0.02 ? spans[0][1] : 0;
  const tail = trailingStart != null ? trailingStart : dur;
  const onset = Number(Math.max(0, lead).toFixed(3));
  const effDur = Number(Math.max(0.01, tail - onset).toFixed(3));

  const i = stderr.match(/I:\s*(-?\d+(?:\.\d+)?)\s*LUFS/g);
  const p = stderr.match(/Peak:\s*(-?\d+(?:\.\d+)?)\s*dBFS/g);
  let lufs = i ? Number(i[i.length - 1].match(/(-?\d+(?:\.\d+)?)/)[1]) : null;
  let peak = p ? Number(p[p.length - 1].match(/(-?\d+(?:\.\d+)?)/)[1]) : null;
  if (!Number.isFinite(lufs)) lufs = null;
  if (!Number.isFinite(peak)) peak = null;

  return { dur: Number(dur.toFixed(3)), onset, effDur, lufs, peak };
}

const slug = s => basename(s, extname(s))
  .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48);

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) { const idx = i++; out[idx] = await fn(items[idx], idx); }
  }));
  return out;
}

// ---------------------------------------------------------------------------
const plan = [];
const usedNames = new Set();
for (const c of manifest.clips) {
  const src = join(REPO, c.path);
  if (!existsSync(src)) { console.log(`⚠ missing source, skipping: ${c.path}`); continue; }
  // Already-compressed sources are copied, not re-encoded: lossy→lossy stacks
  // artifacts for almost no size win when the file is already small.
  const transcode = c.ext === "wav" || c.ext === "flac";
  let name = `${slug(c.path)}${transcode ? ".opus" : extname(c.path)}`;
  let n = 2;
  while (usedNames.has(`${c.event}/${name}`)) {
    name = `${slug(c.path)}-${n++}${transcode ? ".opus" : extname(c.path)}`;
  }
  usedNames.add(`${c.event}/${name}`);
  plan.push({ clip: c, src, transcode, dest: join(OUT_ROOT, c.event, name) });
}

const srcBytes = plan.reduce((t, p) => t + statSync(p.src).size, 0);
const toTranscode = plan.filter(p => p.transcode).length;
console.log(`Vendoring ${plan.length} clips → ${relative(REPO, OUT_ROOT)}`);
console.log(`  ${toTranscode} WAV → Opus @ ${BITRATE}, ${plan.length - toTranscode} already-compressed copied as-is`);
console.log(`  source size: ${(srcBytes / 1e6).toFixed(1)} MB`);
if (DRY) { console.log("\n--dry-run: nothing written."); process.exit(0); }

rmSync(OUT_ROOT, { recursive: true, force: true });
for (const ev of new Set(plan.map(p => p.clip.event))) mkdirSync(join(OUT_ROOT, ev), { recursive: true });

let done = 0;
const results = await mapLimit(plan, 6, async (p) => {
  if (p.transcode) {
    await execFileAsync("ffmpeg", [
      "-hide_banner", "-loglevel", "error", "-y", "-i", p.src,
      "-c:a", "libopus", "-b:a", BITRATE, "-vbr", "on", "-application", "audio",
      p.dest,
    ], { timeout: 120000 });
  } else {
    copyFileSync(p.src, p.dest);
  }
  // Re-measure the SHIPPED file — see the header note.
  const a = await analyze(p.dest);
  done++;
  if (done % 40 === 0) console.log(`  … ${done}/${plan.length}`);
  if (!a) { console.log(`⚠ could not measure ${relative(REPO, p.dest)}`); return null; }
  return {
    ...p.clip,
    path: relative(REPO, p.dest),
    id: `vendored/${p.clip.event}/${basename(p.dest)}`,
    sourceId: p.clip.id,           // so cue sheets pinned pre-vendor still resolve
    pack: "vendored",
    // Trust is deliberately NOT flattened. It encodes which library a clip came
    // from, and auto-pick ranks by it — collapsing everything to one value
    // silently changed which clip every unpinned cue selected.
    trust: p.clip.trust,
    ext: extname(p.dest).slice(1),
    bytes: statSync(p.dest).size,
    dur: a.dur, onset: a.onset, effDur: a.effDur, lufs: a.lufs, peak: a.peak,
    origin: p.clip.path,           // provenance: where this came from
  };
});

const clips = results.filter(Boolean);
const outBytes = clips.reduce((t, c) => t + c.bytes, 0);

// Keep the pre-vendor manifest so the original packs remain re-indexable.
const sourceCopy = join(SKILL, "data", "sfx-index.source.json");
if (!existsSync(sourceCopy)) {
  writeFileSync(sourceCopy, JSON.stringify(manifest, null, 2));
  console.log(`\n  kept pre-vendor manifest → ${relative(REPO, sourceCopy)}`);
}

const byEvent = {};
for (const c of clips) (byEvent[c.event] ||= []).push(c);
clips.sort((a, b) => a.event.localeCompare(b.event) || a.effDur - b.effDur);

writeFileSync(MANIFEST, JSON.stringify({
  ...manifest,
  generated: new Date().toISOString(),
  generator: "scripts/sfx-vendor.mjs",
  vendored: true,
  note: "Vendored + re-measured. Audio lives in assets/sfx-lib/ and is committed with " +
        "this manifest. The original packs are the SOURCE (gitignored); re-run " +
        "sfx-index.mjs then sfx-vendor.mjs to rebuild.",
  roots: [{ pack: "vendored", path: relative(REPO, OUT_ROOT), trust: 3 }],
  total: clips.length,
  events: Object.fromEntries(Object.entries(manifest.events).map(([k, v]) =>
    [k, { ...v, count: (byEvent[k] || []).length }])),
  clips,
}, null, 2));

console.log(`\n✅ ${clips.length} clips vendored`);
console.log(`   ${(srcBytes / 1e6).toFixed(1)} MB → ${(outBytes / 1e6).toFixed(1)} MB ` +
  `(${(srcBytes / outBytes).toFixed(1)}x smaller)`);
console.log(`   manifest rewritten → ${relative(REPO, MANIFEST)}`);
console.log(`\nNext: rebuild a project's SFX bus and confirm the levels still match.`);
