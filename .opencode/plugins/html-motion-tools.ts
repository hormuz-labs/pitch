/**
 * HTML Motion Video — dedicated tools wrapping the html-motion-video skill's
 * executable scripts (tts.mjs, capture.mjs, audit.mjs, screenshot.mjs).
 *
 * Each tool runs its script with the session's project directory as CWD, so
 * relative paths (audio/, renders/, audit/) resolve where the skill expects.
 * Exposed to the `html-video` agent (and available to all agents).
 */
import { execFile, execFileSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { tool } from "@opencode-ai/plugin";
import { z } from "zod";

const execFileAsync = promisify(execFile);

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPTS = join(HERE, "..", "skills", "html-motion-video", "scripts");
const MAX_BUFFER = 16 * 1024 * 1024;

function scriptPath(name) {
  return join(SCRIPTS, name);
}

/** Run a skill script with the session project dir as CWD. */
async function runScript(name, args, cwd, timeoutMs = 1_200_000) {
  const script = scriptPath(name);
  const { stdout, stderr } = await execFileAsync(
    process.execPath, // node: these are .mjs ESM scripts
    [script, ...args],
    { cwd, encoding: "utf8", maxBuffer: MAX_BUFFER, timeout: timeoutMs }
  );
  return `${stdout}\n${stderr}`.trim();
}

// ---------------------------------------------------------------------------
// 1. TTS voiceover generation (Phase 3)
// ---------------------------------------------------------------------------
export const motion_tts = tool({
  description:
    "Generate one AI voiceover clip via the html-motion-video skill's Gemini TTS. " +
    "Takes a script line, a per-scene delivery style, an output WAV path (audio/vo_<name>.wav), " +
    "and an optional voice. Returns the clip's measured duration — use it to size the scene in js/timing.js.",
  args: {
    text: z.string().describe("The exact line the narrator speaks. Short, punchy copy."),
    out: z.string().describe("Output WAV path, conventionally audio/vo_<name>.wav"),
    voice: z.enum(["Aoede", "Kore", "Leda", "Charon"]).optional()
      .describe("Default Aoede (bright). Kore=warm, Leda=sleek, Charon=deep male."),
    style: z.string().optional()
      .describe("Natural-language delivery direction: pace, emotion, register. Scene-specific."),
    model: z.string().optional()
      .describe("Gemini TTS model id. Overrides gemini-2.5-flash-preview-tts."),
  },
  async execute(args, context) {
    const a = ["--text=" + args.text, "--out=" + args.out];
    if (args.voice) a.push("--voice=" + args.voice);
    if (args.style) a.push("--style=" + args.style);
    if (args.model) a.push("--model=" + args.model);
    const out = await runScript("tts.mjs", a, context.directory);
    return { output: out };
  },
});

// ---------------------------------------------------------------------------
// 2. Render (Phase 6) — full timeline or a segment
// ---------------------------------------------------------------------------
export const motion_render = tool({
  description:
    "Render index.html to MP4 via deterministic multi-worker seek-and-capture. " +
    "Requires window.__SEEK/__DURATION/__READY. Use a segment (from/to) to iterate on one scene " +
    "(skips audio mux, runs in parallel); use a full render without from/to, with audio/mix.wav, " +
    "for the final deliverable. Run inside the project folder. Long-running (~20 min cap).",
  args: {
    out: z.string().describe(
      "Output MP4. Segment drafts: renders/<name>-sN-draft.mp4; final: renders/<name>-launch.mp4"),
    page: z.string().optional().describe("Page to render (default index.html)"),
    fps: z.number().int().min(1).optional().describe("Frames/sec (default 60 full, 30 drafts)"),
    scale: z.number().int().min(1).optional().describe("Resolution scale: 1=1080p, 2=4K (default 2)"),
    width: z.number().int().optional().describe("Viewport width (default 1920)"),
    height: z.number().int().optional().describe("Viewport height (default 1080)"),
    workers: z.number().int().min(1).optional().describe("Parallel browser workers (default auto ≤6)"),
    from: z.number().nonnegative().optional().describe("Segment start (s). Use __CUES() scene labels"),
    to: z.number().nonnegative().optional().describe("Segment end (s). Use __CUES() scene labels"),
  },
  async execute(args, context) {
    const a = [];
    if (args.page) a.push(args.page);
    if (args.out) a.push("--out=" + args.out);
    if (args.fps) a.push("--fps=" + args.fps);
    if (args.scale) a.push("--scale=" + args.scale);
    if (args.width) a.push("--width=" + args.width);
    if (args.height) a.push("--height=" + args.height);
    if (args.workers) a.push("--workers=" + args.workers);
    if (args.from) a.push("--from=" + args.from);
    if (args.to) a.push("--to=" + args.to);
    const out = await runScript("capture.mjs", a, context.directory);
    return { output: out };
  },
});

// ---------------------------------------------------------------------------
// 3. Motion audit (Phase 6, gate) — zero static-hold
// ---------------------------------------------------------------------------
export const motion_audit = tool({
  description:
    "Run the motion audit on index.html: samples frames, flags static holds and visual " +
    "contract violations. GATE — the build FAILS if there are static-hold warnings. " +
    "Writes frames to ./audit/. Can run in parallel with segment renders.",
  args: {
    page: z.string().optional().describe("Page to audit (default index.html)"),
    interval: z.number().optional().describe("Sample interval seconds (default 1)"),
    threshold: z.number().optional().describe("Pixel-diff threshold (default 0.003)"),
    out: z.string().optional().describe("Output frame dir (default audit)"),
  },
  async execute(args, context) {
    const a = [];
    if (args.page) a.push(args.page);
    if (args.interval) a.push("--interval=" + args.interval);
    if (args.threshold) a.push("--threshold=" + args.threshold);
    if (args.out) a.push("--out=" + args.out);
    const out = await runScript("audit.mjs", a, context.directory);
    return { output: out };
  },
});

// ---------------------------------------------------------------------------
// 4. Screenshot / recon capture (Phase 0)
// ---------------------------------------------------------------------------
export const motion_screenshot = tool({
  description:
    "Capture a reference screenshot for Phase-0 recon: from a live URL, or a synthetic HTML " +
    "template. For brand recon -> recon/screenshots/. Not for video frames.",
  args: {
    out: z.string().describe("Output PNG path, conventionally recon/screenshots/<name>.png"),
    url: z.string().optional().describe("Live URL to capture"),
    html: z.string().optional().describe("Local HTML template path to capture"),
    width: z.number().int().optional().describe("Viewport width (default 1920)"),
    height: z.number().int().optional().describe("Viewport height (default 1080)"),
    selector: z.string().optional().describe("CSS selector; capture just that element"),
    fullPage: z.boolean().optional().describe("Full height scroll capture"),
    wait: z.number().int().optional().describe("Ms to wait for network/render after load"),
  },
  async execute(args, context) {
    if (!args.url && !args.html) {
      throw new Error("Provide either 'url' or 'html' to motion_screenshot.");
    }
    const a = ["--out=" + args.out];
    if (args.url) a.push("--url=" + args.url);
    if (args.html) a.push("--html=" + args.html);
    if (args.width) a.push("--width=" + args.width);
    if (args.height) a.push("--height=" + args.height);
    if (args.selector) a.push("--selector=" + args.selector);
    if (args.fullPage) a.push("--fullPage=true");
    if (args.wait) a.push("--wait=" + args.wait);
    const out = await runScript("screenshot.mjs", a, context.directory);
    return { output: out };
  },
});

// ---------------------------------------------------------------------------
// 4b. Asset harvesting (Phase 0) — the product's OWN media
// ---------------------------------------------------------------------------
export const motion_harvest = tool({
  description:
    "Download the target site's own images, product screenshots, inline logo SVGs and " +
    "video files into assets/harvested/, with a manifest (recon/harvested.json) recording " +
    "each asset's source URL, real dimensions, duration, and the section heading it appeared " +
    "under. Run this in Phase 0 BEFORE building scenes: a film made from the brand's real " +
    "photography, real screens and real logomark looks like their design team made it, while " +
    "grey placeholder rectangles look like a wireframe. Picks the largest srcset candidate, " +
    "scrolls to trigger lazy-loading, and dedupes by content hash. Third-party players " +
    "(Wistia/YouTube/Vimeo) are reported, not downloaded. If the site is bot-walled, pass cdp.",
  args: {
    url: z.string().describe("Page to harvest"),
    cdp: z.string().optional().describe(
      "CDP endpoint of an anti-detect browser, e.g. http://localhost:8080/api/profiles/<id>/cdp. " +
      "Required for Cloudflare-walled sites — the same fix screenshot.mjs suggests on a block page."),
    out: z.string().optional().describe("Asset directory (default assets/harvested)"),
    manifest: z.string().optional().describe("Manifest path (default recon/harvested.json)"),
    minPx: z.number().int().optional().describe("Ignore images smaller than this on both axes (default 240)"),
    max: z.number().int().optional().describe("Max assets to download (default 48)"),
    noScroll: z.boolean().optional().describe("Skip the lazy-load scroll pass"),
  },
  async execute(args, context) {
    const a: string[] = ["--url=" + args.url];
    if (args.cdp) a.push("--cdp=" + args.cdp);
    if (args.out) a.push("--out=" + args.out);
    if (args.manifest) a.push("--manifest=" + args.manifest);
    if (args.minPx != null) a.push("--min-px=" + args.minPx);
    if (args.max != null) a.push("--max=" + args.max);
    if (args.noScroll) a.push("--no-scroll");
    const out = await runScript("harvest.mjs", a, context.directory);
    return { output: out };
  },
});

// ---------------------------------------------------------------------------
// 4c. Timeline label export (Phase 5 prerequisite)
// ---------------------------------------------------------------------------
export const motion_cues = tool({
  description:
    "Export the master timeline's REAL scene labels and duration to audio/cues.json. " +
    "Run after the master timeline exists and BEFORE placing voiceover or SFX. Scene start " +
    "times have exactly one authority — the page. Summing SCENE_TIMING durations is only " +
    "correct when every boundary is a plain cut; any overlap shifts later labels earlier and " +
    "drifts the audio out of sync with the picture. motion_mix reads this file when present.",
  args: {
    page: z.string().optional().describe("Page to read (default index.html)"),
    out: z.string().optional().describe("Output JSON (default audio/cues.json)"),
  },
  async execute(args, context) {
    const a: string[] = [];
    if (args.page) a.push(args.page);
    if (args.out) a.push("--out=" + args.out);
    const out = await runScript("cues.mjs", a, context.directory);
    return { output: out };
  },
});

// ---------------------------------------------------------------------------
// 5. Curated music / SFX library scan (Phase 5)
// ---------------------------------------------------------------------------
/** Shared audio library roots: assets/music + assets/sfx at the repo root. */
function libraryRoots(cwd: string): string[] {
  // CWD is normally the project folder (projects/<name>/, 2 levels below the
  // repo root); fall back to CWD itself in case the session runs at the root.
  for (const base of [join(cwd, "..", ".."), cwd]) {
    if (existsSync(join(base, "assets", "music"))) {
      return [join(base, "assets", "music"), join(base, "assets", "sfx")];
    }
  }
  return [];
}

export const motion_find_audio = tool({
  description:
    "Scan only the curated shared audio library (assets/music/ for beds, assets/sfx/ for SFX) " +
    "for audio sorted by recency, so Phase 5 can source an approved track before falling back " +
    "to generation. Never scans home or personal directories. Reports paths, sizes, and " +
    "modification dates.",
  args: {
    max: z.number().int().min(1).optional().describe("Max entries per directory (default 15)"),
  },
  async execute(args, context) {
    const max = args.max ?? 15;
    const roots = libraryRoots(context.directory);
    const found = [];
    for (const root of roots) {
      if (!existsSync(root)) continue;
      const entries = readdirSync(root).filter((e) => !e.startsWith("."));
      for (const file of entries.filter((e) => AUDIO_RE.test(e))) {
        const p = join(root, file);
        const st = statSync(p);
        found.push({ p, ms: st.size / 1e6, mtime: st.mtime });
      }
      for (const dir of entries.filter((e) => !AUDIO_RE.test(e))) {
        const dp = join(root, dir);
        let sub;
        try { sub = readdirSync(dp); } catch { continue; }
        for (const f of sub.filter((e) => !e.startsWith(".") && AUDIO_RE.test(e))) {
          if (found.length >= max) break;
          const p = join(dp, f);
          const st = statSync(p);
          found.push({ p, ms: st.size / 1e6, mtime: st.mtime });
        }
        if (found.length >= max) break;
      }
    }
    if (found.length === 0) return { output: `No audio files found under ${roots.join(", ")}` };
    found.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
    const lines = found.map((f) =>
      `${f.p}  [${f.ms.toFixed(1)} MB]  ${f.mtime.toISOString().slice(0, 16).replace("T", " ")}`
    ).join("\n");
    return { output: `Audio candidates:\n${lines}` };
  },
});

// ---------------------------------------------------------------------------
// 5b. Curated SFX manifest — query + synced bus build (Phase 5)
// ---------------------------------------------------------------------------
export const motion_sfx = tool({
  description:
    "Query the curated SFX manifest, or build a synced SFX bus from a cue sheet. " +
    "action='list' prints the motion-event vocabulary; action='query' returns ranked, " +
    "measured candidates for one event; action='build' renders audio/sfx_bus.wav from " +
    "audio/sfx-cues.json, placing every cue by its measured onset so the transient lands " +
    "on the frame, and trimming each cue to its `dur` so a sustained sound (typing, data " +
    "chatter, a long whoosh) stops when its animation stops instead of playing the whole " +
    "file. NEVER browse the raw SFX folders — most of that library is meme/game/" +
    "weapon audio that must not reach a client render. Read references/sfx-design.md first.",
  args: {
    action: z.enum(["list", "query", "build"]).describe(
      "list = event vocabulary; query = candidates for one event; build = render the bus"),
    event: z.string().optional().describe(
      "Event name for action='query': pop, tick, click, type, select, data, notify, chime, " +
      "success, camera, whoosh_soft, whoosh_deep, reverse, riser, impact, subdrop, glitch"),
    max: z.number().optional().describe("Cap clip length in seconds (query): keeps travel sounds under the tween they cover"),
    limit: z.number().int().optional().describe("Max candidates to print (query, default 12)"),
    cues: z.string().optional().describe("Cue sheet path for build (default audio/sfx-cues.json)"),
    duration: z.number().optional().describe("Timeline length for build — CONTENT_DURATION from __DURATION()"),
    out: z.string().optional().describe("Output WAV for build (default audio/sfx_bus.wav)"),
    dryRun: z.boolean().optional().describe("Build: print the placement plan without rendering"),
  },
  async execute(args, context) {
    const a: string[] = [args.action === "build" ? "build" : "query"];
    if (args.action === "list") a.push("--list");
    if (args.event) a.push("--event=" + args.event);
    if (args.max != null) a.push("--max=" + args.max);
    if (args.limit != null) a.push("--limit=" + args.limit);
    if (args.cues) a.push("--cues=" + args.cues);
    if (args.duration != null) a.push("--duration=" + args.duration);
    if (args.out) a.push("--out=" + args.out);
    if (args.dryRun) a.push("--dry-run");
    const out = await runScript("sfx.mjs", a, context.directory);
    return { output: out };
  },
});

// ---------------------------------------------------------------------------
// 5c. Rebuild the SFX manifest (only when the libraries change)
// ---------------------------------------------------------------------------
export const motion_sfx_reindex = tool({
  description:
    "Rebuild references/sfx-index.json by rescanning the SFX libraries: measures duration, " +
    "transient onset and loudness for every file, classifies each into a motion-event class, " +
    "and drops banned (meme/game-rip/weapon/novelty) audio. Only needed when the libraries " +
    "themselves change — not per video. Slow (~2 min); pass quick to skip loudness.",
  args: {
    quick: z.boolean().optional().describe("Skip loudness measurement (~6x faster, but the mixer loses level-aware clip ranking)"),
    root: z.string().optional().describe("Absolute path of an ADDITIONAL library root to index"),
  },
  async execute(args, context) {
    const a: string[] = [];
    if (args.quick) a.push("--quick");
    if (args.root) a.push("--root=" + args.root);
    const out = await runScript("sfx-index.mjs", a, context.directory);
    return { output: out };
  },
});

// ---------------------------------------------------------------------------
// 5d. Final mixdown with narration-priority verification (Phase 5)
// ---------------------------------------------------------------------------
export const motion_mix = tool({
  description:
    "Build audio/mix.wav from the VO clips, music bed and SFX bus — then VERIFY it. " +
    "The narration is the priority signal: the bed is attenuated, sidechain-ducked against " +
    "the VO, and has the speech band EQ-carved out of it so voice and music never occupy " +
    "the same spectrum. Reads VO placement from js/timing.js (SCENE_TIMING) or --vo-map. " +
    "FAILS (non-zero) if the narration is not at least min-contrast dB above the music-only " +
    "floor, measured by extracting real windows from the finished file. Never hand-roll the " +
    "mixdown; never render on a failing mix.",
  args: {
    duration: z.number().describe("Timeline length — CONTENT_DURATION from __DURATION()"),
    music: z.string().optional().describe("Music bed path, e.g. audio/music.mp3"),
    sfx: z.string().optional().describe("SFX bus from motion_sfx build, e.g. audio/sfx_bus.wav"),
    voMap: z.string().optional().describe("JSON [{file,t}] overriding VO placement from js/timing.js"),
    out: z.string().optional().describe("Output mix (default audio/mix.wav)"),
    bedDb: z.number().optional().describe("Music bed attenuation in dB (default -17). Lower = quieter bed."),
    duck: z.number().optional().describe("Ducking depth in dB the bed drops under speech (default 9)"),
    minContrast: z.number().optional().describe("Gate: dB the VO must sit above the music-only floor (default 10)"),
    voLead: z.number().optional().describe("Seconds between a scene's start and its VO line (default 0.3)"),
    dryRun: z.boolean().optional().describe("Print the plan and VO overlap check without rendering"),
  },
  async execute(args, context) {
    const a: string[] = ["--duration=" + args.duration];
    if (args.music) a.push("--music=" + args.music);
    if (args.sfx) a.push("--sfx=" + args.sfx);
    if (args.voMap) a.push("--vo-map=" + args.voMap);
    if (args.out) a.push("--out=" + args.out);
    if (args.bedDb != null) a.push("--bed-db=" + args.bedDb);
    if (args.duck != null) a.push("--duck=" + args.duck);
    if (args.minContrast != null) a.push("--min-contrast=" + args.minContrast);
    if (args.voLead != null) a.push("--vo-lead=" + args.voLead);
    if (args.dryRun) a.push("--dry-run");
    const out = await runScript("mix.mjs", a, context.directory);
    return { output: out };
  },
});

// ---------------------------------------------------------------------------
// 6. Verify duration (Phase 6) — ffprobe
// ---------------------------------------------------------------------------
export const motion_verify_duration = tool({
  description:
    "ffprobe the duration of a rendered MP4 to confirm it matches the timeline length, not the " +
    "audio length. Run from the project folder. Use after any final render.",
  args: {
    file: z.string().describe("MP4 path to probe (relative to project folder)"),
  },
  async execute(args, context) {
    const abs = isAbsolute(args.file) ? args.file : join(context.directory, args.file);
    if (!existsSync(abs)) throw new Error(`File not found: ${abs}`);
    const dur = execFileSync("ffprobe", [
      "-v", "quiet", "-show_entries", "format=duration", "-of", "csv=p=0", abs,
    ], { encoding: "utf8" }).trim();
    return { output: `${args.file}: ${Number(dur).toFixed(3)}s` };
  },
});

const AUDIO_RE = /\.(mp3|wav|m4a|aac|flac|ogg|opus)$/i;   // opus: the vendored SFX library format

// ---------------------------------------------------------------------------
// Plugin entry — registers all motion_* tools in opencode's hook shape.
// ---------------------------------------------------------------------------
export const htmlMotionVideo = async () => ({
  tool: {
    motion_tts,
    motion_render,
    motion_audit,
    motion_screenshot,
    motion_find_audio,
    motion_harvest,
    motion_cues,
    motion_sfx,
    motion_sfx_reindex,
    motion_mix,
    motion_verify_duration,
  },
});
