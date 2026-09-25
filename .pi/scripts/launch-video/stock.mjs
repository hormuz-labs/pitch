#!/usr/bin/env node
/**
 * stock.mjs — licensed stock footage and photos from Pexels, for the shots a
 * film needs real-world pictures of (a crowd, a hand, an hourglass, a city at
 * night) and nobody supplied.
 *
 *   node stock.mjs search --query="woman covering her ears in a loud club" [--kind=video|photo]
 *                         [--orientation=portrait|landscape|square] [--count=9] [--min-duration=3]
 *   node stock.mjs get --pick=3 --name=club-ears        (a result of the last search)
 *   node stock.mjs get --id=8412345 --kind=video --name=club-ears
 *
 * `search` writes .studio/stock/search.json and a numbered contact sheet
 * (.studio/stock/search.jpg): look at it before choosing. `get` downloads the
 * chosen result to uploads/stock/<name>.mp4|.jpg — the asset shelf, so the
 * user sees and can point at it — and records the author, the source page and
 * the licence in uploads/stock/credits.json. Prepare a video for the film with
 * `pitch motion footage`.
 *
 * Needs PEXELS_API_KEY on the host. PEXELS_API_BASE overrides the endpoint.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { bestVideoFile, shapePhoto, shapeVideo } from "./lib/stock.mjs";

const argv = process.argv.slice(2);
const mode = argv.find((a) => !a.startsWith("--"));
const flag = (name, dflt = null) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  if (hit) return hit.slice(name.length + 3);
  return argv.includes(`--${name}`) ? true : dflt;
};
const fail = (msg) => { console.error(`❌ ${msg}`); process.exit(1); };
const ws = process.cwd();
const rel = (p) => relative(ws, p);
const KEY = process.env.PEXELS_API_KEY;
const BASE = (process.env.PEXELS_API_BASE || "https://api.pexels.com").replace(/\/+$/, "");
const LICENSE = "Pexels License — free to use, no attribution required. Identifiable people must not appear to endorse a product or be shown in a bad or offensive light; do not resell the file unaltered.";
const STATE = resolve(ws, ".studio/stock");

if (mode !== "search" && mode !== "get") fail("usage: stock.mjs search --query=… | get --pick=N --name=…");
if (!KEY) fail("stock search is not configured on this host (PEXELS_API_KEY). Use the user's uploads, or pitch video generate for footage that need not be real, and say which shots lack real footage.");

async function api(path) {
  const res = await fetch(`${BASE}${path}`, { headers: { Authorization: KEY }, signal: AbortSignal.timeout(30_000) });
  if (res.status === 429) fail("Pexels rate limit reached — try again later or use fewer searches");
  if (!res.ok) fail(`Pexels answered ${res.status} for ${path.split("?")[0]}`);
  return res.json();
}
async function download(url, out) {
  const res = await fetch(url, { signal: AbortSignal.timeout(180_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  writeFileSync(out, Buffer.from(await res.arrayBuffer()));
}

if (mode === "search") {
  const query = flag("query");
  if (!query || query === true) fail("--query=\"what is in the shot\" is required");
  const kind = flag("kind", "video");
  if (kind !== "video" && kind !== "photo") fail("--kind is video or photo");
  const orientation = flag("orientation", null);
  if (orientation && !["portrait", "landscape", "square"].includes(orientation)) fail("--orientation is portrait, landscape or square");
  const count = Math.max(1, Math.min(15, Number(flag("count", 9)) || 9));
  const minDur = Number(flag("min-duration", 0)) || 0;
  const q = new URLSearchParams({ query: String(query), per_page: String(Math.min(40, count * 2)) });
  if (orientation) q.set("orientation", orientation);
  if (kind === "video") q.set("size", "medium");
  const data = await api(kind === "video" ? `/videos/search?${q}` : `/v1/search?${q}`);
  let results = kind === "video" ? (data.videos || []).map(shapeVideo) : (data.photos || []).map(shapePhoto);
  if (minDur) results = results.filter((r) => !r.duration || r.duration >= minDur);
  results = results.slice(0, count).map((r, i) => ({ pick: i + 1, ...r }));
  if (!results.length) fail(`no ${kind}s for "${query}" — describe the picture differently (subject, action, light), not the idea`);

  mkdirSync(STATE, { recursive: true });
  // Never leave the previous search's sheet to be shown for this one.
  const sheet = resolve(STATE, "search.jpg");
  rmSync(sheet, { force: true });
  writeFileSync(resolve(STATE, "search.json"), JSON.stringify({ query, kind, orientation, results }, null, 2) + "\n");
  // The numbered sheet: one tile per result, same order as the list.
  const tmp = resolve(STATE, ".thumbs");
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });
  let have = 0;
  for (const r of results) {
    try { await download(r.thumb, resolve(tmp, `t_${String(r.pick).padStart(3, "0")}.jpg`)); have++; } catch { /* a missing tile */ }
  }
  if (have === results.length) {
    const cols = Math.min(results.length, orientation === "portrait" ? 5 : 3);
    const rows = Math.ceil(results.length / cols);
    const [tw, th] = orientation === "portrait" ? [216, 384] : orientation === "square" ? [300, 300] : [400, 225];
    const label = "drawtext=text='%{eif\\:n+1\\:d}':x=10:y=8:fontsize=34:fontcolor=white:box=1:boxcolor=black@0.75:boxborderw=6";
    const base = `scale=${tw}:${th}:force_original_aspect_ratio=decrease,pad=${tw}:${th}:(ow-iw)/2:(oh-ih)/2:color=0x111111`;
    for (const vf of [`${base},${label},tile=${cols}x${rows}:padding=6:color=0x111111`, `${base},tile=${cols}x${rows}:padding=6:color=0x111111`]) {
      try {
        execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-framerate", "1", "-i", resolve(tmp, "t_%03d.jpg"), "-vf", vf, "-frames:v", "1", "-q:v", "4", sheet], { stdio: "ignore", timeout: 60_000 });
        break;
      } catch { /* no drawtext on this ffmpeg: numbered by position instead */ }
    }
  }
  rmSync(tmp, { recursive: true, force: true });
  console.log(`🔎 ${results.length} ${kind}s for "${query}"${orientation ? ` (${orientation})` : ""} — look at the sheet, then: pitch motion stock --mode get --pick <n> --name <readable-name>`);
  for (const r of results) {
    console.log(`   ${String(r.pick).padStart(2)}  #${r.id}  ${r.width}×${r.height}${r.duration ? `  ${r.duration}s` : ""}  by ${r.author ?? "unknown"}${r.alt ? `  — ${r.alt.slice(0, 70)}` : ""}`);
  }
  if (existsSync(sheet)) console.log(`   sheet: ${rel(sheet)}`);
  process.exit(0);
}

// --- get -----------------------------------------------------------------------------
const name = String(flag("name", "")).toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
if (!name) fail("--name=<readable-slug> is required (it names uploads/stock/<name>.mp4)");
let kind = flag("kind", null);
let id = flag("id", null);
let fromSearch = null;
if (flag("pick", null) != null) {
  let last;
  try { last = JSON.parse(readFileSync(resolve(STATE, "search.json"), "utf8")); } catch { fail("no previous search — run search first, or pass --id and --kind"); }
  fromSearch = last.results.find((r) => r.pick === Number(flag("pick")));
  if (!fromSearch) fail(`--pick must be 1–${last.results.length} from the last search ("${last.query}")`);
  id = fromSearch.id;
  kind = fromSearch.kind;
}
if (!id || !/^\d+$/.test(String(id))) fail("--pick=N from the last search, or --id=<pexels id> with --kind");
kind = kind || "video";
if (kind !== "video" && kind !== "photo") fail("--kind is video or photo");

const item = await api(kind === "video" ? `/videos/videos/${id}` : `/v1/photos/${id}`);
const shaped = kind === "video" ? shapeVideo(item) : shapePhoto(item);
let url, ext;
if (kind === "video") {
  const file = bestVideoFile(item.video_files);
  if (!file) fail(`video #${id} has no downloadable mp4`);
  url = file.link;
  ext = "mp4";
  shaped.file = { width: file.width, height: file.height, fps: file.fps || null };
} else {
  url = item.src?.large2x || item.src?.original;
  if (!url) fail(`photo #${id} has no downloadable image`);
  ext = "jpg";
}
const dir = resolve(ws, "uploads/stock");
mkdirSync(dir, { recursive: true });
const out = resolve(dir, `${name}.${ext}`);
if (existsSync(out)) fail(`${rel(out)} already exists — choose another --name`);
try { await download(url, out); } catch (err) { fail(`download failed (${err.message})`); }

const creditsPath = resolve(dir, "credits.json");
let credits = {};
try { credits = JSON.parse(readFileSync(creditsPath, "utf8")); } catch {}
credits[rel(out)] = {
  provider: "Pexels", id: Number(id), kind, page: shaped.page, author: shaped.author, authorUrl: shaped.authorUrl,
  license: LICENSE, query: fromSearch ? JSON.parse(readFileSync(resolve(STATE, "search.json"), "utf8")).query : null,
  downloaded: new Date().toISOString(),
};
writeFileSync(creditsPath, JSON.stringify(credits, null, 2) + "\n");
console.log(`⬇️  ${rel(out)} — Pexels #${id} by ${shaped.author ?? "unknown"}, ${kind === "video" ? `${shaped.file.width}×${shaped.file.height}, ${item.duration}s` : `${item.width}×${item.height}`}, ${(statSync(out).size / 1e6).toFixed(1)}MB`);
console.log(`   credit recorded in ${rel(creditsPath)} (${shaped.page})`);
if (kind === "video") console.log(`   next: pitch motion footage --src ${rel(out)} --name <shot-name> --in <s> --dur <s>`);
