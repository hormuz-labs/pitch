import { execFile } from 'node:child_process'
import { constants, createWriteStream } from 'node:fs'
import { lstat, mkdir, open, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { promisify } from 'node:util'
import AdmZip from 'adm-zip'
import { type EditableFormat, type EditableManifest, projectFiles } from './editable-formats.js'

const exec = promisify(execFile)

export async function buildEditablePackage({
  workspaceDir,
  videoRel,
  outputDir,
  format,
  title,
  signal,
  marks,
}: {
  workspaceDir: string
  videoRel: string
  outputDir: string
  format: EditableFormat
  title: string
  signal?: AbortSignal
  marks?: Array<{ start: number; label?: string }>
}): Promise<{ file: string; manifest: EditableManifest }> {
  signal?.throwIfAborted()
  const snapshot = join(outputDir, 'source.snapshot')
  const mediaDir = join(outputDir, 'media')
  const file = join(outputDir, 'package.zip')
  const options = { signal, timeout: 120_000, maxBuffer: 8 * 1024 * 1024 }
  // Never let a media container open playlists, network URLs, or external MOV data references.
  const inputOptions = [
    '-protocol_whitelist',
    'file',
    '-format_whitelist',
    'mov,matroska,webm',
    '-enable_drefs',
    '0',
    '-err_detect',
    'explode',
  ]
  const run = async (binary: string, args: string[], maxBuffer = options.maxBuffer) => {
    const result = await exec(binary, args, { ...options, maxBuffer })
    if (result.stderr.trim())
      throw new Error(
        `Invalid or unsupported media (${binary}): ${result.stderr.trim().slice(0, 1000)}`,
      )
    return result.stdout
  }
  try {
    const workspace = await realpath(workspaceDir)
    if (!videoRel || isAbsolute(videoRel) || videoRel.split(/[\\/]/).includes('..')) {
      throw new Error(
        'Selected movie must be a relative path under the workspace; traversal is not allowed.',
      )
    }
    const source = resolve(workspace, videoRel)
    const resolved = await realpath(source)
    if (
      !relative(workspace, resolved) ||
      relative(workspace, resolved).startsWith('..') ||
      resolved !== source
    ) {
      throw new Error('Selected movie must be under the workspace without symlink components.')
    }
    const identity = await lstat(source, { bigint: true })
    if (!identity.isFile()) throw new Error('Selected movie must be a regular file.')
    const handle = await open(
      source,
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
    )
    try {
      const before = await handle.stat({ bigint: true })
      if (before.size === 0n || before.size > 128n * 1024n * 1024n) {
        throw new Error('Selected movie is empty or exceeds the 128 MiB input cap.')
      }
      if (
        !before.isFile() ||
        before.dev !== identity.dev ||
        before.ino !== identity.ino ||
        (await realpath(source)) !== resolved
      ) {
        throw new Error('Selected workspace file changed while opening its snapshot.')
      }
      await pipeline(
        handle.createReadStream({ autoClose: false, start: 0, end: Number(before.size) - 1 }),
        createWriteStream(snapshot, { flags: 'wx' }),
        { signal },
      )
      const after = await handle.stat({ bigint: true })
      const current = await lstat(source, { bigint: true })
      if (
        before.dev !== current.dev ||
        before.ino !== current.ino ||
        before.size !== after.size ||
        before.mtimeNs !== after.mtimeNs ||
        before.ctimeNs !== after.ctimeNs ||
        (await realpath(source)) !== resolved
      ) {
        throw new Error(
          'Selected workspace file changed while copying its snapshot; retry after rendering finishes.',
        )
      }
    } finally {
      await handle.close()
    }
    const stdout = await run('ffprobe', [
      '-v',
      'error',
      ...inputOptions,
      '-show_streams',
      '-show_format',
      '-of',
      'json',
      snapshot,
    ])
    const probe = JSON.parse(stdout)
    if (
      !Array.isArray(probe.streams) ||
      probe.streams.filter((stream: { codec_type: string }) => stream.codec_type === 'video')
        .length !== 1
    ) {
      throw new Error('Unsupported movie: exactly one video stream is required.')
    }
    const video = probe.streams.find(
      (stream: { codec_type: string }) => stream.codec_type === 'video',
    )
    if (!video || !['h264', 'hevc'].includes(video.codec_name)) {
      throw new Error(
        `Unsupported video codec ${video?.codec_name ?? 'missing'}; only H264 and HEVC can be losslessly packaged.`,
      )
    }
    if (
      ![video.width, video.height].every(
        value => Number.isInteger(value) && value > 0 && value <= 8192,
      )
    ) {
      throw new Error(
        'Invalid video dimensions: positive integer dimensions up to the 8192-pixel cap are required.',
      )
    }
    const duration = Number(video.duration ?? probe.format?.duration)
    if (!Number.isFinite(duration) || duration <= 0 || duration > 1800) {
      throw new Error(
        'Invalid video duration: a finite positive duration within the 30-minute cap is required.',
      )
    }
    if (
      (video.sample_aspect_ratio &&
        video.sample_aspect_ratio !== '1:1' &&
        video.sample_aspect_ratio !== 'N/A') ||
      (video.tags?.rotate && Number(video.tags.rotate) !== 0) ||
      video.side_data_list?.some((data: { side_data_type: string }) =>
        /display matrix/i.test(data.side_data_type),
      ) ||
      (video.field_order && !['progressive', 'unknown'].includes(video.field_order))
    ) {
      throw new Error(
        'Unsupported display geometry or rotation: only square-pixel, unrotated progressive video is supported; appearance will not be silently altered.',
      )
    }
    if (
      ['smpte2084', 'arib-std-b67'].includes(video.color_transfer) ||
      video.color_primaries === 'bt2020' ||
      video.side_data_list?.some((data: { side_data_type: string }) =>
        /mastering|content light|dovi|hdr/i.test(data.side_data_type),
      )
    ) {
      throw new Error(
        'Unsupported HDR video: export an SDR movie explicitly; this packager will not tone-map it.',
      )
    }
    const [num, den] = String(video.r_frame_rate).split('/').map(Number)
    const [avgNum, avgDen] = String(video.avg_frame_rate).split('/').map(Number)
    if (
      ![num, den, avgNum, avgDen].every(value => Number.isSafeInteger(value) && value > 0) ||
      num / den > 120
    ) {
      throw new Error(
        'Invalid video FPS: finite positive rational rates up to 120 FPS are supported.',
      )
    }
    if (Math.abs(num / den - avgNum / avgDen) > 0.00001) {
      throw new Error(
        'Unsupported VFR video: nominal and average frame rates differ; only CFR is supported.',
      )
    }
    // Rate metadata alone can hide alternating frame durations. Verify every decoded timestamp.
    const timing = JSON.parse(
      await run(
        'ffprobe',
        [
          '-v',
          'error',
          ...inputOptions,
          '-select_streams',
          'v:0',
          '-count_frames',
          '-show_frames',
          '-show_entries',
          'frame=best_effort_timestamp_time:stream=nb_read_frames',
          '-of',
          'json',
          snapshot,
        ],
        64 * 1024 * 1024,
      ),
    )
    const frames = Number(timing.streams[0].nb_read_frames)
    if (!Number.isSafeInteger(frames) || frames <= 0 || (frames * den) / num > 1800) {
      throw new Error('Invalid decoded frame count or duration exceeds the 30-minute cap.')
    }
    const first = Number(timing.frames[0]?.best_effort_timestamp_time)
    const origin = Number(probe.format?.start_time)
    if (!Number.isFinite(first) || !Number.isFinite(origin) || Math.abs(first - origin) > 0.00001) {
      throw new Error(
        'Unsupported video start time: picture must begin at the container origin to preserve soundtrack synchronization.',
      )
    }
    if (
      timing.frames.length !== frames ||
      timing.frames.some(
        (frame: { best_effort_timestamp_time: string }, i: number) =>
          !Number.isFinite(Number(frame.best_effort_timestamp_time)) ||
          Math.abs(Number(frame.best_effort_timestamp_time) - first - (i * den) / num) > 0.00001,
      )
    ) {
      throw new Error(
        'Unsupported variable frame timing (VFR); only CFR video can be packaged without changing timing.',
      )
    }
    if (format === 'after-effects' && (num / den < 1 || num / den > 99)) {
      throw new Error('After Effects editable exports require a frame rate from 1 through 99 FPS.')
    }
    const audio = probe.streams.find(
      (stream: { codec_type: string }) => stream.codec_type === 'audio',
    )
    if (
      probe.streams.filter((stream: { codec_type: string }) => stream.codec_type === 'audio')
        .length > 1 ||
      (audio && (!Number.isInteger(audio.channels) || audio.channels < 1 || audio.channels > 2))
    ) {
      throw new Error(
        'Unsupported audio streams/channels: at most 1 audio stream with 1 or 2 channels is supported; no automatic selection or downmix.',
      )
    }
    const sampleRate = Number(audio?.sample_rate)
    if (audio && (!Number.isSafeInteger(sampleRate) || sampleRate <= 0 || sampleRate > 192000)) {
      throw new Error(
        'Invalid audio sample rate: positive integer rates up to 192000 Hz are supported.',
      )
    }
    await mkdir(mediaDir)
    await run('ffmpeg', [
      '-v',
      'error',
      '-xerror',
      '-nostdin',
      '-y',
      ...inputOptions,
      '-i',
      snapshot,
      '-map',
      '0:v:0',
      '-c:v',
      'copy',
      '-movflags',
      '+faststart',
      join(mediaDir, 'video.mp4'),
    ])
    const movieBytes = (await stat(join(mediaDir, 'video.mp4'))).size
    const mediaCap = 192 * 1024 * 1024
    if (
      movieBytes +
        (audio ? Math.ceil(((frames * den) / num) * sampleRate) * audio.channels * 3 + 4096 : 0) >
      mediaCap
    ) {
      throw new Error(
        'Combined archive media exceeds the 192 MiB cap (including uncompressed PCM audio).',
      )
    }
    if (audio) {
      await run('ffmpeg', [
        '-v',
        'error',
        '-xerror',
        '-nostdin',
        '-y',
        '-copyts',
        '-start_at_zero',
        ...inputOptions,
        '-i',
        snapshot,
        '-map',
        '0:a:0',
        '-af',
        'aresample=async=1:first_pts=0',
        '-t',
        String((frames * den) / num),
        '-c:a',
        'pcm_s24le',
        '-fs',
        String(mediaCap - movieBytes + 1),
        join(mediaDir, 'soundtrack.wav'),
      ])
      if (movieBytes + (await stat(join(mediaDir, 'soundtrack.wav'))).size > mediaCap) {
        throw new Error('Combined archive media exceeds the 192 MiB cap.')
      }
    }
    const boundaries = new Map<number, string>()
    for (const mark of marks ?? []) {
      if (!Number.isFinite(mark.start)) continue
      const frame = Math.max(0, Math.min(frames, Math.round((mark.start * num) / den)))
      if (!boundaries.has(frame)) boundaries.set(frame, (mark.label?.trim() || title).slice(0, 200))
    }
    if (!boundaries.has(0)) boundaries.set(0, title.slice(0, 200))
    boundaries.set(frames, '')
    const points = [...boundaries.keys()].sort((a, b) => a - b)
    const cuts = points
      .slice(0, -1)
      .map((start, i) => ({ label: boundaries.get(start)!, start, end: points[i + 1] }))
    const manifest: EditableManifest = {
      version: 1,
      title,
      video: {
        file: 'media/video.mp4',
        width: video.width,
        height: video.height,
        fps: { num, den },
        frames,
      },
      audio: audio
        ? {
            file: 'media/soundtrack.wav',
            channels: audio.channels,
            sampleRate: Number(audio.sample_rate),
          }
        : null,
      cuts,
      warnings: [
        ...(cuts.length === 1
          ? ['No internal boundaries supplied: exported as a single clip.']
          : []),
        'Marks may be beat boundaries rather than visual scene changes; normalized to frame boundaries.',
        'The selected movie is losslessly remuxed to MP4, not an original-container copy.',
        'Extra original sources and assets are not included. Only the selected movie is collected.',
        'Baked visuals only: no native layers. Unsupported codecs, VFR, display geometry and HDR are rejected rather than silently converted.',
      ],
    }
    const zip = new AdmZip()
    zip.addFile(manifest.video.file, await readFile(join(mediaDir, 'video.mp4')))
    if (manifest.audio)
      zip.addFile(manifest.audio.file, await readFile(join(mediaDir, 'soundtrack.wav')))
    zip.addFile('manifest.json', Buffer.from(JSON.stringify(manifest, null, 2)))
    for (const [name, content] of Object.entries(projectFiles(format, manifest))) {
      zip.addFile(name, Buffer.from(content))
    }
    signal?.throwIfAborted()
    const archive = await zip.toBufferPromise()
    signal?.throwIfAborted()
    await writeFile(file, archive, { signal })
    signal?.throwIfAborted()
    return { file, manifest }
  } catch (error) {
    await rm(file, { force: true })
    throw error
  } finally {
    await rm(snapshot, { force: true })
    await rm(mediaDir, { recursive: true, force: true })
  }
}
