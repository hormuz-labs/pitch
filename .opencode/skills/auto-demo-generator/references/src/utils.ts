import { WavConversionOptions, TrackingEvent, DemoStep } from './types';
import fs from 'fs';
import os from 'os';

export function parseMimeType(mimeType: string): WavConversionOptions {
  const [fileType, ...params] = mimeType.split(';').map(s => s.trim());
  const [_, format] = fileType.split('/');
  const options: Partial<WavConversionOptions> = { numChannels: 1, sampleRate: 24000, bitsPerSample: 16 };
  if (format && format.toLowerCase().startsWith('l')) {
    const bits = parseInt(format.slice(1), 10);
    if (!isNaN(bits)) options.bitsPerSample = bits;
  }
  for (const param of params) {
    const [key, value] = param.split('=').map(s => s.trim());
    if (key === 'rate') options.sampleRate = parseInt(value, 10);
  }
  return options as WavConversionOptions;
}

export function createWavHeader(dataLength: number, options: WavConversionOptions) {
  const { numChannels, sampleRate, bitsPerSample } = options;
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const buffer = Buffer.alloc(44);
  buffer.write('RIFF', 0); buffer.writeUInt32LE(36 + dataLength, 4);
  buffer.write('WAVE', 8); buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16); buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(numChannels, 22); buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28); buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34); buffer.write('data', 36);
  buffer.writeUInt32LE(dataLength, 40);
  return buffer;
}

/**
 * Smoothstep easing — cubic hermite interpolation (3t²−2t³).
 * Produces natural acceleration → deceleration. Zero velocity at both endpoints.
 * @param evalVar  FFmpeg time variable: 't' (overlay/drawbox) or 'time' (zoompan)
 * @param prev        Starting value
 * @param target      Ending value
 * @param moveStart   Segment start in seconds
 * @param moveDuration Segment length in seconds
 */
export function smoothstepExpr(
  evalVar: 't' | 'time' | 'T',
  prev: number,
  target: number,
  moveStart: number,
  moveDuration: number
): string {
  const p = `min(1,max(0,(${evalVar}-${moveStart})/${moveDuration}))`;
  const s = `(3*${p}*${p}-2*${p}*${p}*${p})`;
  return `${prev}+(${target - prev})*${s}`;
}

/**
 * Spring overshoot — smoothstep to (target + overshoot) in the first 60% of
 * the window, then smoothstep back to (target) in the remaining 40%.
 * Only applied on zoom-in transitions for an elastic, premium feel.
 */
export function springOvershootExpr(
  evalVar: 'time',
  prev: number,
  target: number,
  overshoot: number,
  moveStart: number,
  moveDuration: number
): string {
  const midPoint = +(moveStart + moveDuration * 0.6).toFixed(4);
  const riseDur  = +(moveDuration * 0.6).toFixed(4);
  const fallDur  = +(moveDuration * 0.4).toFixed(4);
  const riseExpr = smoothstepExpr(evalVar, prev, target + overshoot, moveStart, riseDur);
  const fallExpr = smoothstepExpr(evalVar, target + overshoot, target, midPoint, fallDur);
  return `if(lt(${evalVar},${midPoint}),${riseExpr},${fallExpr})`;
}

type GpuVendor = 'amd' | 'nvidia' | 'apple' | 'windows' | 'none';

/**
 * Detects the GPU vendor/platform and returns the optimal Chromium launch
 * arguments for that hardware.
 *
 * Linux vendor detection:
 *   - /dev/dri present  → AMD / Intel (DRM device node)
 *   - /dev/nvidia0 present → Nvidia
 * macOS → Metal via ANGLE
 * Windows → D3D11 via ANGLE
 * No GPU detected → base stability flags only (software rasterisation)
 */
export function getChromiumGpuFlags(): string[] {
  // Base stability flags for Chromium in Docker / headless environments
  const flags = [
    '--disable-dev-shm-usage',
    '--no-sandbox',
  ];

  const vendor = detectGpuVendor();

  switch (vendor) {
    case 'amd':
      // AMD Linux: Vulkan is the best-supported ANGLE backend on RDNA hardware
      flags.push(
        '--use-gl=angle',
        '--use-angle=vulkan',
        '--enable-gpu-rasterization',
        '--enable-unsafe-webgpu',
        '--ignore-gpu-blocklist',
      );
      break;

    case 'nvidia':
      // Nvidia Linux: OpenGL ANGLE backend is more stable than Vulkan on Nvidia
      flags.push(
        '--use-gl=angle',
        '--use-angle=gl',
        '--enable-gpu-rasterization',
        '--enable-unsafe-webgpu',
        '--ignore-gpu-blocklist',
      );
      break;

    case 'apple':
      // macOS: Metal backend gives best performance on Apple Silicon / Intel Macs
      flags.push(
        '--use-gl=angle',
        '--use-angle=metal',
        '--enable-gpu-rasterization',
        '--ignore-gpu-blocklist',
      );
      break;

    case 'windows':
      // Windows: D3D11 is the most stable ANGLE backend
      flags.push(
        '--use-gl=angle',
        '--use-angle=d3d11',
        '--enable-gpu-rasterization',
        '--ignore-gpu-blocklist',
      );
      break;

    case 'none':
      // No GPU detected — let Chromium use software rasterisation
      break;
  }

  return flags;
}

/** @internal */
export function detectGpuVendor(): GpuVendor {
  const platform = os.platform();

  if (platform === 'darwin') return 'apple';
  if (platform === 'win32') return 'windows';

  if (platform === 'linux') {
    if (fs.existsSync('/dev/nvidia0')) return 'nvidia';
    if (fs.existsSync('/dev/dri'))     return 'amd';   // covers AMD + Intel DRM
  }

  return 'none';
}

export function getFFmpegHwAccelOptions(): { hasVaapi: boolean, hwFilterSuffix: string, hwOutputOpts: string[] } {
  const hasVaapi = fs.existsSync('/dev/dri/renderD128') && os.platform() === 'linux';
  const hasVideotoolbox = os.platform() === 'darwin';

  let hwFilterSuffix = '';
  let hwOutputOpts = ['-c:v', 'libx264', '-crf', '18', '-preset', 'medium', '-pix_fmt', 'yuv420p'];

  if (hasVaapi) {
    hwFilterSuffix = ',format=nv12,hwupload';
    hwOutputOpts = ['-c:v', 'h264_vaapi', '-qp', '18'];
  } else if (hasVideotoolbox) {
    hwFilterSuffix = ',format=yuv420p';
    // Videotoolbox uses -q:v for quality (~65 is visually lossless)
    hwOutputOpts = ['-c:v', 'h264_videotoolbox', '-q:v', '65', '-pix_fmt', 'yuv420p'];
  }

  return { hasVaapi, hwFilterSuffix, hwOutputOpts };
}

export interface CursorAnimationExprs {
  overlayXExpr: string;
  overlayYExpr: string;
  zoomZExpr: string;
  panXExpr: string;
  panYExpr: string;
}

/**
 * Builds FFmpeg expression strings for cursor overlay position, zoom, and pan
 * by iterating over the sorted tracking events.
 *
 * @param trackingEvents  Sorted array of tracking events (scroll events included)
 * @param videoWidth      Width of the output video in pixels
 * @param videoHeight     Height of the output video in pixels
 */
export function buildCursorAnimationExprs(
  trackingEvents: TrackingEvent[],
  videoWidth: number,
  videoHeight: number
): CursorAnimationExprs {
  const CENTER_X = videoWidth / 2;
  const CENTER_Y = videoHeight / 2;

  let overlayXExpr = `${CENTER_X}`;
  let overlayYExpr = `${CENTER_Y}`;
  let zoomZExpr = "1";
  let panXExpr = "0";
  let panYExpr = "0";

  let prevCx = CENTER_X;
  let prevCy = CENTER_Y;
  let prevZoom = 1;
  let runningPanX = 0;
  let runningPanY = 0;
  let prevTime = 0;

  const sortedEvents = [...trackingEvents].sort((a, b) => a.actionTime - b.actionTime);

  for (let i = 0; i < sortedEvents.length; i++) {
    const ev = sortedEvents[i];
    const tTime = ev.actionTime;
    let moveDuration = 1.0;
    let moveStart = Math.max(prevTime, tTime - moveDuration);
    
    // Adjust duration if moveStart was clamped
    if (moveStart > tTime - moveDuration) {
      moveDuration = Math.max(0.01, tTime - moveStart);
    }

    // ── Scroll events: only update camera pan, no cursor/zoom change ──────────
    if (ev.action === 'scroll') {
      if (prevZoom <= 1.0) {
        prevTime = tTime;
        continue; // Skip scroll pan when not zoomed
      }

      const scrolledY = ev.scrollY ?? 0;
      const targetScrollPanY = Math.min(Math.max(0, scrolledY - CENTER_Y / prevZoom), videoHeight - videoHeight / prevZoom);
      panYExpr = `if(between(time,${moveStart},${tTime}),${smoothstepExpr('time', runningPanY, targetScrollPanY, moveStart, moveDuration)},if(gt(time,${tTime}),${targetScrollPanY},${panYExpr}))`;
      runningPanY = targetScrollPanY;
      prevTime = tTime;
      continue; // skip cursor and zoom update for scroll-only events
    }

    const targetZoom = (ev.action === 'wait' || ev.action === 'navigate') ? 1.0 : 1.2;

    // ── Cursor overlay (smoothstep easing, evaluates 't') ────────────────────
    overlayXExpr = `if(between(t,${moveStart},${tTime}),${smoothstepExpr('t', prevCx, ev.cx, moveStart, moveDuration)},if(gt(t,${tTime}),${ev.cx},${overlayXExpr}))`;
    overlayYExpr = `if(between(t,${moveStart},${tTime}),${smoothstepExpr('t', prevCy, ev.cy, moveStart, moveDuration)},if(gt(t,${tTime}),${ev.cy},${overlayYExpr}))`;

    // ── Zoom (spring overshoot on zoom-in, plain smoothstep on zoom-out) ─────
    const OVERSHOOT_FRACTION = 0.1; // 10% of the zoom delta
    const overshootAmt = targetZoom > prevZoom
      ? (targetZoom - prevZoom) * OVERSHOOT_FRACTION
      : 0;
    const zoomInterp = (targetZoom !== prevZoom)
      ? (targetZoom > prevZoom 
          ? springOvershootExpr('time', prevZoom, targetZoom, overshootAmt, moveStart, moveDuration)
          : smoothstepExpr('time', prevZoom, targetZoom, moveStart, moveDuration))
      : `${targetZoom}`;
    zoomZExpr = `if(between(time,${moveStart},${tTime}),${zoomInterp},if(gt(time,${tTime}),${targetZoom},${zoomZExpr}))`;

    // ── Pan (smoothstep easing, evaluates 'time') ────────────────────────────
    const targetPanX = Math.min(Math.max(0, ev.cx - videoWidth / (2 * targetZoom)), videoWidth - videoWidth / targetZoom);
    const targetPanY = Math.min(Math.max(0, ev.cy - videoHeight / (2 * targetZoom)), videoHeight - videoHeight / targetZoom);

    panXExpr = `if(between(time,${moveStart},${tTime}),${smoothstepExpr('time', runningPanX, targetPanX, moveStart, moveDuration)},if(gt(time,${tTime}),${targetPanX},${panXExpr}))`;
    panYExpr = `if(between(time,${moveStart},${tTime}),${smoothstepExpr('time', runningPanY, targetPanY, moveStart, moveDuration)},if(gt(time,${tTime}),${targetPanY},${panYExpr}))`;

    prevCx = ev.cx;
    prevCy = ev.cy;
    prevZoom = targetZoom;
    runningPanX = targetPanX;
    runningPanY = targetPanY;
    prevTime = tTime;
  }

  // Ensure zoom doesn't break if no events exist
  if (trackingEvents.length === 0) {
    zoomZExpr = "1";
    panXExpr = "0";
    panYExpr = "0";
  }

  return { overlayXExpr, overlayYExpr, zoomZExpr, panXExpr, panYExpr };
}

/**
 * Builds an FFmpeg geq alpha expression that fades the cursor out when idle
 * for more than PARK_GAP_MIN seconds and fades it back in before the next action.
 *
 * @param trackingEvents  All tracking events (scroll events are excluded internally)
 */
export function buildCursorAlphaExpr(trackingEvents: TrackingEvent[]): string {
  const FADE_OUT_DUR = 0.4;
  const FADE_IN_DUR  = 1.0;
  const PARK_GAP_MIN = 4.0;

  let cursorAlphaExpr = "1";

  const activeEvents = [...trackingEvents]
    .sort((a, b) => a.actionTime - b.actionTime)
    .filter(e => e.action !== 'scroll' && e.action !== 'navigate');
  for (let i = 0; i < activeEvents.length; i++) {
    const ev   = activeEvents[i];
    const next = activeEvents[i + 1];

    const fadeOutStart = ev.actionTime + PARK_GAP_MIN;
    const fadeOutEnd   = fadeOutStart + FADE_OUT_DUR;
    // Fade in ends 1s before next move starts.
    // BUG FIX: when there is no next event (last action), the old code set
    // fadeInEnd = fadeOutEnd + 100 — a timestamp 100s beyond the video end.
    // zoompan/geq would then try to process frames up to that phantom time,
    // hanging FFmpeg indefinitely. For the last event we only fade out; no fade-in.
    if (!next) {
      const fadeOut = smoothstepExpr('T', 1, 0, fadeOutStart, FADE_OUT_DUR);
      cursorAlphaExpr = `if(between(T,${fadeOutStart},${fadeOutEnd}),${fadeOut},if(gt(T,${fadeOutEnd}),0,${cursorAlphaExpr}))`;
      continue;
    }

    const fadeInEnd   = next.actionTime - 1.0;
    const fadeInStart = fadeInEnd - FADE_IN_DUR;

    // Only apply if the gap between fade out and fade in is large enough
    if (fadeInStart - fadeOutEnd < 0.5) continue;

    const fadeOut = smoothstepExpr('T', 1, 0, fadeOutStart, FADE_OUT_DUR);
    const fadeIn  = smoothstepExpr('T', 0, 1, fadeInStart, FADE_IN_DUR);

    cursorAlphaExpr = `if(between(T,${fadeOutStart},${fadeOutEnd}),${fadeOut},if(between(T,${fadeOutEnd},${fadeInStart}),0,if(between(T,${fadeInStart},${fadeInEnd}),${fadeIn},${cursorAlphaExpr})))`;
  }

  return cursorAlphaExpr;
}

/**
 * Builds an FFmpeg expression that scales the cursor down and back up on click.
 *
 * @param trackingEvents  All tracking events (non-click events are ignored)
 * @param timeline        The timeline map (step.id → time in s or ms)
 */
export function buildCursorScaleExpr(
  trackingEvents: TrackingEvent[],
  timeline: Record<string, number>
): string {
  const clickEvents = trackingEvents.filter(e => e.action === 'click');
  if (clickEvents.length === 0) return "1";

  let scaleExpr = "1";

  for (const ev of clickEvents) {
    // Use the actual execution time from the timeline
    const T0 = +(timeline[ev.id] > 1000 ? timeline[ev.id] / 1000 : timeline[ev.id]).toFixed(4);
    
    // Natural shrink and expand
    const shrinkDur = 0.05;
    const expandDur = 0.15;
    const minScale = 0.7; // Shrink to 70%

    const shrinkExpr = smoothstepExpr('t', 1.0, minScale, T0, shrinkDur);
    const expandExpr = smoothstepExpr('t', minScale, 1.0, T0 + shrinkDur, expandDur);
    
    scaleExpr = `if(between(t,${T0},${+(T0 + shrinkDur).toFixed(4)}),${shrinkExpr},if(between(t,${+(T0 + shrinkDur).toFixed(4)},${+(T0 + shrinkDur + expandDur).toFixed(4)}),${expandExpr},${scaleExpr}))`;
  }

  return scaleExpr;
}

export interface FilterStringOptions {
  trimSeconds: string;
  cursorScaleExpr: string;
  cursorPngExists: boolean;
  cursorAlphaExpr: string;
  overlayXExpr: string;
  overlayYExpr: string;
  zoomZExpr: string;
  panXExpr: string;
  panYExpr: string;
  hwFilterSuffix: string;
  videoWidth: number;
  videoHeight: number;
  demoSteps: DemoStep[];
  timeline: Record<string, number>;
  /**
   * The original LLM-predicted timeline (seconds), captured in pass3 before wall-clock
   * execution times overwrote it. SFX adelay must be computed from this, not from
   * the mutated `timeline`, so that click/keyboard sounds fire in sync with the
   * voiceover narration rather than at the moment of actual DOM execution. Using the
   * mutated times would cause SFX to drift progressively later on long videos as each
   * step's real execution overruns its scheduled narration window.
   */
  originalTimeline: Record<string, number>;
}

/**
 * Constructs the full FFmpeg filter_complex string (video + audio mix) for
 * the cinematic post-processing pass.
 *
 * Returns the filter string and the index of the first SFX input so the
 * caller can attach the correct number of audio inputs to the ffmpeg command.
 *
 * @returns { filterString, sfxStartIndex, inputCount }
 */
export function buildFilterString(opts: FilterStringOptions): {
  filterString: string;
  sfxStartIndex: number;
  inputCount: number;
  mixInputs: string;
} {
  const {
    trimSeconds, cursorScaleExpr, cursorPngExists,
    cursorAlphaExpr, overlayXExpr, overlayYExpr,
    zoomZExpr, panXExpr, panYExpr, hwFilterSuffix,
    videoWidth, videoHeight, demoSteps, timeline, originalTimeline,
  } = opts;

  // ── Construct Filtergraph ──────────────────────────────────────────────────
  // Z-order: raw_video → [cursor overlay] → [zoompan] → [vout]
  // Cursor geq operates on the tiny 48×48 cursor PNG.
  let filterString = `[0:v]trim=start=${trimSeconds},setpts=PTS-STARTPTS,fps=30[vfps];`;

  if (cursorPngExists) {
    filterString += `[1:v]format=rgba,geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='alpha(X,Y)*(${cursorAlphaExpr})'[cur_alpha];`;
    filterString += `[cur_alpha]scale=w='iw*(${cursorScaleExpr})':h='ih*(${cursorScaleExpr})':eval=frame[cur];`;
    filterString += `[vfps][cur]overlay=x='${overlayXExpr}':y='${overlayYExpr}':eval=frame:shortest=1[withcursor];`;
    filterString += `[withcursor]zoompan=z='${zoomZExpr}':x='${panXExpr}':y='${panYExpr}':d=1:s=${videoWidth}x${videoHeight}:fps=30${hwFilterSuffix}[vout];`;
  } else {
    filterString += `[vfps]zoompan=z='${zoomZExpr}':x='${panXExpr}':y='${panYExpr}':d=1:s=${videoWidth}x${videoHeight}:fps=30${hwFilterSuffix}[vout];`;
  }

  // Audio Mix
  let mixInputs = '';
  let inputCount = 0;

  // Voiceover track (input index depends on whether cursor PNG was added as input)
  const voInputIdx = cursorPngExists ? 2 : 1;
  filterString += `[${voInputIdx}:a]apad=pad_dur=2[voicepad];`;
  mixInputs += `[voicepad]`;
  inputCount++;

  // SFX tracks start after the voiceover input
  const sfxStartIndex = voInputIdx + 1;
  let sfxIndex = sfxStartIndex;

  for (const step of demoSteps) {
    // Use the original LLM-predicted time for SFX adelay so click/keyboard sounds
    // fire in sync with the narration. The mutated `timeline` values reflect actual
    // wall-clock execution and would cause cumulative drift on long videos.
    let tTime = originalTimeline[step.id];
    if (tTime === undefined) tTime = timeline[step.id]; // fallback for wait steps (never mutated)
    if (tTime > 1000) tTime = tTime / 1000; // normalize ms → s (defensive)

    if (step.action === 'click') {
      const delayMs = Math.floor(tTime * 1000); // SFX timing locked to voiceover narration
      filterString += `[${sfxIndex}:a]adelay=${delayMs}|${delayMs}[sfx${sfxIndex}];`;
      mixInputs += `[sfx${sfxIndex}]`;
      sfxIndex++;
      inputCount++;
    } else if (step.action === 'type') {
      const delayMs = Math.floor(tTime * 1000);
      // Calculate exact typing duration: 80ms per character
      const typeDuration = ((step.value?.length || 10) * 0.08).toFixed(2);
      filterString += `[${sfxIndex}:a]atrim=0:${typeDuration},asetpts=PTS-STARTPTS,adelay=${delayMs}|${delayMs}[sfx${sfxIndex}];`;
      mixInputs += `[sfx${sfxIndex}]`;
      sfxIndex++;
      inputCount++;
    }
  }

  filterString += `${mixInputs}amix=inputs=${inputCount}:duration=first:normalize=0[aout]`;

  return { filterString, sfxStartIndex, inputCount, mixInputs };
}
