/**
 * HTML Motion Video — dedicated tools wrapping the html-motion-video skill's
 * executable scripts (tts.mjs, capture.mjs, audit.mjs, screenshot.mjs).
 *
 * Each tool runs its script with the session's project directory as CWD, so
 * relative paths (audio/, renders/, audit/) resolve where the skill expects.
 * Exposed to the `html-video` agent (and available to all agents).
 */
import { tool } from "@opencode-ai/plugin";
import { z } from "zod";
import { execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { dirname, join, isAbsolute } from "node:path";
import { existsSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";

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
// 5. Music / SFX scan (assets/ library + ~/Downloads) (Phase 5)
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
    "Scan the shared audio library (assets/music/ for beds, assets/sfx/ for SFX) and " +
    "~/Downloads for music beds and SFX (.mp3/.wav/.m4a/etc) sorted by recency, so Phase 5 " +
    "can source a track from the library before falling back to generation. Pass 'dir' to " +
    "scan a specific directory instead. Reports paths, sizes, and modification dates.",
  args: {
    dir: z.string().optional().describe("Directory to scan (default: assets/music + assets/sfx + ~/Downloads)"),
    max: z.number().int().min(1).optional().describe("Max entries per directory (default 15)"),
  },
  async execute(args, context) {
    const max = args.max ?? 15;
    const roots = args.dir
      ? [args.dir]
      : [...libraryRoots(context.directory), join(homedir(), "Downloads")];
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

const AUDIO_RE = /\.(mp3|wav|m4a|aac|flac|ogg)$/i;

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
    motion_verify_duration,
  },
});