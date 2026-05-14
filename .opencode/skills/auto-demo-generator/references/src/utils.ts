import { WavConversionOptions } from './types';
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
