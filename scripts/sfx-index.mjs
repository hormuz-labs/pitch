#!/usr/bin/env node
/**
 * sfx-index.mjs — build the curated SFX manifest for the launch-video skill.
 *
 * Scans the shared SFX libraries, measures every file (duration + peak +
 * integrated loudness), classifies it into a semantic MOTION EVENT class from
 * folder/filename evidence, drops everything on the ban list, and writes
 *   data/sfx-index.json
 *
 * The agent NEVER browses the raw library — 900+ files, most of them unusable.
 * It queries the manifest through sfx.mjs instead.
 *
 * Usage:
 *   node scripts/sfx-index.mjs                  # rebuild manifest
 *   node scripts/sfx-index.mjs --quick          # skip loudness (duration only, ~6x faster)
 *   node scripts/sfx-index.mjs --root=/path     # add an extra library root
 */
import { execFile } from "node:child_process";
import { existsSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..");
const SKILL = resolve(REPO_ROOT, ".pi", "scripts", "launch-video");
const REPO = REPO_ROOT;

const args = process.argv.slice(2);
const QUICK = args.includes("--quick");
const EXTRA_ROOTS = args.filter(a => a.startsWith("--root=")).map(a => resolve(a.slice(7)));

const AUDIO_RE = /\.(wav|mp3|m4a|aac|flac|ogg|opus)$/i;   // opus: the vendored library format

/** Library roots, in priority order. Earlier roots win ties. */
const ROOTS = [
  { path: join(REPO, "assets", "sfx"), pack: "curated-core", trust: 3 },
  { path: join(REPO, "assets", "1000+UR.FASTEDITOR SFX"), pack: "urfasteditor", trust: 2 },
  ...EXTRA_ROOTS.map(p => ({ path: p, pack: "extra", trust: 1 })),
].filter(r => existsSync(r.path));

// ---------------------------------------------------------------------------
// BAN LIST — never surfaced to the agent, on taste AND rights grounds.
//
// The UrFastEditor pack is a free YouTube bundle that mixes genuinely useful
// cinematic SFX with ripped game/anime/meme audio (Minecraft, Mario, Valorant,
// One Piece, TF2...). Those are both wrong for a product launch video and not
// ours to license to a client. Weapons, gore, horror and bodily-function gags
// are excluded for the same reason: one of these landing in a founder-facing
// render is an unrecoverable credibility failure.
// ---------------------------------------------------------------------------
const BAN_DIRS = [
  /gun sfx/i, /\bmemes?\b/i, /horror/i, /faaaaaah/i, /100 famous sound effects/i,
  /230 mixed sound effcts$/i,        // the meme dump itself (subdirs handled above)
];
const BAN_NAMES = [
  // weapons / violence
  /gun|pistol|rifle|shotgun|sniper|smg|glock|luger|ak47|m16|m14|p90|famas|aug|bullet|9mm|rocket|nuke|bomb|blast|punch|bonk|hitmarker|machinegun/i,
  // memes / game rips / franchises
  /meme|minecraft|mario|yoshi|sonic|spongebob|one[-_ ]?piece|naruto|dragon[-_ ]?ball|valorant|discord|among[-_ ]?us|tf2|mlg|illuminati|anime|rizz|sigma|sheesh|bruh|deja[-_ ]vu|gta|honkai|sukuna|ceeday|mongraal|talking[-_ ]tom|y2mate|getmp3|taco bell|emotional[-_ ]damage|acumalaka/i,
  // bodily / gross / vocal gags
  /fart|kentut|snore|burp|gulp|munch|laugh|cheer|scream|moan|oppai|kontol|japan-oppai|awkward|nope|yessir|huh|wtf|oh-shit|aw-hell|hell|damn|shocked|brain-aneurysm/i,
  // language-specific junk observed in the pack
  /bernyanyi|warkop|upin|ipin|maju3|chuaks|hiyakkk|kerja-bagus|raul|untitled|videoplayback|tmpq7|music2|chinese-rap|angels-singing|dream-sound|candyland|bad-to-the-bone|white-tees|all-my-fellaz|eagle-rahhh|espada|katon|don-onepiece|transponder|basicbeam|crack_the_whip|buy_1|cave1|uh\.mp3|1-108/i,
  // ambience beds / very long textures — not event SFX
  /ambien(ce|t)|drone|rumble ambient|wind ambient|clock tension|piano tension|sci fi ambiance/i,
  // comic/novelty timbres — wrong register for a product launch film
  /cartoon|kazoo|comic|funny|goofy|boing|slide[-_ ]?whistle|toy\b/i,
];

const isBanned = (relPath, name) =>
  BAN_DIRS.some(re => re.test(dirname(relPath))) || BAN_NAMES.some(re => re.test(name));

// ---------------------------------------------------------------------------
// EVENT TAXONOMY — the vocabulary the storyboard and Phase 5 speak in.
// Ordered: first matching rule wins, so put specific before generic.
// ---------------------------------------------------------------------------
const CLASSES = [
  // --- micro UI events -----------------------------------------------------
  { event: "pop",     max: 1.2, re: /bubble|pop[-_ ]?up|ui-pop|multi-pop|pop[-_ .0-9]|blip|\bbips?\b/i,
    use: "an element, icon, chip or card appearing; per-item stagger accents" },
  { event: "tick",    max: 0.8, re: /tick|count|gear[-_ ]shift|middle gear|ratchet|\bbip\b/i,
    use: "counter digits rolling, progress steps, rapid list staggers" },
  { event: "type",    max: 9.0, re: /typ(e|ing)|keyboard|digital type text/i,
    use: "typewriter text, prompt entry, terminal beats" },
  { event: "click",   max: 1.6, re: /click|mouse|snaping|\bsnap\b|button|lamp/i,
    use: "cursor press on a real control; the CursorController's click beat" },
  { event: "select",  max: 2.6, re: /select|confirm|accept|toggle|checkbox|right \(bells\)/i,
    use: "option chosen, item selected, state toggled" },
  { event: "notify",  max: 2.8, re: /notification|notif|ping|alert|toast/i,
    use: "a toast/badge arriving, agent status update" },
  { event: "success", max: 3.5, re: /success|cash[-_ ]register|kaching|cha-ching|purchase|apple pay|healing|magic|sparkle|glitter|clink|gleam/i,
    use: "task complete, deploy green, positive resolution, AI 'generated' moment" },
  { event: "chime",   max: 4.0, re: /bell|chime|ding|glass|shimmer/i,
    use: "gentle positive punctuation; brand/logo grace note" },
  { event: "data",    max: 3.4, re: /hud|data_|scan|interface|ui[-_ ]?sound|ui[-_ ]?beep|beep|digital click/i,
    use: "processing, scanning, agent 'thinking', dashboard populating" },
  { event: "camera",  max: 3.2, re: /camera|shutter|dslr|nikon|lens|zoom(ing)?/i,
    use: "snapshot beat, freeze-frame, capture accent" },

  // --- motion / travel -----------------------------------------------------
  // Deep first: the standing preference is deep whooshes on fast/large motion.
  { event: "whoosh_deep", max: 5.0, re: /deep[-_ ]?(whoosh|slow|hit)|whoosh[-_ ]?deep|low fly|\bthe base\b|\bvoid\b|hit whoosh|airy whoosh|whoosh main|whoosh airy|long swoosh|swoosh very long|delay woosh|rumble swish|\bdark\b|slow mo(tion)?|jet pass|space ship/i,
    use: "big/fast camera moves, full-frame tile expansions, scene-scale travel" },
  { event: "whoosh_soft", max: 2.2, re: /whoosh|woosh|swoosh|swish|whip|zing|fly[-_ ]?by|\bpass\b|panoramic/i,
    use: "light element travel, card slides, lateral pans" },
  { event: "reverse", max: 3.2, re: /reverse|revers|suck|backwards/i,
    use: "pre-roll suck-in leading INTO a cut or reveal" },
  { event: "riser",   max: 9.0, re: /riser|build[-_ ]?up|buildup|\brise\b/i,
    use: "tension build into a hero reveal or stat slam" },

  // --- weight / punctuation ------------------------------------------------
  { event: "impact",  max: 4.5, re: /impact|\bhit\b|boom|slam|solid|intense|thunder|metal hit|reverb hit|distorted|\bbolt\b|bollt/i,
    use: "logo lock-up, headline slam, hard chapter cut" },
  { event: "subdrop", max: 5.0, re: /sub[-_ ]?drop|sd_low|bass drop|low horn|\bdrop\b/i,
    use: "weighted scene change; pairs under a cut for cinematic gravity" },
  { event: "glitch",  max: 3.2, re: /glitch|glich|gltch|distort|static/i,
    use: "scramble-text decode, digital state change, error/edge beat" },
];

/**
 * Long whooshes are deep whooshes. The pack names most of its big cinematic
 * travel sounds generically ("09.wav" inside "Cinematic Whoosh Swoosh pack 3"),
 * so length is the only honest signal for whether a whoosh is a light element
 * slide or a scene-scale move.
 */
const WHOOSH_DEEP_FROM = 2.2;

const HARD_MAX = 10.0; // anything longer is a bed, not an event SFX

function classify(relPath, name, dur) {
  const hay = `${relPath} ${name}`;
  for (const c of CLASSES) {
    if (c.re.test(hay)) {
      if (dur != null && dur > c.max) continue; // right family, wrong length
      return c.event;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
function walk(dir, out = []) {
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    if (e.name.startsWith(".")) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (AUDIO_RE.test(e.name)) out.push(p);
  }
  return out;
}

/**
 * One ffmpeg pass per file: silence map + loudness.
 *
 * `onset` is the single most useful number here. Many library clips carry
 * 40–300ms of digital silence before the transient; scheduling such a clip at
 * the beat puts the actual sound LATE by that much, which is exactly the
 * "SFX feels slightly off" symptom. sfx.mjs subtracts onset when placing cues.
 */
async function analyze(file, wantLoudness) {
  const filters = ["silencedetect=n=-50dB:d=0.02"];
  if (wantLoudness) filters.push("ebur128=peak=true");
  let stderr = "";
  try {
    ({ stderr } = await execFileAsync("ffmpeg", [
      "-hide_banner", "-nostats", "-i", file,
      "-af", filters.join(","), "-f", "null", "-",
    ], { timeout: 60000, maxBuffer: 8 * 1024 * 1024 }));
  } catch (err) {
    stderr = err?.stderr || "";
  }

  const durM = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  const dur = durM
    ? Number(durM[1]) * 3600 + Number(durM[2]) * 60 + Number(durM[3])
    : null;
  if (dur == null) return null;

  // Silence spans, in order.
  const spans = [];
  const re = /silence_start:\s*(-?\d+(?:\.\d+)?)[\s\S]*?silence_end:\s*(\d+(?:\.\d+)?)/g;
  let m;
  while ((m = re.exec(stderr))) spans.push([Number(m[1]), Number(m[2])]);
  // A trailing silence has a start but no end.
  const starts = [...stderr.matchAll(/silence_start:\s*(-?\d+(?:\.\d+)?)/g)].map(x => Number(x[1]));
  const lastStart = starts.length ? starts[starts.length - 1] : null;
  const closed = spans.length ? spans[spans.length - 1][0] : null;
  const trailingStart = lastStart != null && lastStart !== closed ? lastStart : null;

  const lead = spans.length && spans[0][0] <= 0.02 ? spans[0][1] : 0;
  const tail = trailingStart != null ? trailingStart : dur;
  const onset = Number(Math.max(0, lead).toFixed(3));
  const effDur = Number(Math.max(0.01, tail - onset).toFixed(3));

  let lufs = null, peak = null;
  if (wantLoudness) {
    const i = stderr.match(/I:\s*(-?\d+(?:\.\d+)?)\s*LUFS/g);
    const p = stderr.match(/Peak:\s*(-?\d+(?:\.\d+)?)\s*dBFS/g);
    if (i) lufs = Number(i[i.length - 1].match(/(-?\d+(?:\.\d+)?)/)[1]);
    if (p) peak = Number(p[p.length - 1].match(/(-?\d+(?:\.\d+)?)/)[1]);
    if (!Number.isFinite(lufs)) lufs = null;
    if (!Number.isFinite(peak)) peak = null;
  }
  return { dur: Number(dur.toFixed(3)), onset, effDur, lufs, peak };
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx], idx);
    }
  }));
  return out;
}

// ---------------------------------------------------------------------------
const t0 = Date.now();
const candidates = [];
for (const root of ROOTS) {
  for (const file of walk(root.path)) {
    const rel = relative(root.path, file);
    const name = file.split("/").pop();
    if (isBanned(rel, name)) continue;
    candidates.push({ file, rel, name, root });
  }
}
console.log(`Scanned ${ROOTS.length} root(s) → ${candidates.length} candidates after ban filter`);

const measured = await mapLimit(candidates, 8, async (c) => {
  const a = await analyze(c.file, !QUICK);
  if (!a) return null;
  // Judge length by the SOUND, not the container: many clips are a 300ms
  // transient inside a 2s file of padding.
  if (a.effDur > HARD_MAX || a.effDur < 0.03) return null;

  let event = classify(c.rel, c.name, a.effDur);
  if (!event) return null;
  if (event === "whoosh_soft" && a.effDur >= WHOOSH_DEEP_FROM) event = "whoosh_deep";

  return {
    id: `${c.root.pack}/${c.rel}`.replace(/\\/g, "/"),
    path: relative(REPO, c.file),
    event,
    dur: a.dur,
    onset: a.onset,
    effDur: a.effDur,
    lufs: a.lufs,
    peak: a.peak,
    pack: c.root.pack,
    trust: c.root.trust,
    bytes: statSync(c.file).size,
    ext: extname(c.name).slice(1).toLowerCase(),
  };
});

const entries = measured.filter(Boolean);

// Rank within each event: trusted packs first, then shorter+punchier, then
// louder (a transient that needs less gain sits better in the mix).
entries.sort((a, b) =>
  a.event.localeCompare(b.event) || b.trust - a.trust || a.effDur - b.effDur
);

// Dedupe: the pack ships the same clip in several folders (e.g. multi-pop-6 in
// both "336 SFX/MIX" and "450/mix"). Keep the highest-trust copy — entries are
// already sorted trust-first.
const seen = new Set();
const deduped = entries.filter(e => {
  const key = `${e.event}|${e.path.split("/").pop().toLowerCase()}|${e.effDur}`;
  if (seen.has(key)) return false;
  seen.add(key);
  return true;
});
entries.length = 0;
entries.push(...deduped);

const byEvent = {};
for (const e of entries) (byEvent[e.event] ||= []).push(e);

const manifest = {
  generated: new Date().toISOString(),
  generator: "scripts/sfx-index.mjs",
  repoRoot: REPO,
  roots: ROOTS.map(r => ({ pack: r.pack, path: relative(REPO, r.path), trust: r.trust })),
  total: entries.length,
  events: Object.fromEntries(CLASSES.map(c => [c.event, {
    use: c.use,
    maxDur: c.max,
    count: (byEvent[c.event] || []).length,
  }])),
  clips: entries,
};

const outPath = join(SKILL, "data", "sfx-index.json");
writeFileSync(outPath, JSON.stringify(manifest, null, 2));

console.log(`\n${entries.length} clips indexed in ${((Date.now() - t0) / 1000).toFixed(1)}s → ${relative(REPO, outPath)}\n`);
for (const c of CLASSES) {
  const list = byEvent[c.event] || [];
  const durs = list.map(x => x.effDur);
  const span = durs.length ? `${Math.min(...durs).toFixed(2)}–${Math.max(...durs).toFixed(2)}s` : "—";
  console.log(`  ${c.event.padEnd(13)} ${String(list.length).padStart(4)}  ${span}`);
}
