import { execSync } from 'child_process';
import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs';
import path from 'path';
import { DemoConfig, DemoStep } from './types';
import {
  getFFmpegHwAccelOptions,
  buildCursorAnimationExprs,
  buildCursorAlphaExpr,
  buildCursorScaleExpr,
  buildFilterString,
} from './utils';

// ── Preflight ────────────────────────────────────────────────────────────────
function preflight(demoDir: string): void {
  const rawVideoPointer = path.join(demoDir, 'raw-video-path.txt');
  if (!fs.existsSync(rawVideoPointer)) throw new Error(`[pass4-ffmpeg] raw-video-path.txt not found — run pass3-record first. Expected: ${rawVideoPointer}`);
  const rawPath = fs.readFileSync(rawVideoPointer, 'utf8').trim();
  if (!fs.existsSync(rawPath)) throw new Error(`[pass4-ffmpeg] Raw video file does not exist: ${rawPath}`);

  const trackingPath = path.join(demoDir, 'tracking.json');
  if (!fs.existsSync(trackingPath)) throw new Error(`[pass4-ffmpeg] tracking.json not found — run pass3-record first. Expected: ${trackingPath}`);

  const voicePath = path.join(demoDir, 'voiceover.wav');
  if (!fs.existsSync(voicePath)) throw new Error(`[pass4-ffmpeg] voiceover.wav not found — run pass2-tts first. Expected: ${voicePath}`);

  const timelinePath = path.join(demoDir, 'timeline.json');
  if (!fs.existsSync(timelinePath)) throw new Error(`[pass4-ffmpeg] timeline.json not found — run pass2-timeline first. Expected: ${timelinePath}`);

  const clickSfx = path.join(demoDir, 'assets', 'sounds', 'click.mp3');
  const keySfx = path.join(demoDir, 'assets', 'sounds', 'keyboard.mp3');
  if (!fs.existsSync(clickSfx)) throw new Error(`[pass4-ffmpeg] click.mp3 not found. Expected: ${clickSfx}`);
  if (!fs.existsSync(keySfx)) throw new Error(`[pass4-ffmpeg] keyboard.mp3 not found. Expected: ${keySfx}`);
}

/**
 * Pass 6 — FFmpeg Post-Processing (Cinematic Overlay + AV Sync + Intro Stitch)
 * Inputs:  raw-video-path.txt, tracking.json, voiceover.wav, timeline.json,
 *          cursor.png, assets/sounds/, intro-path.txt (optional)
 * Outputs: <outputPath>.mp4 (final video)
 */
export async function pass4Ffmpeg(
  config: DemoConfig,
  demoSteps: DemoStep[],
  demoDir: string
): Promise<void> {
  preflight(demoDir);

  const VIDEO_WIDTH = config.width || 1920;
  const VIDEO_HEIGHT = config.height || 1080;

  const videoPath = fs.readFileSync(path.join(demoDir, 'raw-video-path.txt'), 'utf8').trim();
  const trackingData = JSON.parse(fs.readFileSync(path.join(demoDir, 'tracking.json'), 'utf8'));
  const timeline: Record<string, number> = JSON.parse(fs.readFileSync(path.join(demoDir, 'timeline.json'), 'utf8'));
  const { initDurationMs, events: trackingEvents, originalTimeline } = trackingData;

  const cursorPng = path.join(demoDir, 'cursor.png');
  const { hasVaapi, hwFilterSuffix, hwOutputOpts } = getFFmpegHwAccelOptions();

  const trimSeconds = (initDurationMs / 1000).toFixed(3);
  console.log(`== Pass 6: FFmpeg Post-Processing ==`);
  console.log(`⏱️  Trimming page load dead time: ${trimSeconds}s`);

  // ── Build animation expressions ────────────────────────────────────────────
  const { overlayXExpr, overlayYExpr, zoomZExpr, panXExpr, panYExpr } =
    buildCursorAnimationExprs(trackingEvents, VIDEO_WIDTH, VIDEO_HEIGHT);

  const cursorAlphaExpr = buildCursorAlphaExpr(trackingEvents);
  const cursorScaleExpr = buildCursorScaleExpr(trackingEvents, timeline);

  const { filterString, sfxStartIndex } = buildFilterString({
    trimSeconds,
    cursorScaleExpr,
    cursorPngExists: fs.existsSync(cursorPng),
    cursorAlphaExpr,
    overlayXExpr,
    overlayYExpr,
    zoomZExpr,
    panXExpr,
    panYExpr,
    hwFilterSuffix,
    videoWidth: VIDEO_WIDTH,
    videoHeight: VIDEO_HEIGHT,
    demoSteps,
    timeline,
    originalTimeline: originalTimeline ?? timeline,
  });

  const finalOutput = config.outputPath
    ? path.resolve(demoDir, path.basename(config.outputPath))
    : path.join(demoDir, 'demo-final.mp4');
  const tempRawOut = finalOutput.replace('.mp4', '-raw.mp4');

  // Preflight check: Ensure the output directory exists
  const finalOutputDir = path.dirname(finalOutput);
  if (!fs.existsSync(finalOutputDir)) {
    fs.mkdirSync(finalOutputDir, { recursive: true });
  }

  // ── Assemble FFmpeg command ────────────────────────────────────────────────
  const filterScriptPath = path.join(demoDir, 'filters.txt');
  fs.writeFileSync(filterScriptPath, filterString);

  const command = ffmpeg().input(videoPath);
  if (fs.existsSync(cursorPng)) command.input(cursorPng).inputOptions(['-loop 1']);
  command.input(path.join(demoDir, 'voiceover.wav'));

  let sfxIndex = sfxStartIndex;
  for (const step of demoSteps) {
    let tTime = timeline[step.id];
    if (tTime > 1000) tTime = tTime / 1000;
    if (step.action === 'click') {
      command.input(path.join(demoDir, 'assets', 'sounds', 'click.mp3'));
      sfxIndex++;
    } else if (step.action === 'type') {
      command.input(path.join(demoDir, 'assets', 'sounds', 'keyboard.mp3')).inputOptions(['-stream_loop -1']);
      sfxIndex++;
    }
  }

  const rawAlreadyExists = fs.existsSync(tempRawOut) && fs.statSync(tempRawOut).size > 0;
  if (rawAlreadyExists) {
    console.log('⏭️  [pass4] Raw output already exists — skipping re-encode.');
  } else {
    console.log('🎬 Encoding final video...');
    await new Promise<void>((resolve, reject) => {
      if (hasVaapi) command.addOption('-vaapi_device', '/dev/dri/renderD128');
      command
        .outputOptions([
          '-filter_complex_script', filterScriptPath,
          '-map', '[vout]',
          '-map', '[aout]',
          ...hwOutputOpts,
          '-profile:v', 'high',
          '-level:v', '4.2',
          '-c:a', 'aac',
          '-r', '30',
          '-movflags', '+faststart',
          '-metadata', `title=${config.outputPath ? path.basename(config.outputPath, '.mp4') : 'demo'}`,
        ])
        .save(tempRawOut)
        .on('progress', (progress) => {
          if (progress.percent !== undefined) {
            process.stdout.write(`Encoding: ${progress.percent.toFixed(1)}%\r`);
          } else if (progress.frames) {
            process.stdout.write(`Encoding frame: ${progress.frames}\r`);
          }
        })
        .on('end', () => {
          console.log('\n✅ Encoding complete.');
          resolve();
        })
        .on('error', reject);
    });
  }

  // ── Stitch intro & outro ──────────────────────────────────────────────────
  const introPathFile = path.join(demoDir, 'intro-path.txt');
  const outroPathFile = path.join(demoDir, 'outro-path.txt');
  let currentInput = tempRawOut;

  function hasAudioStream(filePath: string): boolean {
    try {
      const result = execSync(
        `ffprobe -v error -select_streams a:0 -show_entries stream=codec_type -of csv=p=0 "${filePath}"`,
        { encoding: 'utf8', timeout: 5000, stdio: ['pipe', 'pipe', 'ignore'] }
      ).trim();
      return result === 'audio';
    } catch { return false; }
  }

  function getVideoDuration(filePath: string): number {
    try {
      const result = execSync(
        `ffprobe -v error -show_entries format=duration -of csv=p=0 "${filePath}"`,
        { encoding: 'utf8', timeout: 5000, stdio: ['pipe', 'pipe', 'ignore'] }
      ).trim();
      return parseFloat(result) || 0;
    } catch { return 0; }
  }

  async function concatClips(inputA: string, inputB: string, outputPath: string, label: string): Promise<void> {
    console.log(`🎬 Stitching ${label}...`);
    const aAudio = hasAudioStream(inputA);
    const bAudio = hasAudioStream(inputB);
    const aDur = getVideoDuration(inputA);
    const bDur = getVideoDuration(inputB);
    const clipFilter =
      '[0:v]fps=30,format=yuv420p[av];' +
      (aAudio ? '[0:a]aresample=48000[aa];' : `anullsrc=channel_layout=stereo:sample_rate=48000:duration=${aDur.toFixed(1)}[aa];`) +
      '[1:v]fps=30,format=yuv420p[bv];' +
      (bAudio ? '[1:a]aresample=48000[ba];' : `anullsrc=channel_layout=stereo:sample_rate=48000:duration=${bDur.toFixed(1)}[ba];`) +
      `[av][aa][bv][ba]concat=n=2:v=1:a=1${hasVaapi ? '[v_concat][aout];[v_concat]format=nv12,hwupload[vout]' : '[vout][aout]'}`;

    await new Promise<void>((resolve, reject) => {
      const hangGuard = setTimeout(() => reject(new Error(`[pass4-ffmpeg] ${label} stitch timed out after 3 min`)), 3 * 60 * 1000);
      const cmd = ffmpeg().input(inputA).input(inputB);
      if (hasVaapi) cmd.addOption('-vaapi_device', '/dev/dri/renderD128');
      cmd
        .outputOptions([
          '-filter_complex', clipFilter,
          '-map', '[vout]',
          '-map', '[aout]',
          ...hwOutputOpts,
          '-profile:v', 'high',
          '-level:v', '4.2',
          '-c:a', 'aac',
          '-movflags', '+faststart',
          '-metadata', `title=${config.outputPath ? path.basename(config.outputPath, '.mp4') : 'demo'}`,
        ])
        .save(outputPath)
        .on('start', (cmdLine) => console.log(`\n🚀 Spawned: ${cmdLine}`))
        .on('stderr', () => process.stdout.write('.'))
        .on('end', () => { clearTimeout(hangGuard); resolve(); })
        .on('error', (e: Error) => { clearTimeout(hangGuard); reject(e); });
    });
    console.log(`\n✅ ${label} stitched.`);
  }

  const hasIntro = fs.existsSync(introPathFile) && fs.existsSync(fs.readFileSync(introPathFile, 'utf8').trim());
  const hasOutro = fs.existsSync(outroPathFile) && fs.existsSync(fs.readFileSync(outroPathFile, 'utf8').trim());

  if (hasIntro && hasOutro) {
    // Two-step stitch: intro+main → temp, then +outro → final
    const tempStitched = finalOutput.replace('.mp4', '-stitched.mp4');
    await concatClips(fs.readFileSync(introPathFile, 'utf8').trim(), tempRawOut, tempStitched, 'intro');
    await concatClips(tempStitched, fs.readFileSync(outroPathFile, 'utf8').trim(), finalOutput, 'outro');
    if (fs.existsSync(tempStitched)) fs.unlinkSync(tempStitched);
    if (fs.existsSync(tempRawOut)) fs.unlinkSync(tempRawOut);
  } else if (hasIntro) {
    await concatClips(fs.readFileSync(introPathFile, 'utf8').trim(), tempRawOut, finalOutput, 'intro');
    if (fs.existsSync(tempRawOut)) fs.unlinkSync(tempRawOut);
  } else if (hasOutro) {
    await concatClips(tempRawOut, fs.readFileSync(outroPathFile, 'utf8').trim(), finalOutput, 'outro');
    if (fs.existsSync(tempRawOut)) fs.unlinkSync(tempRawOut);
  } else {
    fs.renameSync(tempRawOut, finalOutput);
  }

  console.log(`✨ Done! Final video: ${finalOutput}`);
}
