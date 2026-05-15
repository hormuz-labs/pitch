import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs';
import path from 'path';
import { DemoConfig, DemoStep } from './types';
import {
  getFFmpegHwAccelOptions,
  buildCursorAnimationExprs,
  buildCursorAlphaExpr,
  buildRippleChain,
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
  const rippleChain = buildRippleChain(trackingEvents, timeline);

  const { filterString, sfxStartIndex } = buildFilterString({
    trimSeconds,
    rippleChain,
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
    ? path.resolve(demoDir, config.outputPath)
    : path.join(demoDir, 'demo-final.mp4');
  const tempRawOut = finalOutput.replace('.mp4', '-raw.mp4');

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
      .on('end', () => resolve())
      .on('error', reject);
  });

  // ── Stitch intro ───────────────────────────────────────────────────────────
  const introPathFile = path.join(demoDir, 'intro-path.txt');
  let hasStitched = false;

  if (fs.existsSync(introPathFile)) {
    const introVideo = fs.readFileSync(introPathFile, 'utf8').trim();
    if (fs.existsSync(introVideo)) {
      console.log('🎬 Stitching cinematic intro...');
      const stitchFilter =
        '[0:v]fps=30,format=yuv420p[iv];' +
        'anullsrc=channel_layout=stereo:sample_rate=48000:duration=3.5[ia];' +
        '[1:v]fps=30,format=yuv420p[mv];' +
        '[1:a]aresample=48000[ma];' +
        `[iv][ia][mv][ma]concat=n=2:v=1:a=1${hasVaapi ? '[v_concat][aout];[v_concat]format=nv12,hwupload[vout]' : '[vout][aout]'}`;

      await new Promise<void>((resolve, reject) => {
        const hangGuard = setTimeout(() => reject(new Error('[pass4-ffmpeg] Intro stitch timed out after 3 min')), 3 * 60 * 1000);
        const stitchCmd = ffmpeg().input(introVideo).input(tempRawOut);
        if (hasVaapi) stitchCmd.addOption('-vaapi_device', '/dev/dri/renderD128');
        stitchCmd
          .outputOptions([
            '-filter_complex', stitchFilter,
            '-map', '[vout]',
            '-map', '[aout]',
            ...hwOutputOpts,
            '-profile:v', 'high',
            '-level:v', '4.2',
            '-c:a', 'aac',
            '-movflags', '+faststart',
            '-metadata', `title=${config.outputPath ? path.basename(config.outputPath, '.mp4') : 'demo'}`,
          ])
          .save(finalOutput)
          .on('stderr', () => process.stdout.write('.'))
          .on('end', () => { clearTimeout(hangGuard); resolve(); })
          .on('error', (e: Error) => { clearTimeout(hangGuard); reject(e); });
      });

      console.log('\n✅ Intro stitched.');
      hasStitched = true;
      if (fs.existsSync(tempRawOut)) fs.unlinkSync(tempRawOut);
    }
  }

  if (!hasStitched) fs.renameSync(tempRawOut, finalOutput);

  console.log(`✨ Done! Final video: ${finalOutput}`);
}
