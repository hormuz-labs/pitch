import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  mkdir,
  mkdtemp,
  open,
  readdir,
  readFile,
  rm,
  stat,
  symlink,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import AdmZip from 'adm-zip'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { buildEditablePackage } from '../apps/api/src/projects/editable-package.js'

const exec = promisify(execFile)
let root: string
let workspaceDir: string
let outputDir: string

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'editable-package-'))
  workspaceDir = join(root, 'workspace')
  outputDir = join(root, 'output')
  await mkdir(workspaceDir)
  await mkdir(outputDir)
})
afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

async function movie(name = 'selected.mov', extra: string[] = [], rate = '30', frames = 30) {
  const file = join(workspaceDir, name)
  await exec('ffmpeg', [
    '-v',
    'error',
    '-y',
    '-f',
    'lavfi',
    '-i',
    `testsrc2=size=64x48:rate=${rate}`,
    ...extra,
    '-frames:v',
    String(frames),
    '-c:v',
    'libx264',
    '-threads',
    '1',
    file,
  ])
  return file
}

async function pixels(file: string) {
  return (
    await exec('ffmpeg', [
      '-v',
      'error',
      '-i',
      file,
      '-map',
      '0:v:0',
      '-f',
      'hash',
      '-hash',
      'sha256',
      '-',
    ])
  ).stdout
}

async function sha256(file: string) {
  return createHash('sha256')
    .update(await readFile(file))
    .digest('hex')
}

it('packages only the selected silent movie with exact frames and losslessly remuxed pixels', async () => {
  const source = await movie()
  await writeFile(join(workspaceDir, 'secret.txt'), 'not collected')
  const result = await buildEditablePackage({
    workspaceDir,
    outputDir,
    videoRel: 'selected.mov',
    format: 'premiere',
    title: 'My film',
  })
  expect(result.file).toBe(join(outputDir, 'package.zip'))
  const zip = new AdmZip(await readFile(result.file))
  expect(
    zip
      .getEntries()
      .map(entry => entry.entryName)
      .sort(),
  ).toEqual(['README.txt', 'manifest.json', 'media/video.mp4', 'project.xml'])
  expect(JSON.parse(zip.readAsText('manifest.json'))).toEqual(result.manifest)
  expect(result.manifest).toMatchObject({
    version: 1,
    title: 'My film',
    audio: null,
    video: { file: 'media/video.mp4', width: 64, height: 48, fps: { num: 30, den: 1 }, frames: 30 },
    cuts: [{ label: 'My film', start: 0, end: 30 }],
  })
  const packaged = join(root, 'packaged.mp4')
  await writeFile(packaged, zip.readFile('media/video.mp4')!)
  expect(await pixels(packaged)).toBe(await pixels(source))
  expect(zip.readAsText('project.xml')).toContain('<duration>30</duration>')
  const readme = zip.readAsText('README.txt')
  expect(readme).toMatch(/single clip/i)
  expect(readme).toMatch(/remux/i)
  expect(readme).toMatch(/original sources.*not included/i)
})

it('collects validated AE native image assets and rewrites their manifest paths', async () => {
  const source = await movie()
  const sourceIdentity = await stat(source)
  await mkdir(join(workspaceDir, 'uploads'))
  const imageBytes = Buffer.from('image bytes')
  await writeFile(join(workspaceDir, 'uploads', 'product.webp'), imageBytes)
  const { file, manifest } = await buildEditablePackage({
    workspaceDir,
    outputDir,
    videoRel: 'selected.mov',
    format: 'after-effects',
    title: 'Native',
    nativeLayers: {
      version: 1,
      stage: { width: 128, height: 96 },
      fps: 30,
      frames: 30,
      sourceBytes: sourceIdentity.size,
      sourceMtimeMs: sourceIdentity.mtimeMs,
      sourceSha256: await sha256(source),
      layers: [
        {
          id: 'image-1',
          name: 'Product',
          shotId: 'hero',
          kind: 'image',
          asset: 'uploads/product.webp',
          assetSha256: createHash('sha256').update(imageBytes).digest('hex'),
          box: { width: 32, height: 24 },
          inFrame: 0,
          outFrame: 30,
          keys: {
            position: [[0, 64, 48]],
            scale: [[0, 100, 100]],
            rotation: [[0, 0]],
            opacity: [[0, 100]],
          },
          warnings: [],
        },
      ],
      warnings: [],
    },
  })

  expect(manifest.native?.layers[0]).toMatchObject({ asset: 'assets/product.webp' })
  const zip = new AdmZip(await readFile(file))
  expect(zip.readFile('assets/product.webp')).toEqual(Buffer.from('image bytes'))
  expect(manifest.warnings.join('\n')).not.toMatch(/no native layers/i)
})

it('falls back to baked fidelity for hostile native asset traversal without collecting it', async () => {
  const source = await movie()
  const sourceIdentity = await stat(source)
  const secret = Buffer.from('secret')
  await writeFile(join(root, 'secret.png'), secret)
  const result = await buildEditablePackage({
    workspaceDir,
    outputDir,
    videoRel: 'selected.mov',
    format: 'after-effects',
    title: 'Unsafe native',
    nativeLayers: {
      version: 1,
      stage: { width: 64, height: 48 },
      fps: 30,
      frames: 30,
      sourceBytes: sourceIdentity.size,
      sourceMtimeMs: sourceIdentity.mtimeMs,
      sourceSha256: await sha256(source),
      layers: [
        {
          id: 'x',
          name: 'x',
          shotId: 'x',
          kind: 'image',
          asset: '../secret.png',
          assetSha256: createHash('sha256').update(secret).digest('hex'),
          box: { width: 1, height: 1 },
          inFrame: 0,
          outFrame: 1,
          keys: {
            position: [[0, 0, 0]],
            scale: [[0, 100, 100]],
            rotation: [[0, 0]],
            opacity: [[0, 100]],
          },
          warnings: [],
        },
      ],
      warnings: [],
    },
  })
  expect(result.manifest.native).toBeUndefined()
  expect(result.manifest.warnings).toContain(
    'Native layer metadata is invalid; exported baked fidelity only.',
  )
  const zip = new AdmZip(await readFile(result.file))
  expect(zip.getEntries().map(entry => entry.entryName)).not.toContain('assets/secret.png')
  expect(zip.getEntries().some(entry => entry.getData().equals(secret))).toBe(false)
})

it('falls back to baked fidelity for malformed native timing and key data', async () => {
  const source = await movie()
  const sourceIdentity = await stat(source)
  for (const nativeLayers of [
    {
      version: 1,
      stage: { width: 64, height: 48 },
      fps: 29,
      frames: 30,
      sourceBytes: sourceIdentity.size,
      sourceMtimeMs: sourceIdentity.mtimeMs,
      sourceSha256: await sha256(source),
      layers: [],
      warnings: [],
    },
    {
      version: 1,
      stage: { width: 64, height: 48 },
      fps: 30,
      frames: 30,
      sourceBytes: sourceIdentity.size,
      sourceMtimeMs: sourceIdentity.mtimeMs,
      sourceSha256: await sha256(source),
      layers: [
        {
          id: 'bad',
          name: 'bad',
          shotId: 'bad',
          kind: 'text',
          text: 'bad',
          box: { width: 1, height: 1 },
          inFrame: 0,
          outFrame: 2,
          font: {
            family: '',
            style: '',
            weight: '',
            size: 1,
            lineHeight: 1,
            tracking: 0,
            color: 'red',
            align: 'left',
          },
          keys: {
            position: [
              [1, 0, 0],
              [0, 1, 1],
            ],
            scale: [[0, 100]],
            rotation: [[0, 0]],
            opacity: [[0, 100]],
          },
          warnings: [],
        },
      ],
      warnings: [],
    },
  ] as any[]) {
    const result = await buildEditablePackage({
      workspaceDir,
      outputDir,
      videoRel: 'selected.mov',
      format: 'after-effects',
      title: 'Bad',
      nativeLayers,
    })
    expect(result.manifest.native).toBeUndefined()
    expect(result.manifest.warnings).toContain(
      'Native layer metadata is invalid; exported baked fidelity only.',
    )
  }
})

it('falls back to baked fidelity when native image bytes do not match their digest', async () => {
  const source = await movie()
  const sourceIdentity = await stat(source)
  await mkdir(join(workspaceDir, 'uploads'))
  const asset = join(workspaceDir, 'uploads', 'product.png')
  const original = Buffer.from('original image')
  await writeFile(asset, original)
  const assetSha256 = createHash('sha256').update(original).digest('hex')
  await writeFile(asset, 'mutated image')

  const result = await buildEditablePackage({
    workspaceDir,
    outputDir,
    videoRel: 'selected.mov',
    format: 'after-effects',
    title: 'Changed asset',
    nativeLayers: {
      version: 1,
      stage: { width: 64, height: 48 },
      fps: 30,
      frames: 30,
      sourceBytes: sourceIdentity.size,
      sourceMtimeMs: sourceIdentity.mtimeMs,
      sourceSha256: await sha256(source),
      layers: [
        {
          id: 'image',
          name: 'Image',
          shotId: 'shot',
          kind: 'image',
          asset: 'uploads/product.png',
          assetSha256,
          box: { width: 10, height: 10 },
          inFrame: 0,
          outFrame: 30,
          keys: {
            position: [[0, 0, 0]],
            scale: [[0, 100, 100]],
            rotation: [[0, 0]],
            opacity: [[0, 100]],
          },
          warnings: [],
        },
      ],
      warnings: [],
    },
  })

  expect(result.manifest.native).toBeUndefined()
  expect(new AdmZip(await readFile(result.file)).getEntry('assets/product.png')).toBeNull()
})

it('binds native metadata to the copied movie snapshot identity', async () => {
  const source = await movie()
  const identity = await stat(source)
  const result = await buildEditablePackage({
    workspaceDir,
    outputDir,
    videoRel: 'selected.mov',
    format: 'after-effects',
    title: 'Stale native',
    nativeLayers: {
      version: 1,
      stage: { width: 64, height: 48 },
      fps: 30,
      frames: 30,
      sourceBytes: identity.size + 1,
      sourceMtimeMs: identity.mtimeMs,
      sourceSha256: await sha256(source),
      layers: [],
      warnings: [],
    },
  })

  expect(result.manifest.native).toBeUndefined()
  expect(result.manifest.warnings).toContain(
    'Native layer metadata is invalid; exported baked fidelity only.',
  )
})

it('falls back to baked fidelity when native metadata names a different movie digest', async () => {
  const source = await movie()
  const identity = await stat(source)
  const result = await buildEditablePackage({
    workspaceDir,
    outputDir,
    videoRel: 'selected.mov',
    format: 'after-effects',
    title: 'Wrong digest',
    nativeLayers: {
      version: 1,
      stage: { width: 64, height: 48 },
      fps: 30,
      frames: 30,
      sourceBytes: identity.size,
      sourceMtimeMs: identity.mtimeMs,
      sourceSha256: '0'.repeat(64),
      layers: [],
      warnings: [],
    },
  })

  expect(result.manifest.native).toBeUndefined()
  expect(result.manifest.warnings).toContain(
    'Native layer metadata is invalid; exported baked fidelity only.',
  )
})

it('extracts the selected movie stereo mix as 24-bit PCM, retaining delayed onset and channel waveforms', async () => {
  await movie('sound.mov', [
    '-itsoffset',
    '0.2',
    '-f',
    'lavfi',
    '-i',
    'aevalsrc=0.25*sin(2*PI*440*t)|0.125*sin(2*PI*880*t):s=48000:d=0.7',
    '-c:a',
    'pcm_s24le',
  ])
  const { file, manifest } = await buildEditablePackage({
    workspaceDir,
    outputDir,
    videoRel: 'sound.mov',
    format: 'after-effects',
    title: 'Sound',
  })
  expect(manifest.audio).toEqual({ file: 'media/soundtrack.wav', channels: 2, sampleRate: 48000 })
  const zip = new AdmZip(await readFile(file))
  const wav = join(root, 'sound.wav')
  await writeFile(wav, zip.readFile('media/soundtrack.wav')!)
  const { stdout } = await exec('ffmpeg', ['-v', 'error', '-i', wav, '-f', 'f32le', '-'], {
    encoding: 'buffer',
  })
  const sample = (frame: number, channel: number) => stdout.readFloatLE((frame * 2 + channel) * 4)
  expect(stdout.length / 8).toBeGreaterThanOrEqual(43200)
  expect(stdout.length / 8).toBeLessThanOrEqual(48000)
  for (const frame of [0, 4000, 9500]) expect(sample(frame, 0)).toBe(0)
  for (let frame = 10000; frame < 20000; frame += 137) {
    const time = (frame - 9600) / 48000
    expect(sample(frame, 0)).toBeCloseTo(0.25 * Math.sin(2 * Math.PI * 440 * time), 5)
    expect(sample(frame, 1)).toBeCloseTo(0.125 * Math.sin(2 * Math.PI * 880 * time), 5)
  }
})

it('normalizes fractional-fps marks into contiguous frame cuts with bounded labels and authoritative ends', async () => {
  await movie('fractional.mp4', [], '30000/1001', 61)
  const { manifest } = await buildEditablePackage({
    workspaceDir,
    outputDir,
    videoRel: 'fractional.mp4',
    format: 'blender',
    title: 'Cuts',
    marks: [
      { start: Number.NaN },
      { start: Number.POSITIVE_INFINITY },
      { start: -5, label: 'Intro' },
      { start: 0.5, label: 'x'.repeat(500) },
      { start: 0.50001 },
      { start: 1.5, label: 'Last' },
      { start: 500 },
    ],
  })
  expect(manifest.video.fps).toEqual({ num: 30000, den: 1001 })
  expect(manifest.video.frames).toBe(61)
  expect(manifest.cuts).toEqual([
    { label: 'Intro', start: 0, end: 15 },
    { label: 'x'.repeat(200), start: 15, end: 45 },
    { label: 'Last', start: 45, end: 61 },
  ])
  expect(manifest.warnings.join('\n')).toMatch(/marks.*beat/i)
})

it('rejects traversal, symlink escapes and non-files without collecting or leaving staging files', async () => {
  await movie()
  await symlink(workspaceDir, join(workspaceDir, 'inside'))
  await symlink(root, join(workspaceDir, 'escape'))
  await symlink(join(workspaceDir, 'selected.mov'), join(workspaceDir, 'link.mov'))
  for (const videoRel of [
    '../workspace/selected.mov',
    join(workspaceDir, 'selected.mov'),
    'escape/workspace/selected.mov',
    'link.mov',
    '.',
  ]) {
    await expect(
      buildEditablePackage({
        workspaceDir,
        outputDir,
        videoRel,
        format: 'premiere',
        title: 'Unsafe',
      }),
    ).rejects.toThrow(/workspace|symlink|regular file/i)
    expect(await readdir(outputDir)).toEqual([])
  }
})

it('honors cancellation before IO and during probing, cleaning staging and partial archives', async () => {
  const controller = new AbortController()
  controller.abort()
  await expect(
    buildEditablePackage({
      workspaceDir,
      outputDir,
      videoRel: 'absent.mp4',
      format: 'premiere',
      title: 'Cancel',
      signal: controller.signal,
    }),
  ).rejects.toMatchObject({ name: 'AbortError' })
  await movie('long.mp4', [], '60', 600)
  const running = new AbortController()
  const pending = buildEditablePackage({
    workspaceDir,
    outputDir,
    videoRel: 'long.mp4',
    format: 'premiere',
    title: 'Cancel',
    signal: running.signal,
  })
  const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' })
  while (!(await readdir(outputDir)).includes('source.snapshot'))
    await new Promise(resolve => setTimeout(resolve, 1))
  await new Promise(resolve => setTimeout(resolve, 30))
  running.abort()
  await rejected
  expect(await readdir(outputDir)).toEqual([])
})

it('rejects unsupported codecs explicitly instead of transcoding', async () => {
  await exec('ffmpeg', [
    '-v',
    'error',
    '-f',
    'lavfi',
    '-i',
    'testsrc2=size=64x48:rate=24',
    '-frames:v',
    '24',
    '-c:v',
    'mpeg4',
    join(workspaceDir, 'unsupported.mp4'),
  ])
  await expect(
    buildEditablePackage({
      workspaceDir,
      outputDir,
      videoRel: 'unsupported.mp4',
      format: 'premiere',
      title: 'Unsupported',
    }),
  ).rejects.toThrow(/codec.*mpeg4.*H.?264.*HEVC/i)
  expect(await readdir(outputDir)).toEqual([])
})

it('rejects non-square pixels, rotation and HDR rather than changing display appearance', async () => {
  await movie('sar.mp4', ['-vf', 'setsar=2'])
  await movie('hdr.mp4', [
    '-color_trc',
    'smpte2084',
    '-color_primaries',
    'bt2020',
    '-colorspace',
    'bt2020nc',
  ])
  const source = await movie()
  await exec('ffmpeg', [
    '-v',
    'error',
    '-display_rotation:v:0',
    '90',
    '-i',
    source,
    '-c',
    'copy',
    join(workspaceDir, 'rotation.mp4'),
  ])
  for (const videoRel of ['sar.mp4', 'rotation.mp4', 'hdr.mp4']) {
    await expect(
      buildEditablePackage({
        workspaceDir,
        outputDir,
        videoRel,
        format: 'blender',
        title: 'Appearance',
      }),
      videoRel,
    ).rejects.toThrow(/geometry|rotation|HDR/i)
    expect(await readdir(outputDir)).toEqual([])
  }
})

it('rejects variable frame timing even when nominal and average rates agree', async () => {
  await movie(
    'vfr.mp4',
    [
      '-vf',
      "settb=1/120,setpts='(N+if(eq(mod(N,2),1),0.25,0))/(30*TB)'",
      '-fps_mode',
      'vfr',
      '-enc_time_base',
      '1/120',
    ],
    '30',
    31,
  )
  await expect(
    buildEditablePackage({
      workspaceDir,
      outputDir,
      videoRel: 'vfr.mp4',
      format: 'after-effects',
      title: 'VFR',
    }),
  ).rejects.toThrow(/variable|VFR|CFR/i)
  expect(await readdir(outputDir)).toEqual([])
})

it('rejects multiple audio streams and surround mixes instead of choosing or downmixing them', async () => {
  await movie('surround.mov', ['-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=5.1', '-c:a', 'pcm_s24le'])
  await movie('multiple.mov', [
    '-f',
    'lavfi',
    '-i',
    'anullsrc=r=48000:cl=stereo',
    '-map',
    '0:v',
    '-map',
    '1:a',
    '-map',
    '1:a',
    '-c:a',
    'pcm_s24le',
  ])
  for (const videoRel of ['surround.mov', 'multiple.mov']) {
    await expect(
      buildEditablePackage({ workspaceDir, outputDir, videoRel, format: 'premiere', title: 'Mix' }),
    ).rejects.toThrow(/audio.*(stream|channel).*(1|2|one|two)/i)
    expect(await readdir(outputDir)).toEqual([])
  }
})

it('rejects empty and over-128-MiB inputs before probing or allocating archive media', async () => {
  const handle = await open(join(workspaceDir, 'large.mp4'), 'w')
  await handle.truncate(128 * 1024 * 1024 + 1)
  await handle.close()
  await writeFile(join(workspaceDir, 'empty.mp4'), '')
  for (const videoRel of ['large.mp4', 'empty.mp4']) {
    await expect(
      buildEditablePackage({
        workspaceDir,
        outputDir,
        videoRel,
        format: 'premiere',
        title: 'Size',
      }),
    ).rejects.toThrow(/empty|128 MiB/i)
    expect(await readdir(outputDir)).toEqual([])
  }
})

it('enforces the 30-minute duration and 8192-pixel dimension caps before decoding', async () => {
  await movie('long.mp4', [], '1/1801', 2)
  await exec('ffmpeg', [
    '-v',
    'error',
    '-f',
    'lavfi',
    '-i',
    'color=size=8194x2:rate=24',
    '-frames:v',
    '1',
    '-c:v',
    'libx264',
    '-threads',
    '1',
    join(workspaceDir, 'wide.mp4'),
  ])
  for (const [videoRel, error] of [
    ['long.mp4', /30.min/i],
    ['wide.mp4', /8192/],
  ] as const) {
    await expect(
      buildEditablePackage({ workspaceDir, outputDir, videoRel, format: 'blender', title: 'Caps' }),
    ).rejects.toThrow(error)
    expect(await readdir(outputDir)).toEqual([])
  }
})

it('rejects audio expansion beyond the 192-MiB combined archive-media cap', async () => {
  await exec('ffmpeg', [
    '-v',
    'error',
    '-f',
    'lavfi',
    '-i',
    'color=size=16x16:rate=1',
    '-f',
    'lavfi',
    '-i',
    'anullsrc=r=48000:cl=stereo',
    '-t',
    '710',
    '-c:v',
    'libx264',
    '-threads',
    '1',
    '-c:a',
    'alac',
    join(workspaceDir, 'expanded.mov'),
  ])
  await expect(
    buildEditablePackage({
      workspaceDir,
      outputDir,
      videoRel: 'expanded.mov',
      format: 'premiere',
      title: 'Expansion',
    }),
  ).rejects.toThrow(/192 MiB/)
  expect(await readdir(outputDir)).toEqual([])
}, 30_000)

it('does not follow playlist references to other media or accept corrupt movies', async () => {
  const source = await movie()
  await writeFile(join(outputDir, 'external.mov'), await readFile(source))
  await writeFile(join(workspaceDir, 'playlist.mp4'), "ffconcat version 1.0\nfile 'external.mov'\n")
  await writeFile(join(workspaceDir, 'broken.mp4'), 'not a movie')
  for (const videoRel of ['playlist.mp4', 'broken.mp4']) {
    await expect(
      buildEditablePackage({
        workspaceDir,
        outputDir,
        videoRel,
        format: 'premiere',
        title: 'Invalid',
      }),
    ).rejects.toThrow(/unsupported|invalid|probe/i)
    expect(await readdir(outputDir)).toEqual(['external.mov'])
  }
})

it('rejects ambiguous multiple-video movies instead of silently selecting a view', async () => {
  await movie('views.mov', ['-map', '0:v', '-map', '0:v'])
  await expect(
    buildEditablePackage({
      workspaceDir,
      outputDir,
      videoRel: 'views.mov',
      format: 'premiere',
      title: 'Views',
    }),
  ).rejects.toThrow(/one video|1 video|multiple video/i)
})

it('preserves HEVC pixels and typical integer and NTSC CFR frame counts', async () => {
  for (const rate of ['24', '30', '60', '24000/1001', '60000/1001']) {
    await movie('rate.mp4', [], rate, 12)
    const { manifest } = await buildEditablePackage({
      workspaceDir,
      outputDir,
      videoRel: 'rate.mp4',
      format: 'premiere',
      title: rate,
    })
    expect(manifest.video.frames).toBe(12)
    const [num, den = 1] = rate.split('/').map(Number)
    expect(manifest.video.fps).toEqual({ num, den })
  }
  const hevc = join(workspaceDir, 'hevc.mov')
  await exec('ffmpeg', [
    '-v',
    'error',
    '-f',
    'lavfi',
    '-i',
    'testsrc2=size=64x48:rate=24',
    '-frames:v',
    '12',
    '-c:v',
    'libx265',
    '-x265-params',
    'pools=none:frame-threads=1:log-level=error',
    hevc,
  ])
  const { file, manifest } = await buildEditablePackage({
    workspaceDir,
    outputDir,
    videoRel: 'hevc.mov',
    format: 'premiere',
    title: 'HEVC',
  })
  expect(manifest.video.frames).toBe(12)
  const packaged = join(root, 'hevc.mp4')
  await writeFile(packaged, new AdmZip(await readFile(file)).readFile('media/video.mp4')!)
  expect(await pixels(packaged)).toBe(await pixels(hevc))
}, 30_000)

it('rejects a video starting after the container origin rather than shifting its audio against the picture', async () => {
  await movie('offset.mov', [
    '-f',
    'lavfi',
    '-i',
    'anullsrc=r=48000:cl=mono',
    '-vf',
    'setpts=PTS+0.2/TB',
    '-fps_mode',
    'passthrough',
    '-c:a',
    'pcm_s24le',
  ])
  await expect(
    buildEditablePackage({
      workspaceDir,
      outputDir,
      videoRel: 'offset.mov',
      format: 'after-effects',
      title: 'Offset',
    }),
  ).rejects.toThrow(/origin|start time/i)
})

it('rejects a selected movie modified while its snapshot is being copied', async () => {
  const source = await movie()
  const handle = await open(source, 'r+')
  await handle.truncate(64 * 1024 * 1024)
  const pending = buildEditablePackage({
    workspaceDir,
    outputDir,
    videoRel: 'selected.mov',
    format: 'premiere',
    title: 'Changing',
  })
  const rejected = expect(pending).rejects.toThrow(/changed.*snapshot/i)
  try {
    while (!(await readdir(outputDir)).includes('source.snapshot'))
      await new Promise(resolve => setTimeout(resolve, 1))
    await handle.write(Buffer.from('changed'), 0, 7, 63 * 1024 * 1024)
    await rejected
    expect(await readdir(outputDir)).toEqual([])
  } finally {
    await handle.close()
  }
})
