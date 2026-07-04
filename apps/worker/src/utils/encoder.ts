/**
 * encoder.ts
 *
 * Picks the fastest available H.264 encoder at runtime:
 *   • NVIDIA NVENC (h264_nvenc) when a working GPU is present — much faster than
 *     CPU encoding.
 *   • libx264 with a fast preset otherwise (CI, the Docker worker with no GPU, or
 *     a host whose driver is broken/mismatched).
 *
 * Detection runs a tiny throwaway encode once and caches the result, so callers
 * can request encoder args freely without re-probing.
 */
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

let nvencProbe: Promise<boolean> | null = null

/** Probe (once) whether NVENC can actually initialise on this machine. */
export function nvencAvailable(): Promise<boolean> {
  if (!nvencProbe) {
    nvencProbe = execAsync(
      'ffmpeg -hide_banner -y -f lavfi -i color=c=black:s=64x64:r=5:d=0.2 ' +
        '-c:v h264_nvenc -f null -',
    )
      .then(() => true)
      .catch(() => false)
  }
  return nvencProbe
}

/** Force the cached probe result — used by tests. */
export function __setNvencForTesting(value: boolean | null): void {
  nvencProbe = value === null ? null : Promise.resolve(value)
}

export interface EncodeOpts {
  /** Constant-quality target (~CRF scale). Lower = higher quality/bigger. */
  quality?: number
  /** libx264 preset used on the CPU fallback path. */
  cpuPreset?: string
}

/**
 * Video-codec args for an ffmpeg command, GPU when available else CPU.
 * NVENC uses constant-quality VBR so `quality` maps roughly onto the CRF scale.
 */
export async function videoEncodeArgs(opts: EncodeOpts = {}): Promise<string> {
  const quality = opts.quality ?? 20
  const cpuPreset = opts.cpuPreset ?? 'veryfast'
  if (await nvencAvailable()) {
    // p6 + spatial AQ: NVENC's cq runs visibly softer than x264 CRF on text-heavy
    // UI captures; these claw back sharpness at negligible GPU-time cost.
    return `-c:v h264_nvenc -preset p6 -rc vbr -cq ${quality} -b:v 0 -spatial-aq 1 -pix_fmt yuv420p`
  }
  return `-c:v libx264 -preset ${cpuPreset} -crf ${quality} -pix_fmt yuv420p`
}
