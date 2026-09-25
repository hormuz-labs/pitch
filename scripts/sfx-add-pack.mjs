#!/usr/bin/env node
/**
 * sfx-add-pack.mjs — merge a hand-curated SFX pack into the vendored manifest.
 *
 * sfx-index.mjs + sfx-vendor.mjs rebuild the whole library from its source
 * packs by filename rules. A small pack worth curating by ear is better indexed
 * by hand: a spec in .pi/scripts/launch-video/data/sfx-packs/<pack>.json names
 * every clip's event, what it sounds like, what it is for, the slice to keep
 * and where its moment lands (`hit`). This script transcodes each clip (or its
 * slice) to Opus under assets/sfx-lib/<event>/, measures the shipped file, and
 * replaces that pack's entries in data/sfx-index.json, leaving every other clip
 * alone. It is idempotent: re-run it after editing the spec.
 *
 *   node scripts/sfx-add-pack.mjs                     # every spec in data/sfx-packs/
 *   node scripts/sfx-add-pack.mjs --pack=gakuyen      # one spec
 *   node scripts/sfx-add-pack.mjs --pack=gakuyen --dry-run
 *
 * sfx-vendor.mjs rewrites the manifest from scratch; run this again after it.
 */
import { execFile } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..");
const DATA = join(REPO, ".pi", "scripts", "launch-video", "data");
const MANIFEST = join(DATA, "sfx-index.json");
const PACKS = join(DATA, "sfx-packs");
const LIB = join(REPO, "assets", "sfx-lib");

const argv = process.argv.slice(2);
const flag = (n, d = null) => {
  const hit = argv.find(a => a.startsWith(`--${n}=`));
  if (hit) return hit.slice(n.length + 3);
  return argv.includes(`--${n}`) ? true : d;
};
const DRY = !!flag("dry-run");
const BITRATE = flag("bitrate", "112k");
const only = flag("pack");

/** Onset, audible length, loudness, and where the energy peaks (10ms frames). */
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
  const lastStart = starts.length ? starts.at(-1) : null;
  const closed = spans.length ? spans.at(-1)[0] : null;
  const trailingStart = lastStart != null && lastStart !== closed ? lastStart : null;
  const onset = Number(Math.max(0, spans.length && spans[0][0] <= 0.02 ? spans[0][1] : 0).toFixed(3));
  const effDur = Math.max(0.01, (trailingStart ?? dur) - onset);
  const i = stderr.match(/I:\s*(-?\d+(?:\.\d+)?)\s*LUFS/g);
  const p = stderr.match(/Peak:\s*(-?\d+(?:\.\d+)?)\s*dBFS/g);
  let lufs = i ? Number(i.at(-1).match(/(-?\d+(?:\.\d+)?)/)[1]) : null;
  let peak = p ? Number(p.at(-1).match(/(-?\d+(?:\.\d+)?)/)[1]) : null;
  if (!Number.isFinite(lufs) || lufs <= -69) lufs = null;
  if (!Number.isFinite(peak)) peak = null;
  const env = await envelope(file);
  return {
    dur: Number(dur.toFixed(3)), onset, lufs, peak, peakAt: env.peakAt,
    effDur: Number(Math.min(effDur, Math.max(0.05, env.tail - onset)).toFixed(3)),
  };
}

/**
 * The 10ms energy envelope: where the loudest frame is, and where the sound
 * really ends (the last frame within 40dB of the peak and above -60dBFS). The
 * silence detector alone reads a -50dB noise floor as sound and gives a 0.7s
 * whoosh a 3.8s tail, which makes every whoosh look "sustained".
 */
async function envelope(file) {
  const { stdout } = await execFileAsync("ffmpeg", [
    "-v", "error", "-i", file, "-ac", "1", "-ar", "16000", "-f", "s16le", "-",
  ], { encoding: "buffer", maxBuffer: 64 * 1024 * 1024 });
  const hop = 160, frames = [];
  for (let f = 0; f * hop * 2 < stdout.length; f++) {
    let e = 0, n = 0;
    for (let s = f * hop; s < (f + 1) * hop && s * 2 + 1 < stdout.length; s++) {
      const v = stdout.readInt16LE(s * 2) / 32768;
      e += v * v; n++;
    }
    frames.push(10 * Math.log10(e / Math.max(1, n) + 1e-12));
  }
  const top = Math.max(...frames);
  const at = frames.indexOf(top);
  const floor = Math.max(-60, top - 40);
  let last = at;
  for (let f = frames.length - 1; f > at; f--) if (frames[f] > floor) { last = f; break; }
  return { peakAt: Number((at * hop / 16000).toFixed(3)), tail: Number(((last + 1) * hop / 16000).toFixed(3)) };
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) { const idx = i++; out[idx] = await fn(items[idx], idx); }
  }));
  return out;
}

// ---------------------------------------------------------------------------
if (!existsSync(MANIFEST)) {
  console.error(`No manifest at ${relative(REPO, MANIFEST)} — run scripts/sfx-index.mjs and sfx-vendor.mjs first.`);
  process.exit(1);
}
const manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
const specs = readdirSync(PACKS).filter(f => f.endsWith(".json"))
  .map(f => JSON.parse(readFileSync(join(PACKS, f), "utf8")))
  .filter(s => !only || s.pack === only);
if (!specs.length) { console.error(`No pack spec${only ? ` '${only}'` : ""} in ${relative(REPO, PACKS)}`); process.exit(1); }

for (const spec of specs) {
  const src = resolve(REPO, spec.source);
  if (!existsSync(src)) { console.error(`✗ ${spec.pack}: source not found: ${spec.source}`); process.exit(1); }
  const missing = spec.clips.filter(c => !existsSync(join(src, c.file)));
  if (missing.length) { console.error(`✗ ${spec.pack}: missing files:\n  ${missing.map(c => c.file).join("\n  ")}`); process.exit(1); }
  const ids = new Set();
  for (const c of spec.clips) {
    if (ids.has(c.id)) { console.error(`✗ duplicate id ${c.id}`); process.exit(1); }
    ids.add(c.id);
  }
  console.log(`${spec.title}: ${spec.clips.length} clips → ${relative(REPO, LIB)}/<event>/`);
  if (DRY) { for (const c of spec.clips) console.log(`  ${c.event.padEnd(12)} ${c.id}${c.slice ? `  [${c.slice.join("–")}s]` : ""}`); continue; }

  // Drop this pack's previous files and entries, so a changed spec never leaves strays.
  for (const c of manifest.clips.filter(c => c.pack === spec.pack)) rmSync(join(REPO, c.path), { force: true });
  manifest.clips = manifest.clips.filter(c => c.pack !== spec.pack);

  const clips = await mapLimit(spec.clips, 6, async (c) => {
    const dest = join(LIB, c.event, `${c.id}.opus`);
    mkdirSync(dirname(dest), { recursive: true });
    const cut = c.slice ? ["-ss", String(c.slice[0]), "-to", String(c.slice[1])] : [];
    // A short fade on sliced edges so a cut mid-room-tone never clicks.
    const fades = c.slice ? ["-af", `afade=t=in:d=0.004,areverse,afade=t=in:d=0.03,areverse`] : [];
    await execFileAsync("ffmpeg", [
      "-hide_banner", "-loglevel", "error", "-y", ...cut, "-i", join(src, c.file), ...fades,
      "-c:a", "libopus", "-b:a", BITRATE, "-vbr", "on", "-application", "audio", dest,
    ], { timeout: 120000 });
    const a = await analyze(dest);
    if (!a) throw new Error(`could not measure ${relative(REPO, dest)}`);
    // `hit` in the spec is from the onset; otherwise the loudest frame is the moment.
    const hit = Number((c.hit ?? Math.max(0, a.peakAt - a.onset)).toFixed(3));
    return {
      id: `${spec.pack}/${c.event}/${c.id}`,
      path: relative(REPO, dest),
      event: c.event,
      dur: a.dur, onset: a.onset, effDur: a.effDur, lufs: a.lufs, peak: a.peak,
      hit,
      desc: c.desc, tags: c.tags || [], use: c.use,
      pack: spec.pack, trust: spec.trust ?? 4,
      bytes: statSync(dest).size, ext: "opus",
      origin: `${spec.source}/${c.file}${c.slice ? `#${c.slice.join("-")}` : ""}`,
    };
  });
  manifest.clips.push(...clips);
  manifest.packs = { ...(manifest.packs || {}), [spec.pack]: { title: spec.title, trust: spec.trust ?? 4, roles: spec.roles || {} } };
  for (const c of clips) {
    console.log(`  ${c.event.padEnd(12)} ${c.effDur.toFixed(2).padStart(5)}s  hit ${c.hit.toFixed(2)}s  ${c.lufs == null ? "  —  " : c.lufs.toFixed(1).padStart(5)} LUFS  ${c.id}`);
  }
}
if (DRY) { console.log("\n--dry-run: nothing written."); process.exit(0); }

manifest.clips.sort((a, b) => a.event.localeCompare(b.event) || b.trust - a.trust || a.effDur - b.effDur);
const byEvent = {};
for (const c of manifest.clips) byEvent[c.event] = (byEvent[c.event] || 0) + 1;
manifest.events = Object.fromEntries(Object.entries({
  ...manifest.events,
  ring: manifest.events.ring || { use: "stunned silence, a tinnitus ring after an impact, the muffled/deaf beat", maxDur: 12 },
}).map(([k, v]) => [k, { ...v, count: byEvent[k] || 0 }]));
manifest.total = manifest.clips.length;
manifest.generated = new Date().toISOString();
writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2));
console.log(`\n✅ manifest: ${manifest.total} clips → ${relative(REPO, MANIFEST)}`);
