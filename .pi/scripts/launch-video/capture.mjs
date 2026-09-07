#!/usr/bin/env node
/**
 * Deterministic multi-worker parallel seek-and-capture renderer: HTML+GSAP page -> high-fps MP4.
 * Requires: ffmpeg, and a CloakBrowser reachable over CDP (lib/browser.mjs).
 * There is NO local Chromium in the studio image and none is ever installed —
 * every worker is a tab in the CloakBrowser, and the page is served into it
 * from disk over the studio.local origin.
 *
 * The page MUST expose:  window.__SEEK(seconds), window.__DURATION(), window.__READY
 *
 * Usage:
 *   node capture.mjs page.html [--fps=60] [--scale=2] [--out-res=720p|1080p|4k] [--width=1920] [--height=1080]
 *                    [--workers=8] [--out=out/video.mp4] [--from=<sec>] [--to=<sec>]
 *                    [--samples=4 --shutter=0.5] [--depth=8|10] [--codec=h264|hevc] [--crf=16] [--frames=jpeg|png]
 *
 * --from/--to render only a segment of the timeline (e.g. one scene, for fast
 * iteration; several segment renders can run in parallel). Segment renders
 * skip the audio mux — only full renders mux audio/mix.wav.
 *
 * Shutter, samples, depth and codec default to the film's own
 * `window.SHOTS.render` block; the grade comes from `window.SHOTS.grade`
 * (lib/encode.mjs documents both). Flags override the block for one render.
 */
import { execFileSync, execSync } from "node:child_process";
import { mkdirSync, rmSync, existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { localPageUrl, openStudioBrowser } from "./lib/browser.mjs";
import { codecArgs, describeRender, normalizeGrade, normalizeRender, renderFilter, sampleTimes } from "./lib/encode.mjs";

/** This script's own directory — used to resolve the repo-root font for the watermark. */
const HERE = dirname(fileURLToPath(import.meta.url));

// Parse CLI flags correctly using slice(2)
const args = Object.fromEntries(process.argv.slice(2).map(a => {
  const [k, v] = a.replace(/^--/, "").split("=");
  return [k, v === undefined ? true : v];
}));

const pageArg  = process.argv.slice(2).find(a => !a.startsWith("--")) ?? "index.html";
const fps      = Number(args.fps ?? 60);
/**
 * Output resolution. The stage is a fixed 1920x1080 page, so this is a
 * render/encode concern only — rendering the page at a smaller viewport would
 * reflow every absolutely-positioned scene. 4K captures at deviceScaleFactor 2;
 * 720p captures at 1 and is downscaled on encode.
 *
 * This must resolve BEFORE `scale` is read: --out-res=4k has to reach the
 * capture pass, not just the encoder.
 */
const OUT_RES = { "720p": { scale: 1, height: 720 }, "1080p": { scale: 1, height: null }, "4k": { scale: 2, height: null } };
const outRes = args["out-res"] ? OUT_RES[String(args["out-res"]).toLowerCase()] : null;
if (args["out-res"] && !outRes) {
  console.error(`Unknown --out-res=${args["out-res"]} (expected 720p, 1080p or 4k)`);
  process.exit(1);
}
const downscale = outRes?.height ? `scale=-2:${outRes.height}` : null;

const scale    = outRes ? outRes.scale : Number(args.scale ?? 2);   // 2 = 3840x2160 4K UHD
const width    = Number(args.width ?? 1920);
const height   = Number(args.height ?? 1080);
// Workers are tabs in the one CloakBrowser, not browser processes: the
// screenshots are what costs time, and Page.captureScreenshot on a background
// tab returns that tab's own frame, so they overlap cleanly.
const defaultWorkers = Math.max(1, Math.min(6, os.cpus().length - 2));
const workers  = Number(args.workers ?? defaultWorkers);
const out      = String(args.out ?? "out/video.mp4");
/**
 * Intermediate frames. JPEG at quality 92 is visually lossless for UI and type
 * and keeps a 60fps film's temp frames in the low gigabytes; PNG is lossless
 * for a film that lives on soft gradients, at 2–3× the capture time and disk.
 */
const framesFmt = String(args.frames ?? "jpeg").toLowerCase() === "png" ? "png" : "jpeg";
const frameExt = framesFmt === "png" ? "png" : "jpg";
// Temp files live in the CWD (the project folder), NOT next to the output —
// deliverables go to the shared renders/ folder. PID suffix keeps parallel
// segment renders from clobbering each other's frames.
const tmp      = resolve(`_frames_${process.pid}`);

rmSync(tmp, { recursive: true, force: true });
mkdirSync(tmp, { recursive: true });
mkdirSync(dirname(resolve(out)), { recursive: true });

const renderW = width * scale;
const renderH = height * scale;

console.log(`\n🚀 Starting Ultra-HD Video Render:`);
console.log(`   Page:      ${pageArg}`);
console.log(`   Res:       ${renderW}x${renderH} (${scale >= 2 ? "4K UHD" : "1080p"} @ scale ${scale})`);
console.log(`   FPS:       ${fps} FPS`);
console.log(`   Workers:   ${workers} parallel capture tabs`);

/**
 * We do not launch the browser, so --force-device-scale-factor is not ours to
 * pass. `deviceScaleFactor` on the context makes the page rasterize at `scale`,
 * and `clip.scale` below makes Page.captureScreenshot return those physical
 * pixels (raw CDP otherwise hands back CSS pixels).
 */
const clip = { x: 0, y: 0, width, height, scale };
const shotOpts = framesFmt === "png"
  ? { format: "png", captureBeyondViewport: false, clip }
  : { format: "jpeg", quality: 92, optimizeForSpeed: true, captureBeyondViewport: false, clip };

const cdpArg = process.argv.slice(2).find(a => a.startsWith("--cdp="));
const studio = await openStudioBrowser({
  cdp: cdpArg?.slice("--cdp=".length),
  viewport: { width, height },
  deviceScaleFactor: scale,
});
console.log(`   Browser:   ${studio.mode === "cdp" ? `CloakBrowser over CDP (${studio.endpoint})` : "local Chromium"}`);

const url = /^https?:/.test(pageArg) ? pageArg : localPageUrl(pageArg);
const initPage = await studio.newPage();
await initPage.goto(url, { waitUntil: "domcontentloaded" });
await initPage.waitForFunction("window.__READY === true", null, { timeout: 30000 });
const duration = await initPage.evaluate("window.__DURATION()");
const film = await initPage.evaluate("({ render: (window.SHOTS && window.SHOTS.render) || null, grade: (window.SHOTS && window.SHOTS.grade) || null })");
await initPage.close();

// The film's render and grade blocks, with flags overriding for this run.
const render = normalizeRender(film.render, {
  samples: args.samples, shutter: args.shutter, depth: args.depth, codec: args.codec, crf: args.crf,
});
const { grade, warnings: gradeWarnings } = normalizeGrade(film.grade, { lutExists: (p) => existsSync(resolve(p)) });
for (const w of gradeWarnings) console.warn(`   ⚠ ${w}`);
console.log(`   Look:      ${describeRender(render, grade)}\n`);

const from = Math.max(0, Number(args.from ?? 0));
const to   = args.to !== undefined ? Math.min(Number(args.to), duration) : duration;
if (to <= from) { console.error(`Invalid segment: --from=${from} --to=${to}`); process.exit(1); }
const isSegment = from > 0 || to < duration;

const total = Math.ceil((to - from) * fps);
const captures = total * render.samples;
console.log(`Timeline duration: ${duration.toFixed(2)}s${isSegment ? ` — rendering segment ${from.toFixed(2)}s → ${to.toFixed(2)}s` : ""} (${total} frames @ ${fps}fps${render.samples > 1 ? `, ${captures} captures` : ""})`);
if (render.samples > 1) console.log(`   ⚠ shutter: ${render.samples} captures per frame — the capture pass takes ${render.samples}× as long as a crisp render (shots.js \`render\` block).`);
if (scale >= 2) console.log(`   ⚠ 4K: each capture is four times the pixels of 1080p — expect about three times the time.`);

const chunkSize = Math.ceil(total / workers);
const startMs = Date.now();
let completedFrames = 0;
let lastReport = startMs;
// Progress on the clock, not every hundred frames: at 4K with a shutter a
// hundred frames is half a minute of silence, and the studio's bar reads it as stuck.
const report = (force = false) => {
  const now = Date.now();
  if (!force && now - lastReport < 2000) return;
  lastReport = now;
  const elapsed = (now - startMs) / 1000;
  const pct = ((completedFrames / total) * 100).toFixed(0);
  const rate = completedFrames / Math.max(0.001, elapsed);
  const eta = rate > 0 ? Math.max(0, (total - completedFrames) / rate) : 0;
  console.log(`  [${pct}%] Rendered ${completedFrames}/${total} frames - Elapsed: ${elapsed.toFixed(1)}s${completedFrames < total ? ` - ETA ${eta.toFixed(0)}s` : ""}`);
};

// One tab per worker, each seeking its own slice of the timeline.
const tasks = Array.from({ length: workers }, async (_, workerIdx) => {
  const startFrame = workerIdx * chunkSize;
  const endFrame = Math.min(startFrame + chunkSize, total);
  if (startFrame >= total) return;

  const page = await studio.newPage();
  const cdp = await page.context().newCDPSession(page);
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForFunction("window.__READY === true", null, { timeout: 30000 });

  for (let i = startFrame; i < endFrame; i++) {
    const times = sampleTimes(from + i / fps, fps, render);
    for (let k = 0; k < times.length; k++) {
      await page.evaluate((seekT) => { window.__SEEK(seekT); }, times[k]);
      const { data } = await cdp.send("Page.captureScreenshot", shotOpts);
      const n = String(i * render.samples + k).padStart(7, "0");
      await writeFile(`${tmp}/f_${n}.${frameExt}`, Buffer.from(data, "base64"));
    }
    completedFrames++;
    report(completedFrames === total);
  }
  await page.close();
});

await Promise.all(tasks);
await studio.close();

const rawVideo = resolve(`_temp_video_${process.pid}.mp4`);

/**
 * "Powered by trypitch.co" — the same watermark the demo-video flow burns in
 * (apps/worker/src/utils/intro-outro.ts): bottom-centre, Sorts Mill Goudy 24px,
 * a faint dark copy behind a light one so it stays legible on both light and
 * dark scenes.
 *
 * Applied HERE rather than in the page so no launch film can ship without it —
 * the same reasoning as the audit gates: a mechanism beats a rule someone has
 * to remember 400 lines into a build. Scales with --scale so it sits at the
 * same relative position at 1080p and 4K. Opt out with --no-watermark.
 */
/** drawtext needs an ffmpeg built with libfreetype; some installs lack it. */
function ffmpegHasDrawtext() {
  try {
    return /\bdrawtext\b/.test(execSync("ffmpeg -hide_banner -filters", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }));
  } catch {
    return false;
  }
}

function watermarkFilter() {
  if (args["no-watermark"]) return null;
  const fontFile = resolve(HERE, "..", "..", "..", "assets", "fonts", "SortsMillGoudy-Regular.ttf");
  if (!existsSync(fontFile)) {
    console.warn(`⚠ watermark font missing (${fontFile}) — rendering without it`);
    return null;
  }
  if (!ffmpegHasDrawtext()) {
    console.warn("⚠ this ffmpeg has no drawtext filter (built without libfreetype) — rendering without the watermark");
    return null;
  }
  const text = "Powered by trypitch.co";
  const size = Math.round(24 * scale);
  const yBase = `h-${Math.round(34 * scale)}`;
  const esc = (p) => p.replace(/\\/g, "/").replace(/:/g, "\\:");
  // NB: drawtext has no letter_spacing option in ffmpeg 6 — the demo flow gets
  // its 0.5px tracking from SVG text, which does not translate here.
  const common = `fontfile='${esc(fontFile)}':text='${text}':fontsize=${size}:x=(w-text_w)/2`;
  // shadow first, then the light face 1.5px above it
  return `drawtext=${common}:y=${yBase}+${Math.round(1.5 * scale)}:fontcolor=black@0.22,` +
         `drawtext=${common}:y=${yBase}:fontcolor=0xC9C9D4@0.62`;
}

const wm = watermarkFilter();
const vf = renderFilter({ fps, render, grade, downscale, watermark: wm });
console.log(`\n🎬 Assembling Video Track with FFmpeg...${wm ? " (+ watermark)" : ""}${downscale ? ` (→ ${outRes.height}p)` : ""}${render.samples > 1 ? ` (shutter ${render.shutter}, ${render.samples} samples/frame)` : ""}${grade ? " (+ grade)" : ""}`);
try {
  execFileSync("ffmpeg", [
    "-y", "-framerate", String(fps * render.samples), "-i", `${tmp}/f_%07d.${frameExt}`,
    "-vf", vf, ...codecArgs(render), "-r", String(fps), rawVideo,
  ], { stdio: "inherit" });
} finally {
  // Never leave thousands of frames behind, even when the encode fails.
  rmSync(tmp, { recursive: true, force: true });
}

if (!isSegment && existsSync("audio/mix.wav")) {
  console.log("\n🔊 Muxing Audio Mix (Voiceovers + Music + SFX) into final deliverable...");
  execFileSync("ffmpeg", [
    "-y", "-i", rawVideo, "-i", "audio/mix.wav", "-map", "0:v", "-map", "1:a",
    "-c:v", "copy", "-c:a", "aac", "-b:a", "256k", "-shortest", resolve(out),
  ], { stdio: "inherit" });
  rmSync(rawVideo, { force: true });
} else {
  execFileSync("mv", [rawVideo, resolve(out)]);
}

console.log(`\n✨ DONE! Deliverable Ready: ${out}\n`);
