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

/**
 * Automatically detects if the host has a hardware GPU exposed
 * and returns the optimal Chromium launch arguments.
 */
export function getChromiumGpuFlags(): string[] {
  const platform = os.platform();
  let hasGpu = false;

  if (platform === 'linux') {
    // Check for exposed GPU devices in Docker/Linux
    // /dev/dri for AMD/Intel, /dev/nvidia0 for Nvidia
    hasGpu = fs.existsSync('/dev/dri') || fs.existsSync('/dev/nvidia0');
  } else {
    // macOS / Windows natively handle GPU hardware well
    hasGpu = true;
  }

  // Base stability flags for Chromium in Docker
  const flags = [
    '--disable-dev-shm-usage',
    '--no-sandbox',
  ];

  if (hasGpu) {
    flags.push(
      '--use-gl=egl',
      '--enable-unsafe-webgpu',
      '--ignore-gpu-blocklist'
    );
  }

  return flags;
}
