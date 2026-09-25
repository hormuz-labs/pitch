#!/usr/bin/env node
/**
 * footage.mjs — prepare one clip of real footage for a `footage` shot.
 *
 *   node footage.mjs --src=uploads/clip.mp4 --name=crowd-hands [--in=2.5] [--out=6 | --dur=3.5]
 *                    [--format=9:16] [--focus=0.5,0.35] [--fit=cover|contain] [--fps=30]
 *
 * The film plays footage in the browser, frame-accurately, from a blob URL.
 * That needs a file the capture browser can decode and seek quickly, so the
 * clip is cut to the range the film uses, cropped to the film's frame around
 * `focus` (fractions of the source, 0.5,0.5 = centre), resampled to `fps`,
 * stripped of audio and encoded as VP9 WebM with a keyframe every half
 * second. Black bars baked into the source (a scope film inside 16:9, a
 * pillarboxed phone clip) are detected and cut first, so they never survive
 * into the crop; --keep-bars leaves the picture as it is. Output: assets/footage/<name>.webm, a five-frame strip beside it
 * (<name>.jpg, to look at the crop) and a line in assets/footage/footage.json
 * recording where it came from.
 *
 * The frame comes from --format, else shots.js `format`, else 16:9.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { loadShots } from "./lib/vo-words.mjs";

const FORMATS = { "16:9": [1920, 1080], "9:16": [1080, 1920], "1:1": [1080, 1080], "4:5": [1080, 1350] };
const argv = process.argv.slice(2);
const flag = (name, dflt = null) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  if (hit) return hit.slice(name.length + 3);
  return argv.includes(`--${name}`) ? true : dflt;
};
const fail = (msg) => { console.error(`❌ ${msg}`); process.exit(1); };
const ws = process.cwd();
const inside = (p, what) => {
  const abs = resolve(ws, String(p));
  const rel = relative(ws, abs);
  if (rel.startsWith("..") || rel === "") fail(`${what} must be a file inside the project: ${p}`);
  return abs;
};

const srcArg = flag("src");
if (!srcArg || srcArg === true) fail("--src=<workspace video> is required");
const src = inside(srcArg, "--src");
if (!existsSync(src)) fail(`${srcArg} does not exist`);
const name = String(flag("name", "")).toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
if (!name) fail("--name=<readable-slug> is required (it names assets/footage/<name>.webm)");

let formatName = flag("format", null);
if (!formatName) {
  try { formatName = loadShots(resolve(ws, "shots.js"))?.format || "16:9"; } catch { formatName = "16:9"; }
}
if (!FORMATS[formatName]) fail(`--format must be one of ${Object.keys(FORMATS).join(", ")}`);
const [W, H] = FORMATS[formatName];
const fit = flag("fit", "cover");
if (fit !== "cover" && fit !== "contain") fail("--fit is cover or contain");
const [fx, fy] = String(flag("focus", "0.5,0.5")).split(",").map(Number);
if (![fx, fy].every((v) => Number.isFinite(v) && v >= 0 && v <= 1)) fail("--focus is x,y fractions of the source, e.g. 0.5,0.35");
const fps = Number(flag("fps", 30));
if (!(fps >= 12 && fps <= 60)) fail("--fps must be between 12 and 60");

// --- probe -------------------------------------------------------------------------
let info;
try {
  info = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries",
    "stream=width,height,avg_frame_rate:stream_side_data=rotation:stream_tags=rotate:format=duration", "-of", "json", src], { encoding: "utf8" }));
} catch (err) {
  fail(`${srcArg} is not a readable video (${String(err.message || err).split("\n")[0]})`);
}
const stream = info.streams?.[0];
if (!stream) fail(`${srcArg} has no video stream`);
const duration = Number(info.format?.duration) || 0;
const rotation = Math.abs(Number(stream.side_data_list?.find((d) => d.rotation != null)?.rotation ?? stream.tags?.rotate ?? 0)) % 180;
const srcW = rotation === 90 ? stream.height : stream.width;
const srcH = rotation === 90 ? stream.width : stream.height;

const tIn = Number(flag("in", 0));
const tOut = flag("out", null) != null ? Number(flag("out")) : flag("dur", null) != null ? tIn + Number(flag("dur")) : duration;
if (!(tIn >= 0) || !(tOut > tIn)) fail("--in/--out must give a positive range");
if (duration && tIn >= duration) fail(`--in ${tIn}s is past the end of ${srcArg} (${duration.toFixed(2)}s)`);
const end = duration ? Math.min(tOut, duration) : tOut;
const len = end - tIn;
if (len < 0.2) fail("the range is shorter than 0.2s");
if (len > 60) fail("a clip longer than 60s is not a shot — pick the range the film uses");

// --- baked-in bars -------------------------------------------------------------------
// cropdetect over the used range; the box it settles on is the picture. Only
// bars worth cutting (more than 3% of an axis) change anything.
let bars = null;
if (!flag("keep-bars")) {
  const r = spawnSync("ffmpeg", ["-hide_banner", "-nostdin", "-ss", tIn.toFixed(3), "-t", Math.min(len, 6).toFixed(3), "-i", src,
    "-vf", "fps=4,cropdetect=limit=24:round=2:reset=0", "-an", "-f", "null", "-"], { encoding: "utf8", timeout: 120_000 });
  const found = [...String(r.stderr || "").matchAll(/crop=(\d+):(\d+):(\d+):(\d+)/g)].pop();
  if (found) {
    const [cw, ch, cx, cy] = found.slice(1).map(Number);
    // ffmpeg rotates before -vf, so these are displayed coordinates, like srcW/srcH.
    if (cw > srcW * 0.3 && ch > srcH * 0.3 && (cw < srcW * 0.97 || ch < srcH * 0.97)) bars = { cw, ch, cx, cy };
  }
}

// --- encode ------------------------------------------------------------------------
const outDir = resolve(ws, "assets/footage");
mkdirSync(outDir, { recursive: true });
const out = resolve(outDir, `${name}.webm`);
const strip = resolve(outDir, `${name}.jpg`);
const unbar = bars ? `crop=${bars.cw}:${bars.ch}:${bars.cx}:${bars.cy},` : "";
const frame = unbar + (fit === "cover"
  ? `scale=w=${W}:h=${H}:force_original_aspect_ratio=increase:flags=lanczos,crop=${W}:${H}:(iw-${W})*${fx}:(ih-${H})*${fy}`
  : `scale=w=${W}:h=${H}:force_original_aspect_ratio=decrease:flags=lanczos,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=black`);
const ff = (args) => execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-nostdin", "-y", ...args], { stdio: ["ignore", "ignore", "pipe"], timeout: 600_000 });
try {
  ff(["-ss", tIn.toFixed(3), "-t", len.toFixed(3), "-i", src,
    "-vf", `${frame},fps=${fps},setsar=1,format=yuv420p`,
    // Realtime VP9 is 4× faster than "good" at a size the preview and the
    // capture never notice; the export re-encodes every frame anyway.
    "-an", "-c:v", "libvpx-vp9", "-b:v", "0", "-crf", "30", "-row-mt", "1", "-deadline", "realtime", "-cpu-used", "8",
    "-g", String(Math.max(1, Math.round(fps / 2))), "-pix_fmt", "yuv420p", out]);
} catch (err) {
  const detail = String(err.stderr || err.message || err).trim().split("\n").slice(-3).join(" ");
  fail(`ffmpeg could not prepare ${srcArg}: ${detail}`);
}
// Five evenly spaced frames of the RESULT, to judge the crop and the action.
try {
  ff(["-i", out, "-vf", `fps=${(5 / len).toFixed(4)},scale=${W >= H ? 320 : 180}:-2,tile=5x1:padding=4:color=0x111111`, "-frames:v", "1", "-q:v", "4", strip]);
} catch { /* the strip is a convenience */ }

// --- ledger ------------------------------------------------------------------------
const ledgerPath = resolve(outDir, "footage.json");
let ledger = {};
try { ledger = JSON.parse(readFileSync(ledgerPath, "utf8")); } catch {}
const rel = (p) => relative(ws, p);
ledger[name] = {
  file: rel(out), source: rel(src), in: +tIn.toFixed(3), out: +end.toFixed(3), duration: +len.toFixed(3),
  format: formatName, width: W, height: H, fps, fit, focus: [fx, fy], sourceSize: [srcW, srcH], ...(bars ? { bars } : {}),
};
writeFileSync(ledgerPath, JSON.stringify(ledger, null, 2) + "\n");

// What the crop works from: the picture inside any bars that were cut.
const picW = bars ? bars.cw : srcW;
const picH = bars ? bars.ch : srcH;
const short = Math.min(picW, picH), need = Math.min(W, H);
console.log(`🎞  ${rel(out)} — ${len.toFixed(2)}s of ${rel(src)} (${tIn.toFixed(2)}→${end.toFixed(2)}s), ${W}×${H} ${fit} @ ${fps}fps, ${(statSync(out).size / 1e6).toFixed(1)}MB`);
if (existsSync(strip)) console.log(`   strip: ${rel(strip)} (five frames of the prepared clip)`);
if (bars) console.log(`   cut baked-in black bars: kept the ${bars.cw}×${bars.ch} picture (--keep-bars to keep them)`);
if (short < need * 0.6) console.log(`   ⚠ the picture is ${picW}×${picH}: upscaled ${(need / short).toFixed(1)}× for this frame — it will look soft at full size`);
if (fit === "cover" && picW / picH > (W / H) * 1.6) console.log(`   ⚠ a ${picW}×${picH} picture in a ${formatName} frame keeps ${Math.round(((W / H) / (picW / picH)) * 100)}% of its width — check the strip that the subject survived the crop (move --focus)`);
console.log(`   shot: { type: "footage", src: "${rel(out)}", dur: ${len.toFixed(2)} }   (in: seconds into THIS clip; it starts at the source's ${tIn.toFixed(2)}s)`);
