#!/usr/bin/env node
/**
 * sfx.mjs — query the curated SFX manifest, and build a synced SFX bus.
 *
 * Two modes:
 *
 *   query — find clips for a motion event, ranked, with real measurements
 *     node scripts/sfx.mjs query --event=pop
 *     node scripts/sfx.mjs query --event=whoosh_deep --max=2.5 --limit=8
 *     node scripts/sfx.mjs query --list                       # event vocabulary
 *
 *   build — render audio/sfx_bus.wav from a cue sheet
 *     node scripts/sfx.mjs build --cues=audio/sfx-cues.json --duration=70.4
 *     node scripts/sfx.mjs build --cues=audio/sfx-cues.json --duration=70.4 --dry-run
 *
 * Run `build` from inside the project folder (paths in the cue sheet and the
 * --out path are resolved against CWD, like every other skill script).
 *
 * WHY THIS EXISTS: hand-rolled ffmpeg SFX chains lost cues silently, and clips
 * were scheduled at their file start rather than at their transient — so the
 * sound landed late by however much digital silence the file happened to carry
 * (up to 2.2s in this library). This tool places every cue by its measured
 * onset and prints a verifiable report of what it actually placed.
 */
import { execFile } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..", "..", "..");
const MANIFEST = join(HERE, "data", "sfx-index.json");

// ---------------------------------------------------------------------------
// Per-class mix targets. These are the levels the SFX bus is built AT, before
// it is mixed under VO and music (see references/sfx-design.md §4).
//
// Rationale: micro-UI events are punctuation and must never compete with the
// voice; travel sounds sit mid; only impacts/subdrops are allowed real weight,
// and only a few times per film.
// ---------------------------------------------------------------------------
const TARGET_LUFS = {
  tick: -34, pop: -30, click: -30, type: -32, data: -31, select: -29,
  notify: -28, chime: -27, camera: -29, success: -26,
  whoosh_soft: -28, whoosh_deep: -24, reverse: -27, glitch: -27,
  riser: -25, impact: -21, subdrop: -20,
};

/**
 * Travel sounds must PEAK on the beat, not start on it — a whoosh that begins
 * at the cut reads as late. These leads are subtracted from the cue time on
 * top of the onset correction.
 */
const DEFAULT_LEAD = {
  whoosh_soft: 0.12, whoosh_deep: 0.22, reverse: 0.30, riser: 0.0, subdrop: 0.06,
};

/** When an event has no clips of its own, borrow from a neighbour. */
const FALLBACK = {
  tick: ["click", "pop"],
  pop: ["click", "select"],
  select: ["click", "chime"],
  reverse: ["whoosh_soft", "whoosh_deep"],
  type: ["click"],
  notify: ["chime", "select"],
  success: ["chime", "notify"],
  whoosh_deep: ["whoosh_soft"],
  whoosh_soft: ["whoosh_deep"],
  subdrop: ["impact"],
};

const MAX_GAIN_DB = 18;

// ---------------------------------------------------------------------------
function loadManifest() {
  if (!existsSync(MANIFEST)) {
    throw new Error(
      `No SFX manifest at ${MANIFEST}\nRun: node scripts/sfx-index.mjs`
    );
  }
  return JSON.parse(readFileSync(MANIFEST, "utf8"));
}

const argv = process.argv.slice(2);
const MODE = argv[0];
const flag = (name, dflt = null) => {
  const hit = argv.find(a => a.startsWith(`--${name}=`));
  if (hit) return hit.slice(name.length + 3);
  return argv.includes(`--${name}`) ? true : dflt;
};

const abs = p => (isAbsolute(p) ? p : resolve(process.cwd(), p));
/** Manifest paths are repo-relative. */
const clipPath = c => join(REPO, c.path);

/**
 * Rank candidates by how little we have to do to them. A clip that already
 * sits near its class target needs little gain and survives the mix intact;
 * one needing +18dB is quiet because it is thin, and boosting it brings up
 * its noise floor with it.
 */
function rank(clips, target) {
  return [...clips].sort((a, b) => {
    if (b.trust !== a.trust) return b.trust - a.trust;
    const ga = a.lufs == null ? 6 : Math.abs(target - a.lufs);
    const gb = b.lufs == null ? 6 : Math.abs(target - b.lufs);
    if (Math.abs(ga - gb) > 3) return ga - gb;   // meaningfully less correction
    return a.effDur - b.effDur;                   // otherwise prefer the punchier one
  });
}

function pickFor(manifest, event, { max = null, exclude = new Set() } = {}) {
  const chain = [event, ...(FALLBACK[event] || [])];
  const target = TARGET_LUFS[event] ?? -28;
  const hitsFor = ev => manifest.clips.filter(c =>
    c.event === ev &&
    (max == null || c.effDur <= max) &&
    !exclude.has(c.id)
  );
  // A clip needing a huge correction is broken for this class (the core
  // count-tick.mp3 sits ~36dB below its target). Exhaust the WHOLE fallback
  // chain looking for a usable clip before settling for a broken one — an
  // explicit `clip` in the cue sheet always wins over both.
  const isUsable = c => c.lufs == null || Math.abs(target - c.lufs) <= 14;

  for (const ev of chain) {
    const usable = hitsFor(ev).filter(isUsable);
    if (usable.length) {
      return { clip: rank(usable, target)[0], borrowedFrom: ev === event ? null : ev };
    }
  }
  for (const ev of chain) {
    const any = hitsFor(ev);
    if (any.length) {
      return { clip: rank(any, target)[0], borrowedFrom: ev === event ? null : ev, degraded: true };
    }
  }
  return { clip: null, borrowedFrom: null };
}

// ---------------------------------------------------------------------------
// query
// ---------------------------------------------------------------------------
if (MODE === "query" || MODE === undefined) {
  const manifest = loadManifest();

  if (flag("list") || MODE === undefined) {
    console.log(`SFX manifest — ${manifest.total} curated clips, built ${manifest.generated.slice(0, 16).replace("T", " ")}\n`);
    console.log("EVENT          N     USE");
    for (const [ev, meta] of Object.entries(manifest.events)) {
      console.log(`${ev.padEnd(14)} ${String(meta.count).padStart(3)}   ${meta.use}`);
    }
    console.log(`\nQuery one: node scripts/sfx.mjs query --event=<name> [--max=<sec>] [--limit=<n>]`);
    process.exit(0);
  }

  const event = flag("event");
  if (!event) { console.error("--event=<name> required (or --list)"); process.exit(1); }
  const max = flag("max") ? Number(flag("max")) : null;
  const limit = Number(flag("limit", 12));

  const target0 = TARGET_LUFS[event] ?? -28;
  // Mirror auto-pick: a clip needing >14dB of correction is broken for this
  // class and must not be presented as a normal option.
  const pick = ev => {
    const all = manifest.clips.filter(c => c.event === ev && (max == null || c.effDur <= max));
    const usable = all.filter(c => c.lufs == null || Math.abs(target0 - c.lufs) <= 14);
    return { all, usable };
  };

  let { all, usable } = pick(event);
  let hits = usable;
  let note = "";
  if (!hits.length) {
    for (const fb of FALLBACK[event] || []) {
      const r = pick(fb);
      if (r.usable.length) {
        hits = r.usable;
        note = `  (no usable '${event}' clips${max ? ` under ${max}s` : ""} — showing fallback '${fb}')`;
        break;
      }
    }
  }
  const rejected = all.length - usable.length;
  if (!hits.length) { console.log(`No clips for '${event}'.`); process.exit(0); }

  console.log(`${event}${note}   target ${TARGET_LUFS[event] ?? -28} LUFS, default lead ${DEFAULT_LEAD[event] ?? 0}s\n`);
  console.log("  EFF    ONSET  LUFS    ID");
  hits = rank(hits, TARGET_LUFS[event] ?? -28);
  for (const c of hits.slice(0, limit)) {
    console.log(
      `  ${c.effDur.toFixed(2).padStart(5)}s ${c.onset.toFixed(2).padStart(5)}s ` +
      `${(c.lufs == null ? "  —  " : c.lufs.toFixed(1).padStart(6))}  ${c.id}`
    );
  }
  if (hits.length > limit) console.log(`  … ${hits.length - limit} more`);
  if (rejected > 0) {
    console.log(`\n  (${rejected} '${event}' clip(s) hidden: more than 14dB from the ${target0} LUFS target — too quiet or too hot to use straight)`);
  }
  process.exit(0);
}

// ---------------------------------------------------------------------------
// build
// ---------------------------------------------------------------------------
if (MODE !== "build") {
  console.error(`Unknown mode '${MODE}'. Use 'query' or 'build'.`);
  process.exit(1);
}

const manifest = loadManifest();
const cuesPath = abs(flag("cues", "audio/sfx-cues.json"));
if (!existsSync(cuesPath)) {
  console.error(`Cue sheet not found: ${cuesPath}`);
  process.exit(1);
}
const sheet = JSON.parse(readFileSync(cuesPath, "utf8"));
const cues = sheet.cues || [];
const defaults = sheet.defaults || {};
const duration = Number(flag("duration", sheet.duration || 0));
const outPath = abs(flag("out", "audio/sfx_bus.wav"));
const DRY = !!flag("dry-run");

if (!duration) {
  console.error("--duration=<seconds> required (timeline length from __DURATION()).");
  process.exit(1);
}
if (!cues.length) { console.error("Cue sheet has no cues."); process.exit(1); }

// --- resolve every cue to a concrete clip + placement ----------------------
const used = new Set();
const plan = [];
const problems = [];

for (const [i, cue] of cues.entries()) {
  const label = cue.label || `cue${i + 1}`;
  if (typeof cue.t !== "number") { problems.push(`${label}: missing numeric 't'`); continue; }

  let clip = null, borrowedFrom = null;
  if (cue.clip) {
    // Match on the current id/path, and also on the clip's pre-vendor identity
    // (`sourceId`/`origin`) so a cue sheet written before vendoring keeps
    // pointing at the same sound afterwards.
    clip = manifest.clips.find(c =>
      c.id === cue.clip ||
      c.path.endsWith(cue.clip) ||
      c.sourceId === cue.clip ||
      (c.origin && c.origin.endsWith(cue.clip)));
    if (!clip) { problems.push(`${label}: clip not in manifest: ${cue.clip}`); continue; }
  } else {
    if (!cue.event) { problems.push(`${label}: needs 'event' or 'clip'`); continue; }
    // varied=true avoids reusing the same clip for repeated events
    const res = pickFor(manifest, cue.event, {
      max: cue.max ?? null,
      exclude: cue.varied === false ? new Set() : used,
    });
    clip = res.clip; borrowedFrom = res.borrowedFrom;
    if (res.degraded) {
      problems.push(`${label}: every candidate for '${cue.event}' is far off-target — ` +
        `using '${clip?.path.split("/").pop()}' under protest; widen --max or name a clip explicitly`);
    }
    if (!clip) { problems.push(`${label}: no clip for event '${cue.event}'`); continue; }
  }
  used.add(clip.id);

  const event = cue.event || clip.event;
  const lead = cue.lead ?? DEFAULT_LEAD[event] ?? 0;
  // Place the TRANSIENT at t: back off the clip's own silent head, then the
  // class lead so travel sounds peak on the beat instead of starting on it.
  const startAt = cue.align === "file" ? cue.t : cue.t - clip.onset - lead;
  const trimFrom = cue.align === "file" ? 0 : 0; // onset is handled by delay, keep the attack intact

  // How long the SOUND should last. Without this a sustained clip (typing,
  // data chatter, a long whoosh) keeps playing after the visual event it
  // describes has finished — the keyboard still clattering once the text has
  // landed. `dur` is measured in AUDIBLE seconds from the transient, so it
  // lines up with the animation length you read off the timeline.
  const dur = cue.dur ?? null;
  const fade = cue.fadeOut ?? (dur ? Math.min(0.18, dur * 0.3) : 0);

  const target = cue.targetLufs ?? TARGET_LUFS[event] ?? -28;
  const offset = cue.gainDb ?? defaults.gainDb ?? 0;
  let gainDb = offset;
  if (clip.lufs != null) {
    gainDb = Math.max(-MAX_GAIN_DB, Math.min(MAX_GAIN_DB, target - clip.lufs)) + offset;
  }

  if (clip.lufs != null && Math.abs(target - clip.lufs) > 14) {
    problems.push(`${label}: needs ${(target - clip.lufs).toFixed(1)}dB to reach ${target} LUFS — ` +
      `'${clip.path.split("/").pop()}' is a poor source for this class, pick another clip`);
  }
  if (cue.t < 0) problems.push(`${label}: t=${cue.t}s is before zero — move the cue later`);
  if (cue.t > duration) problems.push(`${label}: t=${cue.t}s is past the ${duration}s timeline`);

  if (dur && dur > clip.effDur + 0.05) {
    problems.push(`${label}: dur ${dur}s exceeds the clip's ${clip.effDur}s of audio — ` +
      `it will end early; pick a longer clip or shorten the cue`);
  }

  plan.push({ label, event, clip, t: cue.t, startAt: Math.max(0, startAt), trimFrom, gainDb, borrowedFrom, dur, fade });
}

// --- density check: two tiers (see references/sfx-design.md §5) ------------
// Tier 2 is quiet supporting texture and may be frequent; Tier 1 is the loud
// signature layer and is strictly budgeted. Counting them together would either
// ban legitimate texture or wave through six impacts in a row.
const TIER2 = new Set(["tick", "pop", "click", "type", "data"]);
const per30 = {};
for (const p of plan) {
  const bucket = Math.floor(p.t / 30);
  const b = (per30[bucket] ||= { t1: 0, t2: 0 });
  if (TIER2.has(p.event)) b.t2++; else b.t1++;
}
const dense = [];
for (const [bucket, b] of Object.entries(per30)) {
  if (b.t1 > 6) dense.push([bucket, `${b.t1} signature cues (budget ~6)`]);
  if (b.t2 > 14) dense.push([bucket, `${b.t2} micro-texture cues (budget ~14)`]);
}

// Cues closer than 120ms smear into one mushy noise instead of reading as
// separate events.
const bySeq = [...plan].sort((a, b) => a.t - b.t);
for (let i = 0; i < bySeq.length - 1; i++) {
  const gap = bySeq[i + 1].t - bySeq[i].t;
  if (gap < 0.12) {
    problems.push(
      `${bySeq[i].label} → ${bySeq[i + 1].label}: only ${(gap * 1000).toFixed(0)}ms apart ` +
      `— cues under 120ms smear together; merge them or move one`
    );
  }
}

console.log(`SFX bus plan — ${plan.length} cues over ${duration}s\n`);
console.log("   T      START   GAIN    EVENT         CLIP");
for (const p of plan) {
  console.log(
    `  ${p.t.toFixed(2).padStart(6)} ${p.startAt.toFixed(2).padStart(6)} ` +
    `${(p.gainDb >= 0 ? "+" : "") + p.gainDb.toFixed(1)}dB`.padStart(8) +
    `  ${p.event.padEnd(13)} ${(p.dur ? `[${p.dur}s] ` : "")}${p.clip.path.split("/").pop()}` +
    (p.borrowedFrom ? `  [borrowed: ${p.borrowedFrom}]` : "")
  );
}

if (dense.length) {
  console.log("");
  for (const [bucket, msg] of dense) {
    console.log(`⚠ density: ${msg} in ${bucket * 30}–${(+bucket + 1) * 30}s`);
  }
}
if (problems.length) {
  console.log("");
  for (const p of problems) console.log(`⚠ ${p}`);
}
if (!plan.length) { console.error("\nNothing to render."); process.exit(1); }
if (DRY) { console.log("\n--dry-run: nothing rendered."); process.exit(problems.length ? 1 : 0); }

// --- render ----------------------------------------------------------------
// Step 1: each cue → a short, gain-staged intermediate wav. Step 2: one
// delay+mix pass. Intermediates keep the chain inspectable (the skill's
// "build the mix step-by-step" rule) without writing 30 full-length beds.
const tmp = join(dirname(outPath), ".sfx-build");
rmSync(tmp, { recursive: true, force: true });
mkdirSync(tmp, { recursive: true });
mkdirSync(dirname(outPath), { recursive: true });

const parts = [];
for (const [i, p] of plan.entries()) {
  const part = join(tmp, `part${String(i).padStart(3, "0")}.wav`);
  const filters = [`volume=${p.gainDb.toFixed(2)}dB`];
  if (p.dur) {
    // Trim measured from the clip's transient, not its file start, then fade
    // so the cut is inaudible.
    const end = p.clip.onset + p.dur;
    filters.push(`atrim=0:${end.toFixed(3)}`, "asetpts=N/SR/TB");
    if (p.fade > 0) {
      filters.push(`afade=t=out:st=${Math.max(0, end - p.fade).toFixed(3)}:d=${p.fade.toFixed(3)}`);
    }
  }
  filters.push("aformat=sample_fmts=s16:sample_rates=48000:channel_layouts=stereo");

  await execFileAsync("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-y",
    "-i", clipPath(p.clip),
    "-af", filters.join(","),
    part,
  ], { timeout: 120000 });
  parts.push({ part, delayMs: Math.round(p.startAt * 1000) });
}

const inputs = parts.flatMap(p => ["-i", p.part]);
const chains = parts.map((p, i) => `[${i}:a]adelay=${p.delayMs}|${p.delayMs}[d${i}]`).join(";");
const mixIn = parts.map((_, i) => `[d${i}]`).join("");
// normalize=0 keeps each cue at the level we staged it; the limiter only
// catches stacked transients.
const filter =
  `${chains};${mixIn}amix=inputs=${parts.length}:duration=longest:normalize=0[m];` +
  `[m]apad=whole_dur=${(duration + 1.2).toFixed(3)},atrim=0:${(duration + 1.2).toFixed(3)},` +
  `alimiter=level=disabled:limit=0.95[out]`;

await execFileAsync("ffmpeg", [
  "-hide_banner", "-loglevel", "error", "-y",
  ...inputs,
  "-filter_complex", filter, "-map", "[out]",
  "-c:a", "pcm_s16le", "-ar", "48000", "-ac", "2",
  outPath,
], { timeout: 600000, maxBuffer: 16 * 1024 * 1024 });

rmSync(tmp, { recursive: true, force: true });

// --- verify ----------------------------------------------------------------
const { stdout: durOut } = await execFileAsync("ffprobe", [
  "-v", "quiet", "-show_entries", "format=duration", "-of", "csv=p=0", outPath,
]);
const { stderr: volOut } = await execFileAsync("ffmpeg", [
  "-hide_banner", "-nostats", "-i", outPath, "-af", "volumedetect", "-f", "null", "-",
], { maxBuffer: 8 * 1024 * 1024 });
const mean = volOut.match(/mean_volume:\s*(-?\d+(?:\.\d+)?)/)?.[1];
const peak = volOut.match(/max_volume:\s*(-?\d+(?:\.\d+)?)/)?.[1];

console.log(`\n✅ ${outPath}`);
console.log(`   ${Number(durOut.trim()).toFixed(2)}s (timeline ${duration}s + 1.2s tail)`);
console.log(`   mean ${mean}dB · peak ${peak}dB`);
console.log(`\nNext: mix under VO + music (see references/audio-pipeline.md), then re-verify.`);
if (problems.length) process.exit(1);
