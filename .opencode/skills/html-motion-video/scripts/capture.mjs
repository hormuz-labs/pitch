#!/usr/bin/env node
/**
 * Deterministic multi-worker parallel seek-and-capture renderer: HTML+GSAP page -> high-fps MP4.
 * Requires: playwright (npm i playwright && npx playwright install chromium), ffmpeg.
 *
 * The page MUST expose:  window.__SEEK(seconds), window.__DURATION(), window.__READY
 *
 * Usage:
 *   node capture.mjs page.html [--fps=60] [--scale=2] [--out-res=720p|1080p|4k] [--width=1920] [--height=1080]
 *                    [--workers=8] [--out=out/video.mp4] [--from=<sec>] [--to=<sec>]
 *
 * --from/--to render only a segment of the timeline (e.g. one scene, for fast
 * iteration; several segment renders can run in parallel). Segment renders
 * skip the audio mux — only full renders mux audio/mix.wav.
 */
import { chromium } from "playwright";
import { execSync } from "node:child_process";
import { mkdirSync, rmSync, existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

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
// Leave at least 2 CPU cores free for macOS system responsiveness, max 6 parallel workers by default
const defaultWorkers = Math.max(1, Math.min(6, os.cpus().length - 2));
const workers  = Number(args.workers ?? defaultWorkers);
const out      = String(args.out ?? "out/video.mp4");
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
console.log(`   Workers:   ${workers} isolated parallel browser workers\n`);

const chromiumFlags = [
  `--force-device-scale-factor=${scale}`,
  "--ignore-gpu-blocklist",
  "--enable-gpu-rasterization",
  "--enable-zero-copy",
  "--disable-dev-shm-usage",
  "--no-sandbox",
  "--mute-audio"
];

// Get total animation duration using init browser
const initBrowser = await chromium.launch({ args: chromiumFlags });
const initPage = await initBrowser.newPage({
  viewport: { width, height },
  deviceScaleFactor: scale
});
const url = /^https?:/.test(pageArg) ? pageArg : "file://" + resolve(pageArg);
await initPage.goto(url, { waitUntil: "domcontentloaded" });
await initPage.waitForFunction("window.__READY === true", null, { timeout: 30000 });
const duration = await initPage.evaluate("window.__DURATION()");
await initBrowser.close();

const from = Math.max(0, Number(args.from ?? 0));
const to   = args.to !== undefined ? Math.min(Number(args.to), duration) : duration;
if (to <= from) { console.error(`Invalid segment: --from=${from} --to=${to}`); process.exit(1); }
const isSegment = from > 0 || to < duration;

const total = Math.ceil((to - from) * fps);
console.log(`Timeline duration: ${duration.toFixed(2)}s${isSegment ? ` — rendering segment ${from.toFixed(2)}s → ${to.toFixed(2)}s` : ""} (${total} frames @ ${fps}fps)`);

const chunkSize = Math.ceil(total / workers);
const startMs = Date.now();
let completedFrames = 0;

// Launch isolated browser process per worker to avoid single-browser process IPC/GPU lock contention
const tasks = Array.from({ length: workers }, async (_, workerIdx) => {
  const startFrame = workerIdx * chunkSize;
  const endFrame = Math.min(startFrame + chunkSize, total);
  if (startFrame >= total) return;

  const workerBrowser = await chromium.launch({ args: chromiumFlags });
  const page = await workerBrowser.newPage({
    viewport: { width, height },
    deviceScaleFactor: scale
  });
  const cdp = await page.context().newCDPSession(page);
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForFunction("window.__READY === true", null, { timeout: 30000 });

  for (let i = startFrame; i < endFrame; i++) {
    const t = from + i / fps;
    await page.evaluate((seekT) => { window.__SEEK(seekT); }, t);
    const { data } = await cdp.send("Page.captureScreenshot", { format: "jpeg", quality: 80, optimizeForSpeed: true });
    const n = String(i).padStart(6, "0");
    await writeFile(`${tmp}/f_${n}.jpg`, Buffer.from(data, "base64"));
    completedFrames++;
    if (completedFrames % 100 === 0 || completedFrames === total) {
      const elapsed = ((Date.now() - startMs) / 1000).toFixed(1);
      const pct = ((completedFrames / total) * 100).toFixed(0);
      console.log(`  [${pct}%] Rendered ${completedFrames}/${total} frames - Elapsed: ${elapsed}s`);
    }
  }
  await page.close();
  await workerBrowser.close();
});

await Promise.all(tasks);

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
function watermarkFilter() {
  if (args["no-watermark"]) return null;
  const fontFile = resolve(HERE, "..", "..", "..", "..", "assets", "fonts", "SortsMillGoudy-Regular.ttf");
  if (!existsSync(fontFile)) {
    console.warn(`⚠ watermark font missing (${fontFile}) — rendering without it`);
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
const vf = [downscale, wm].filter(Boolean).join(",");
console.log(`\n🎬 Assembling Video Track with FFmpeg...${wm ? " (+ watermark)" : ""}${downscale ? ` (→ ${outRes.height}p)` : ""}`);
execSync(
  `ffmpeg -y -framerate ${fps} -i "${tmp}/f_%06d.jpg" ` +
  (vf ? `-vf "${vf}" ` : "") +
  `-c:v libx264 -preset fast -crf 16 -pix_fmt yuv420p -movflags +faststart "${rawVideo}"`,
  { stdio: "inherit" }
);

rmSync(tmp, { recursive: true, force: true });

if (!isSegment && existsSync("audio/mix.wav")) {
  console.log("\n🔊 Muxing Audio Mix (Voiceovers + Music + SFX) into final deliverable...");
  execSync(
    `ffmpeg -y -i "${rawVideo}" -i "audio/mix.wav" -map 0:v -map 1:a -c:v copy -c:a aac -b:a 256k -shortest "${out}"`,
    { stdio: "inherit" }
  );
  rmSync(rawVideo, { force: true });
} else {
  execSync(`mv "${rawVideo}" "${out}"`);
}

console.log(`\n✨ DONE! Deliverable Ready: ${out}\n`);
