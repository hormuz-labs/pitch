/** Selects the fastest working H.264 encoder for the current host. */
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export type VideoEncoderKind = 'videotoolbox' | 'nvenc' | 'vaapi' | 'cpu'

export interface EncodeOpts {
  /** Constant-quality target (~CRF scale). Lower = higher quality/bigger. */
  quality?: number
  /** libx264 preset used on the CPU fallback path. */
  cpuPreset?: string
}

export interface VideoEncodePlan {
  kind: VideoEncoderKind
  label: string
  /** FFmpeg arguments that must appear before the inputs. */
  inputArgs: string
  /** Software filter appended before a VAAPI encoder consumes the frames. */
  uploadFilter: string | null
  /** FFmpeg video codec and quality arguments. */
  outputArgs: string
}

let encoderProbe: Promise<VideoEncoderKind> | null = null

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, Math.round(value)))

function vaapiDevice(): string {
  const configured = process.env.FFMPEG_VAAPI_DEVICE
  return configured && /^\/[\w./-]+$/.test(configured) ? configured : '/dev/dri/renderD128'
}

/** Candidate order is platform-specific; unsupported hardware always falls back to x264. */
export function encoderCandidates(
  platform: NodeJS.Platform = process.platform,
): VideoEncoderKind[] {
  if (platform === 'darwin') return ['videotoolbox', 'cpu']
  if (platform === 'linux') return ['nvenc', 'vaapi', 'cpu']
  return ['cpu']
}

function configuredCandidates(): VideoEncoderKind[] {
  const configured = process.env.FFMPEG_ENCODER?.toLowerCase()
  if (!configured || configured === 'auto') return encoderCandidates()
  if (configured === 'cpu') return ['cpu']
  if (configured === 'videotoolbox' || configured === 'nvenc' || configured === 'vaapi') {
    return [configured, 'cpu']
  }
  console.warn(`Unknown FFMPEG_ENCODER=${configured}; using automatic detection`)
  return encoderCandidates()
}

async function probeEncoder(kind: Exclude<VideoEncoderKind, 'cpu'>): Promise<boolean> {
  const common = [
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-f',
    'lavfi',
    '-i',
    'color=c=black:s=128x128:r=5:d=0.2',
    '-an',
  ]
  let args: string[]

  if (kind === 'videotoolbox') {
    args = [
      ...common,
      '-c:v',
      'h264_videotoolbox',
      '-profile:v',
      'high',
      '-realtime',
      '0',
      '-q:v',
      '60',
      '-pix_fmt',
      'yuv420p',
      '-f',
      'null',
      '-',
    ]
  } else if (kind === 'nvenc') {
    args = [...common, '-c:v', 'h264_nvenc', '-f', 'null', '-']
  } else {
    args = [
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-init_hw_device',
      `vaapi=va:${vaapiDevice()}`,
      '-filter_hw_device',
      'va',
      '-f',
      'lavfi',
      '-i',
      'color=c=black:s=128x128:r=5:d=0.2',
      '-vf',
      'format=nv12,hwupload',
      '-an',
      '-c:v',
      'h264_vaapi',
      '-rc_mode',
      'CQP',
      '-qp',
      '20',
      '-f',
      'null',
      '-',
    ]
  }

  try {
    await execFileAsync('ffmpeg', args, { timeout: 15_000 })
    return true
  } catch {
    return false
  }
}

async function detectVideoEncoder(): Promise<VideoEncoderKind> {
  for (const kind of configuredCandidates()) {
    if (kind === 'cpu' || (await probeEncoder(kind))) return kind
  }
  return 'cpu'
}

export function createVideoEncodePlan(
  kind: VideoEncoderKind,
  opts: EncodeOpts = {},
): VideoEncodePlan {
  const quality = clamp(opts.quality ?? 20, 0, 51)
  const cpuPreset = opts.cpuPreset ?? 'veryfast'

  if (kind === 'videotoolbox') {
    // VideoToolbox's quality scale runs in the opposite direction to CRF.
    const vtQuality = clamp(100 - quality * 2, 1, 100)
    return {
      kind,
      label: 'h264_videotoolbox (GPU)',
      inputArgs: '',
      uploadFilter: null,
      outputArgs: `-c:v h264_videotoolbox -profile:v high -realtime 0 -q:v ${vtQuality} -pix_fmt yuv420p`,
    }
  }

  if (kind === 'nvenc') {
    return {
      kind,
      label: 'h264_nvenc (GPU)',
      inputArgs: '',
      uploadFilter: null,
      outputArgs: `-c:v h264_nvenc -preset p6 -rc vbr -cq ${quality} -b:v 0 -spatial-aq 1 -pix_fmt yuv420p`,
    }
  }

  if (kind === 'vaapi') {
    return {
      kind,
      label: 'h264_vaapi (GPU)',
      inputArgs: `-init_hw_device vaapi=va:${vaapiDevice()} -filter_hw_device va`,
      uploadFilter: 'format=nv12,hwupload',
      outputArgs: `-c:v h264_vaapi -profile:v high -rc_mode CQP -qp ${clamp(quality, 1, 51)}`,
    }
  }

  return {
    kind,
    label: 'libx264 (CPU)',
    inputArgs: '',
    uploadFilter: null,
    outputArgs: `-c:v libx264 -preset ${cpuPreset} -crf ${quality} -pix_fmt yuv420p`,
  }
}

/** Probe once per process, then return arguments for the selected encoder. */
export async function videoEncodePlan(opts: EncodeOpts = {}): Promise<VideoEncodePlan> {
  if (!encoderProbe) encoderProbe = detectVideoEncoder()
  return createVideoEncodePlan(await encoderProbe, opts)
}

/** Add the software-to-hardware upload at the end of an existing filter graph. */
export function appendEncoderFilter(
  graph: string,
  sourceLabel: string,
  plan: VideoEncodePlan,
  outputName = 'encodedv',
): { graph: string; outputLabel: string } {
  if (!plan.uploadFilter) return { graph, outputLabel: sourceLabel }
  const separator = graph && !graph.endsWith(';') ? ';' : ''
  return {
    graph: `${graph}${separator}${sourceLabel}${plan.uploadFilter}[${outputName}]`,
    outputLabel: `[${outputName}]`,
  }
}

/** Force/reset the cached backend in unit and integration tests. */
export function __setEncoderForTesting(value: VideoEncoderKind | null): void {
  encoderProbe = value === null ? null : Promise.resolve(value)
}
